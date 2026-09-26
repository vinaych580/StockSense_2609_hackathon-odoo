import { canOperate, OPERATION_STATUSES, type OperationDto, type OperationType } from '@stocksense/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { FilterBar, FilterDateRange, FilterSearch, FilterSelect, FilterToggle } from '@/components/shared/FilterBar';
import { STATUS_LABEL } from '@/components/shared/status';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useFilterParams, useListParams } from '@/lib/listParams';
import { useCategoryOptions, useLocationOptions, useWarehouseOptions } from '@/lib/masterDataStub';
import { cn } from '@/lib/utils';

import { KANBAN_PAGE_SIZE, OperationKanban } from './OperationKanban';
import { infoForType } from './operationTypes';
import { ViewToggle } from './ViewToggle';

const FILTER_KEYS = ['search', 'status', 'warehouseId', 'locationId', 'categoryId', 'dateFrom', 'dateTo', 'late'] as const;

export function LatePill() {
  return (
    <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-danger uppercase">
      Late
    </span>
  );
}

function columnsFor(hasPartner: boolean): Column<OperationDto>[] {
  const columns: (Column<OperationDto> | false)[] = [
    { id: 'reference', header: 'Reference', sortKey: 'reference', cell: (op) => <span className="ref">{op.reference}</span> },
    {
      id: 'status',
      header: 'Status',
      cell: (op) => (
        <span className="flex items-center gap-2">
          <StatusBadge status={op.status} />
          {op.isLate && <LatePill />}
        </span>
      ),
    },
    {
      id: 'scheduled',
      header: 'Scheduled',
      sortKey: 'scheduledDate',
      cell: (op) => <span className={cn('whitespace-nowrap', op.isLate && 'text-danger')}>{formatDate(op.scheduledDate)}</span>,
    },
    hasPartner && { id: 'partner', header: 'Contact', cell: (op) => op.partner?.name ?? <span className="text-muted">—</span> },
    {
      id: 'route',
      header: 'From → To',
      cell: (op) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-muted">
          {op.source.label}
          <ArrowRight aria-label="to" className="size-3.5" />
          <span className="text-fg">{op.dest.label}</span>
        </span>
      ),
    },
    { id: 'lines', header: 'Lines', align: 'right', cell: (op) => op.lines.length },
    { id: 'created', header: 'Created', sortKey: 'createdAt', cell: (op) => <span className="whitespace-nowrap text-muted">{formatDate(op.createdAt)}</span> },
  ];
  return columns.filter((c): c is Column<OperationDto> => c !== false);
}

/** One list for all four types: receipts, deliveries, transfers and adjustments. */
export function OperationListPage({ type }: { type: OperationType }) {
  const info = infoForType(type);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { page, pageSize, sort, view, setPage, setSort, setView } = useListParams({ defaultSort: '-createdAt' });
  const filters = useFilterParams(FILTER_KEYS);

  const warehouses = useWarehouseOptions();
  const locations = useLocationOptions(filters.warehouseId);
  const categories = useCategoryOptions();
  const statuses = useMemo(
    () => OPERATION_STATUSES.filter((s) => s !== 'WAITING' || info.canWait).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    [info.canWait],
  );

  // A location from another warehouse no longer applies once the warehouse changes.
  const [, setParams] = useSearchParams();
  useEffect(() => {
    if (filters.locationId && !locations.some((l) => l.value === filters.locationId)) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('locationId');
          return next;
        },
        { replace: true },
      );
    }
  }, [filters.locationId, locations, setParams]);

  // One query for both views; only the paging differs. The board takes everything up to the API's maximum.
  const paging = view === 'kanban' ? { page: 1, pageSize: KANBAN_PAGE_SIZE } : { page, pageSize };
  const query = useQuery({
    queryKey: ['operations', 'list', { type, ...filters, ...paging, sort }],
    queryFn: () => api.list<OperationDto>('/operations', { type, ...filters, sort, ...paging }),
    placeholderData: keepPreviousData,
  });

  const filtered = Object.keys(filters).length > 0;
  const emptyMessage = filtered ? `No ${info.plural} match these filters.` : `No ${info.plural} yet.`;
  const canCreate = !!user && canOperate(user.role, 'create', type);
  const columns = useMemo(() => columnsFor(info.hasPartner), [info.hasPartner]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Operations</span>
          <h1 className="text-2xl font-semibold">{info.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onChange={setView} />
          {canCreate && (
            <Button asChild>
              <Link to={`/operations/${info.slug}/new`}>
                <Plus />
                New {info.noun}
              </Link>
            </Button>
          )}
        </div>
      </header>

      <FilterBar>
        <FilterSearch placeholder={info.hasPartner ? 'Reference or contact' : 'Reference'} />
        <FilterSelect name="status" label="Status" options={statuses} />
        <FilterSelect name="warehouseId" label="Warehouse" options={warehouses} />
        <FilterSelect name="locationId" label="Location" options={locations} />
        <FilterSelect name="categoryId" label="Category" options={categories} />
        <FilterDateRange label="Scheduled" />
        <FilterToggle name="late" label="Late" />
      </FilterBar>

      {view === 'kanban' ? (
        <OperationKanban
          info={info}
          data={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyMessage={emptyMessage}
          statusFilter={filters.status}
        />
      ) : (
        <DataTable
          aria-label={info.title}
          columns={columns}
          rows={query.data?.data}
          getRowId={(op) => op.id}
          page={query.data?.page}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyMessage={emptyMessage}
          errorMessage={`Couldn't load ${info.plural}.`}
          onRowClick={(op) => navigate(`/operations/${info.slug}/${op.id}`)}
          rowClassName={(op) => (op.isLate ? 'bg-danger/5 [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-danger' : undefined)}
        />
      )}
    </div>
  );
}
