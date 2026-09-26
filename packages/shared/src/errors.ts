export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INSUFFICIENT_STOCK: 409,
  BALANCE_CHANGED: 409,
  NOT_READY: 409,
  INVALID_TRANSITION: 409,
  STALE_VERSION: 409,
  SKU_TAKEN: 409,
  EMAIL_TAKEN: 409,
  /** Any other unique field (warehouse code, category name...); details.fields names it. */
  ALREADY_EXISTS: 409,
  IN_USE: 409,
  INVALID_LOCATION_FOR_TYPE: 422,
  SAME_LOCATION: 422,
  INACTIVE_REFERENCE: 422,
  UOM_PRECISION: 422,
  UOM_LOCKED: 422,
  OTP_INVALID: 422,
  OTP_EXPIRED: 422,
  LAST_MANAGER: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  BUSY_RETRY: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
}

/** One failing line in an INSUFFICIENT_STOCK error. The form marks exactly these lines red. */
export interface ShortLine {
  productId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationName: string;
  requested: string;
  available: string;
}

/** One line in a BALANCE_CHANGED error: the count was taken against an older balance. */
export interface ChangedBalance {
  productId: string;
  sku: string;
  productName: string;
  counted: string;
  balanceAtCount: string;
  currentBalance: string;
}
