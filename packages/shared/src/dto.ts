/**
 * Response shapes the API returns and the web app renders. Quantities are decimal strings
 * ("12.500"), dates are ISO strings. Every versioned record carries `version`; send it back on changes.
 */
import type { LocationType, OperationStatus, OperationType, PartnerKind, Role, Uom } from './enums';
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

/** GET /categories. */
export interface CategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /warehouses. */
export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /locations. warehouseId is null for the three system virtual locations. */
export interface LocationDto {
  id: string;
  warehouseId: string | null;
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /partners. */
export interface PartnerDto {
  id: string;
  name: string;
  kind: PartnerKind;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /products. */
export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  category: { id: string; name: string } | null;
  uom: Uom;
  unitCost: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /reorder-rules. */
export interface ReorderRuleDto {
  id: string;
  product: { id: string; sku: string; name: string };
  warehouse: { id: string; code: string; name: string };
  minQty: string;
  maxQty: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /users. See MeDto for the logged-in user's own record. */
export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
