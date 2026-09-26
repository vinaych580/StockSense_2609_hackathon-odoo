/**
 * Response shapes the API returns and the web app renders. Quantities are decimal strings
 * ("12.500"), dates are ISO strings. Every versioned record carries `version`; send it back on changes.
 */
import type { LocationType, OperationStatus, OperationType, Uom } from './enums';

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
