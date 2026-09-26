import type { OperationStatus, OperationType } from './enums';

export const OPERATION_ACTIONS = [
  'edit',
  'confirm',
  'check-availability',
  'reset-to-draft',
  'pick',
  'unpick',
  'pack',
  'unpack',
  'validate',
  'cancel',
] as const;
export type OperationAction = (typeof OPERATION_ACTIONS)[number];

/** Which statuses each action may start from. Done and Canceled are final. */
const FROM: Record<OperationAction, readonly OperationStatus[]> = {
  edit: ['DRAFT'],
  confirm: ['DRAFT'],
  'check-availability': ['WAITING', 'READY'],
  'reset-to-draft': ['WAITING', 'READY'],
  pick: ['READY'],
  unpick: ['READY'],
  pack: ['READY'],
  unpack: ['READY'],
  validate: ['READY'],
  cancel: ['DRAFT', 'WAITING', 'READY'],
};

/** Types an action is limited to. Pick and pack are delivery steps; availability matters only for outgoing stock. */
const TYPES: Partial<Record<OperationAction, readonly OperationType[]>> = {
  'check-availability': ['DELIVERY', 'TRANSFER'],
  pick: ['DELIVERY'],
  unpick: ['DELIVERY'],
  pack: ['DELIVERY'],
  unpack: ['DELIVERY'],
};

/** Receipts and adjustments may be validated straight from Draft: confirm and validate in one transaction. */
export const VALIDATE_FROM_DRAFT: readonly OperationType[] = ['RECEIPT', 'ADJUSTMENT'];

/** Deliveries and transfers take stock out of a location, so Confirm may land in Waiting. */
export const OUTGOING_TYPES: readonly OperationType[] = ['DELIVERY', 'TRANSFER'];

export function actionAppliesTo(action: OperationAction, type: OperationType): boolean {
  const types = TYPES[action];
  return !types || types.includes(type);
}

export function canTransition(
  action: OperationAction,
  type: OperationType,
  status: OperationStatus,
): boolean {
  if (!actionAppliesTo(action, type)) return false;
  if (action === 'validate' && status === 'DRAFT') return VALIDATE_FROM_DRAFT.includes(type);
  return FROM[action].includes(status);
}
