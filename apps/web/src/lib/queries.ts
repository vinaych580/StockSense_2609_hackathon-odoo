import type {
  CategoryDto,
  DashboardDto,
  LocationDto,
  MoveDto,
  OperationActionResponse,
  OperationDto,
  OperationType,
  PartnerDto,
  ProductDto,
  StockRowDto,
  WarehouseDto,
} from '@stocksense/shared';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, type Query } from './api';
import { buildProducts } from './domain';

export const keys = {
  operations: (q?: Query) => ['operations', q ?? {}] as const,
  operation: (id: string) => ['operation', id] as const,
  moves: (q?: Query) => ['moves', q ?? {}] as const,
};

export function useOperations(q: Query) {
  return useQuery({
    queryKey: keys.operations(q),
    queryFn: () => api.list<OperationDto>('/operations', q),
    placeholderData: (prev) => prev,
  });
}

export function useOperation(id: string) {
  return useQuery({ queryKey: keys.operation(id), queryFn: () => api.get<OperationDto>(`/operations/${id}`), enabled: !!id });
}

/** Every product (archived included) with its balances, rules and stock health. */
export function useProducts() {
  return useQuery({
    queryKey: ['stock', 'products'],
    queryFn: async () => {
      const [master, rows] = await Promise.all([
        api.list<ProductDto>('/products', { active: 'all', pageSize: 100 }),
        api.list<StockRowDto>('/stock', { includeZero: true, pageSize: 100 }),
      ]);
      // Seeded data fits one page; fetch the rest if a catalog outgrows it.
      const more = async <T,>(path: string, first: { data: T[]; page: { total: number } }, q: Query) => {
        const all = [...first.data];
        for (let page = 2; all.length < first.page.total; page++) all.push(...(await api.list<T>(path, { ...q, page, pageSize: 100 })).data);
        return all;
      };
      return buildProducts(
        await more('/products', master, { active: 'all' }),
        await more('/stock', rows, { includeZero: true }),
      );
    },
  });
}

export function useMoves(q: Query, enabled = true) {
  return useQuery({
    queryKey: keys.moves(q),
    queryFn: () => api.list<MoveDto>('/moves', q),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/** Open and late work per type, for the register and the floor. */
export function useQueueCounts() {
  return useQuery({
    queryKey: ['operations', 'queue-counts'],
    queryFn: async () => {
      const types: OperationType[] = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'];
      const results = await Promise.all(
        types.map(async (type) => {
          const [open, late] = await Promise.all([
            api.list<OperationDto>('/operations', { type, status: 'DRAFT,WAITING,READY', pageSize: 1 }),
            api.list<OperationDto>('/operations', { type, status: 'DRAFT,WAITING,READY', late: true, pageSize: 1 }),
          ]);
          return [type, { open: open.page.total, late: late.page.total }] as const;
        }),
      );
      return Object.fromEntries(results) as Record<OperationType, { open: number; late: number }>;
    },
  });
}

export function useWarehouses() {
  return useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<WarehouseDto[]>('/warehouses', { active: 'all' }) });
}

export function useLocations(includeVirtual = false) {
  return useQuery({
    queryKey: ['locations', includeVirtual],
    queryFn: () => api.get<LocationDto[]>('/locations', { includeVirtual: includeVirtual ? 'true' : undefined }),
  });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryDto[]>('/categories', { active: 'all' }) });
}

export function usePartners(q: Query) {
  return useQuery({
    queryKey: ['partners', q],
    queryFn: () => api.list<PartnerDto>('/partners', q),
    placeholderData: (prev) => prev,
  });
}

/** A write that refreshes the listed caches when it lands. */
export function useWrite<TVars, TData = unknown>(fn: (v: TVars) => Promise<TData>, invalidate: QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useOperationAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, version, acknowledgeBalanceChange }: { action: string; version: number; acknowledgeBalanceChange?: boolean }) =>
      api.post<OperationActionResponse>(`/operations/${id}/${action}`, { version, acknowledgeBalanceChange }),
    onSuccess: (res) => {
      qc.setQueryData(keys.operation(id), res.operation);
      void qc.invalidateQueries({ queryKey: ['operations'] });
      if (res.posted) {
        void qc.invalidateQueries({ queryKey: ['stock'] });
        void qc.invalidateQueries({ queryKey: ['moves'] });
      }
    },
  });
}

/** KPIs and alerts, narrowed by warehouse, location and category. */
export function useDashboard(q: Query = {}) {
  return useQuery({
    queryKey: ['dashboard', q],
    queryFn: () => api.get<DashboardDto>('/dashboard', q),
    placeholderData: (prev) => prev,
  });
}

export interface IntegrityReport {
  ok: boolean;
  balancesChecked: number;
  movesChecked: number;
  mismatches: { productId: string; locationId: string; expected: string; actual: string }[];
  checkedAt: string;
}

/** Managers only: every balance re-derived from the ledger, on the server. */
export function useIntegrity(enabled: boolean) {
  return useQuery({
    queryKey: ['stock', 'integrity'],
    queryFn: () => api.get<IntegrityReport>('/dashboard/integrity'),
    enabled,
  });
}
