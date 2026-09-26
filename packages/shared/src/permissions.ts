import type { OperationType, Role } from './enums';
import type { OperationAction } from './transitions';

/** Capabilities outside the operation documents. */
export const PERMISSIONS = {
  'dashboard.view': ['MANAGER', 'STAFF'],
  'stock.view': ['MANAGER', 'STAFF'],
  'masterdata.view': ['MANAGER', 'STAFF'],
  'masterdata.edit': ['MANAGER'],
  'users.manage': ['MANAGER'],
  'ledger.integrity': ['MANAGER'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Operation capabilities: 'create' plus every state-machine action. */
export type OperationCapability = 'create' | OperationAction;

const ALL: readonly Role[] = ['MANAGER', 'STAFF'];
const MGR: readonly Role[] = ['MANAGER'];

function grant(
  defaults: readonly Role[],
  overrides: Partial<Record<OperationCapability, readonly Role[]>>,
): Record<OperationCapability, readonly Role[]> {
  const caps: OperationCapability[] = [
    'create', 'edit', 'confirm', 'check-availability', 'reset-to-draft',
    'pick', 'unpick', 'pack', 'unpack', 'validate', 'cancel',
  ];
  return Object.fromEntries(caps.map((c) => [c, overrides[c] ?? defaults])) as Record<
    OperationCapability,
    readonly Role[]
  >;
}

const OPERATION_PERMISSIONS: Record<OperationType, Record<OperationCapability, readonly Role[]>> = {
  // Staff receive the goods (validate); Managers plan receipts.
  RECEIPT: grant(MGR, { validate: ALL }),
  // Staff pick and pack; Managers plan, ship and cancel.
  DELIVERY: grant(MGR, { pick: ALL, unpick: ALL, pack: ALL, unpack: ALL }),
  TRANSFER: grant(ALL, {}),
  // Staff count; only Managers post the difference, since it writes off or adds stock.
  ADJUSTMENT: grant(ALL, { validate: MGR }),
};

export function canOperate(role: Role, capability: OperationCapability, type: OperationType): boolean {
  return OPERATION_PERMISSIONS[type][capability].includes(role);
}
