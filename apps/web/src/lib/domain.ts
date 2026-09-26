/** Names, routes and stock-health rules the whole UI shares. */
import type { OperationStatus, OperationType, ProductDto, ReorderRuleDto, StockRowDto, Uom } from '@stocksense/shared';

export const TYPE_META: Record<OperationType, { label: string; plural: string; path: string; code: string; partner?: string }> = {
  RECEIPT: { label: 'Receipt', plural: 'Receipts', path: 'receipts', code: 'IN', partner: 'Supplier' },
  DELIVERY: { label: 'Delivery', plural: 'Deliveries', path: 'deliveries', code: 'OUT', partner: 'Customer' },
  TRANSFER: { label: 'Transfer', plural: 'Transfers', path: 'transfers', code: 'INT' },
  ADJUSTMENT: { label: 'Adjustment', plural: 'Adjustments', path: 'adjustments', code: 'ADJ' },
};

export const TYPES = Object.keys(TYPE_META) as OperationType[];

export const SHEET_GROUPS = ['Inventory', 'Operations', 'Settings'] as const;

/**
 * The drawing register: every screen is a numbered sheet you can jump to with g + its digit.
 * `hint` is the plain name a newcomer would look for (the Floor is the dashboard).
 */
export const SHEETS: {
  no: number;
  label: string;
  hint: string;
  path: string;
  group: (typeof SHEET_GROUPS)[number];
  type?: OperationType;
  manager?: boolean;
}[] = [
  { no: 1, label: 'Floor', hint: 'Dashboard', path: '/', group: 'Inventory' },
  { no: 2, label: 'Stock', hint: 'Products and categories', path: '/stock', group: 'Inventory' },
  { no: 3, label: 'Ledger', hint: 'Move history', path: '/ledger', group: 'Inventory' },
  { no: 4, label: 'Receipts', hint: 'Incoming stock', path: '/receipts', group: 'Operations', type: 'RECEIPT' },
  { no: 5, label: 'Deliveries', hint: 'Outgoing stock', path: '/deliveries', group: 'Operations', type: 'DELIVERY' },
  { no: 6, label: 'Transfers', hint: 'Internal moves', path: '/transfers', group: 'Operations', type: 'TRANSFER' },
  { no: 7, label: 'Adjustments', hint: 'Physical counts', path: '/adjustments', group: 'Operations', type: 'ADJUSTMENT' },
  { no: 8, label: 'Warehouses', hint: 'Warehouses and locations', path: '/warehouses', group: 'Settings' },
  { no: 9, label: 'Contacts', hint: 'Suppliers and customers', path: '/contacts', group: 'Settings' },
  { no: 10, label: 'Team', hint: 'Users and roles', path: '/team', group: 'Settings', manager: true },
];

export const sheetNo = (n: number) => `S-${String(n).padStart(2, '0')}`;

export function sheetFor(pathname: string) {
  const first = '/' + (pathname.split('/')[1] ?? '');
  return SHEETS.find((s) => s.path === first) ?? SHEETS[0]!;
}

export const STATUS_LABEL: Record<OperationStatus, string> = {
  DRAFT: 'Draft',
  WAITING: 'Waiting',
  READY: 'Ready',
  DONE: 'Done',
  CANCELED: 'Canceled',
};

/** The steps of a document's life. Waiting shares Ready's slot. */
export function stepsFor(type: OperationType): { key: string; label: string }[] {
  if (type === 'DELIVERY')
    return [
      { key: 'DRAFT', label: 'Draft' },
      { key: 'READY', label: 'Ready' },
      { key: 'PICKED', label: 'Picked' },
      { key: 'PACKED', label: 'Packed' },
      { key: 'DONE', label: 'Done' },
    ];
  return [
    { key: 'DRAFT', label: 'Draft' },
    { key: 'READY', label: 'Ready' },
    { key: 'DONE', label: 'Done' },
  ];
}

export type Health = 'OUT' | 'SHORT' | 'LOW' | 'OK';

export interface Figures {
  onHand: number;
  incoming: number;
  outgoing: number;
  freeToUse: number;
  forecast: number;
}

/** One product across every location: master data plus its balances. */
export interface ProductStock {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  category: string | null;
  categoryId: string | null;
  unitCost: string | null;
  isActive: boolean;
  uomEditable: boolean;
  onHand: number;
  incoming: number;
  outgoing: number;
  freeToUse: number;
  forecast: number;
  locations: { id: string; label: string; warehouseId: string; onHand: number }[];
  byWarehouse: Record<string, number>;
  /** Every figure per warehouse, for the stock dimension. */
  wh: Record<string, Figures>;
  rules: ReorderRuleDto[];
  /** The reorder rule that tripped, when the product is low. */
  lowRule: ReorderRuleDto | null;
  health: Health;
}

/** Low means a reorder rule's minimum has been reached in its warehouse. No rule, no "low". */
function healthOf(p: ProductStock): Health {
  if (p.onHand <= 0) return 'OUT';
  if (p.freeToUse < 0) return 'SHORT';
  if (p.lowRule) return 'LOW';
  return 'OK';
}

export function buildProducts(master: ProductDto[], rows: StockRowDto[]): ProductStock[] {
  const map = new Map<string, ProductStock>();
  for (const m of master) {
    map.set(m.id, {
      id: m.id,
      sku: m.sku,
      name: m.name,
      uom: m.uom,
      category: m.category?.name ?? null,
      categoryId: m.category?.id ?? null,
      unitCost: m.unitCost,
      isActive: m.isActive,
      uomEditable: m.uomEditable,
      onHand: 0,
      incoming: 0,
      outgoing: 0,
      freeToUse: 0,
      forecast: 0,
      locations: [],
      byWarehouse: {},
      wh: {},
      rules: m.reorderRules,
      lowRule: null,
      health: 'OK',
    });
  }
  for (const r of rows) {
    const p = map.get(r.product.id);
    if (!p) continue;
    const onHand = Number(r.onHand);
    p.onHand += onHand;
    p.incoming += Number(r.incoming);
    p.outgoing += Number(r.outgoing);
    p.freeToUse += Number(r.freeToUse);
    p.forecast += Number(r.forecast);
    p.byWarehouse[r.location.warehouseId] = (p.byWarehouse[r.location.warehouseId] ?? 0) + onHand;
    const f = (p.wh[r.location.warehouseId] ??= { onHand: 0, incoming: 0, outgoing: 0, freeToUse: 0, forecast: 0 });
    f.onHand += onHand;
    f.incoming += Number(r.incoming);
    f.outgoing += Number(r.outgoing);
    f.freeToUse += Number(r.freeToUse);
    f.forecast += Number(r.forecast);
    if (onHand !== 0) p.locations.push({ id: r.location.id, label: r.location.label, warehouseId: r.location.warehouseId, onHand });
  }
  const list = [...map.values()];
  for (const p of list) {
    p.lowRule = p.rules.find((r) => (p.byWarehouse[r.warehouseId] ?? 0) <= Number(r.minQty)) ?? null;
    p.health = healthOf(p);
  }
  return list.sort((a, b) => a.sku.localeCompare(b.sku));
}

export const HEALTH_LABEL: Record<Health, string> = {
  OUT: 'Out of stock',
  SHORT: 'Promised short',
  LOW: 'Low stock',
  OK: 'In stock',
};
