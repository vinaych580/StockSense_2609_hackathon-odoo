export const ROLES = ['MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const OPERATION_TYPES = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_STATUSES = ['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const LOCATION_TYPES = ['INTERNAL', 'VENDOR', 'CUSTOMER', 'ADJUSTMENT'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const PARTNER_KINDS = ['SUPPLIER', 'CUSTOMER'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

/** Allowed decimal places per unit of measure. Counted units are whole numbers. */
export const UOM_DECIMALS = { UNIT: 0, BOX: 0, KG: 3, L: 3, M: 3 } as const;
export type Uom = keyof typeof UOM_DECIMALS;
export const UOMS = Object.keys(UOM_DECIMALS) as Uom[];

/** Fixed ids of the three virtual locations. ensureSystemData() upserts them after migrations and truncates. */
export const SYSTEM_LOCATION_IDS = {
  VENDOR: '00000000-0000-4000-8000-000000000001',
  CUSTOMER: '00000000-0000-4000-8000-000000000002',
  ADJUSTMENT: '00000000-0000-4000-8000-000000000003',
} as const;

/** Short code used in references like WH1/IN/00012. */
export const OPERATION_REF_CODE: Record<OperationType, string> = {
  RECEIPT: 'IN',
  DELIVERY: 'OUT',
  TRANSFER: 'INT',
  ADJUSTMENT: 'ADJ',
};

/**
 * Which location types each document type accepts at each end.
 * An adjustment's header is always virtual Adjustment → counted location;
 * the direction of each posted move comes from the sign of its difference.
 */
export const LOCATION_RULES: Record<OperationType, { source: LocationType; dest: LocationType }> = {
  RECEIPT: { source: 'VENDOR', dest: 'INTERNAL' },
  DELIVERY: { source: 'INTERNAL', dest: 'CUSTOMER' },
  TRANSFER: { source: 'INTERNAL', dest: 'INTERNAL' },
  ADJUSTMENT: { source: 'ADJUSTMENT', dest: 'INTERNAL' },
};

/** Which partner kind a document type's contact must be, when it has one. */
export const PARTNER_RULES: Partial<Record<OperationType, PartnerKind>> = {
  RECEIPT: 'SUPPLIER',
  DELIVERY: 'CUSTOMER',
};

/** The internal end of a document; its warehouse is the operation's warehouse. */
export const INTERNAL_END: Record<OperationType, 'source' | 'dest'> = {
  RECEIPT: 'dest',
  DELIVERY: 'source',
  TRANSFER: 'source',
  ADJUSTMENT: 'dest',
};
