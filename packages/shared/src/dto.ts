/**
 * Response shapes the API returns and the web app renders. Quantities are decimal strings
 * ("12.500"), dates are ISO strings. Every versioned record carries `version`; send it back on changes.
 */
import type { LocationType, OperationStatus, OperationType, Role, Uom } from './enums';
import type { Permission } from './permissions';

/** One item: { data }. Lists: { data, page }. Errors: see ErrorBody in errors.ts. */
export interface ItemResponse<T> {
  data: T;
}
export interface ListResponse<T> {
  data: T[];
  page: { page: number; pageSize: number; total: number };
}

export interface OperationLineDto {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  uom: Uom;
  productActive: boolean;
  quantity: string | null;
  countedQuantity: string | null;
  balanceAtCount: string | null;
  postedQuantity: string | null;
  /** Current balance at the internal end that the line draws from (source for outgoing, counted location for adjustments). */
  onHand: string | null;
  /** Outgoing lines only, before Done: how much is missing at the source. The form shows these red. */
  shortBy: string | null;
}

export interface OperationDto {
  id: string;
  reference: string;
  type: OperationType;
  status: OperationStatus;
  version: number;
  warehouseId: string;
  source: { id: string; label: string; type: LocationType };
  dest: { id: string; label: string; type: LocationType };
  partner: { id: string; name: string } | null;
  responsible: { id: string; name: string } | null;
  scheduledDate: string | null;
  isLate: boolean;
  pickedAt: string | null;
  packedAt: string | null;
  notes: string | null;
  createdBy: { id: string; name: string };
  validatedBy: { id: string; name: string } | null;
  validatedAt: string | null;
  canceledBy: { id: string; name: string } | null;
  canceledAt: string | null;
  createdAt: string;
  lines: OperationLineDto[];
}


/** What Validate posted. */
export interface PostResult {
  movesPosted: number;
  /** Adjustment lines whose count matched the balance, so nothing was posted. */
  unchangedLines: number;
  productIds: string[];
  warehouseIds: string[];
}

/** Body of every operation action response (POST /operations/:id/<action>). */
export interface OperationActionResponse {
  operation: OperationDto;
  /** Set by validate. */
  posted?: PostResult;
  /** A repeat Validate by the same user after the first succeeded: nothing new happened. */
  replayed?: boolean;
}

/** GET /auth/me, and the body of sign-up and log-in. */
export interface MeDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Every non-operation capability this role has; operation buttons use canOperate(). */
  permissions: Permission[];
}

/** GET /stock: one row per product and internal location. */
export interface StockRowDto {
  product: { id: string; sku: string; name: string; uom: Uom; isActive: boolean; category: { id: string; name: string } | null };
  location: { id: string; label: string; warehouseId: string };
  onHand: string;
  /** Confirmed (Waiting or Ready) deliveries and transfers out of this location. */
  outgoing: string;
  /** Confirmed receipts and transfers into this location. */
  incoming: string;
  /** onHand − outgoing; negative means more is promised than is here. */
  freeToUse: string;
  /** onHand − outgoing + incoming. */
  forecast: string;
}

/** GET /moves: one ledger row. IN comes from outside the warehouses, OUT leaves them, INTERNAL moves between them. */
export interface MoveDto {
  id: string;
  doneAt: string;
  operationId: string;
  reference: string;
  operationType: OperationType;
  product: { id: string; sku: string; name: string; uom: Uom };
  from: { id: string; label: string; type: LocationType };
  to: { id: string; label: string; type: LocationType };
  quantity: string;
  direction: 'IN' | 'OUT' | 'INTERNAL';
  doneBy: { id: string; name: string };
}

// ─── Master data ───────────────────────────────────────────────────────────────────────────

export interface CategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
}

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  unitCost: string | null;
  isActive: boolean;
  category: { id: string; name: string } | null;
  /** Sum over internal locations (within the warehouse filter, on lists that take one). */
  onHand: string;
  /**
   * Dashboard definitions: out = on hand 0, low = a reorder rule at or under its minimum.
   * Null for archived products, and on a warehouse-filtered list for products that warehouse doesn't carry.
   */
  stockStatus: 'ok' | 'low' | 'out' | null;
  /** GET /products/:id only: balance per internal location that has ever held the product. */
  locations?: Array<{ locationId: string; label: string; warehouseId: string; onHand: string }>;
  /** False once the product is on any operation line: its unit can no longer change. */
  uomEditable: boolean;
  reorderRules: ReorderRuleDto[];
  createdAt: string;
  updatedAt: string;
}

export interface LocationDto {
  id: string;
  code: string;
  name: string;
  /** "WH1/Stock", or the bare name for virtual locations. */
  label: string;
  type: LocationType;
  warehouseId: string | null;
  /** False when archived itself or its warehouse is archived. */
  isActive: boolean;
}

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  /** False once the warehouse has documents: references like WH1/IN/00001 embed it. */
  codeEditable: boolean;
  locations: LocationDto[];
}

export interface PartnerDto {
  id: string;
  name: string;
  kind: 'SUPPLIER' | 'CUSTOMER';
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

export interface ReorderRuleDto {
  id: string;
  productId: string;
  warehouseId: string;
  warehouseCode: string;
  minQty: string;
  maxQty: string;
}

/** One problem in an imported CSV. `row` is the 1-based line in the file (the header is row 1). */
export interface ImportIssue {
  row: number;
  column?: string;
  message: string;
}

export interface ProductImportResult {
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  categoriesCreated: string[];
  /** Adjustment documents that posted initial stock for new products. */
  stockOperations: string[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────────────────

/** One reorder rule that is at or under its minimum. */
export interface LowStockRuleDto {
  warehouseId: string;
  warehouseCode: string;
  onHand: string;
  minQty: string;
  maxQty: string;
  /** max − on hand: the quantity a replenishing receipt would bring in. */
  suggestedQty: string;
}

/** One product in the dashboard's low- or out-of-stock list. */
export interface StockAlertDto {
  productId: string;
  sku: string;
  name: string;
  uom: Uom;
  category: { id: string; name: string } | null;
  status: 'low' | 'out';
  /** Within the dashboard's warehouse filter. */
  onHand: string;
  /** The rules at or under their minimum (empty for an out-of-stock product without rules). */
  rules: LowStockRuleDto[];
}

export interface DashboardDto {
  filters: { warehouseId: string | null; locationId: string | null; categoryId: string | null };
  kpis: {
    productsInStock: number;
    lowStock: number;
    outOfStock: number;
    pendingReceipts: { total: number; late: number };
    pendingDeliveries: { total: number; late: number; waiting: number };
    scheduledTransfers: { total: number; late: number };
  };
  /** Low first, then out; each sorted by SKU. The sidebar badge is lowStock + outOfStock. */
  alerts: StockAlertDto[];
  generatedAt: string;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}
