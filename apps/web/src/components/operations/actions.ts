import { canOperate, canTransition, type OperationAction, type OperationDto, type Role, type Uom } from '@stocksense/shared';

import { trimQuantity } from './formSchema';

/** The buttons, in the order they appear. Unpick and unpack belong to C8's checklist. */
export const ACTION_ORDER = ['confirm', 'check-availability', 'pick', 'pack', 'validate', 'reset-to-draft', 'cancel'] as const;
export type ButtonAction = (typeof ACTION_ORDER)[number];

export const ACTION_LABEL: Record<ButtonAction, string> = {
  confirm: 'Confirm',
  'check-availability': 'Check availability',
  pick: 'Mark picked',
  pack: 'Mark packed',
  validate: 'Validate',
  'reset-to-draft': 'Back to draft',
  cancel: 'Cancel',
};

/** Validate and Cancel ask first: one changes stock, the other can't be undone. */
export const NEEDS_CONFIRMATION: ReadonlySet<ButtonAction> = new Set(['validate', 'cancel']);

/** Buttons this role may press on this document now: the state machine and the role must both allow it. */
export function availableActions(op: OperationDto, role: Role): ButtonAction[] {
  return ACTION_ORDER.filter((action) => {
    if (!canTransition(action as OperationAction, op.type, op.status) || !canOperate(role, action, op.type)) return false;
    if (action === 'pick') return !op.pickedAt;
    if (action === 'pack') return !!op.pickedAt && !op.packedAt;
    return true;
  });
}

const products = (n: number) => `${n} product${n === 1 ? '' : 's'}`;

/** What the confirmation dialog says will happen. */
export function actionEffect(op: OperationDto, action: 'validate' | 'cancel'): string {
  if (action === 'cancel') return `${op.reference} is canceled. No stock changes.`;
  const n = products(op.lines.length);
  switch (op.type) {
    case 'RECEIPT':
      return `Stock of ${n} will increase at ${op.dest.label}.`;
    case 'DELIVERY':
      return `Stock of ${n} will decrease at ${op.source.label}.`;
    case 'TRANSFER':
      return `${n[0]!.toUpperCase()}${n.slice(1)} move from ${op.source.label} to ${op.dest.label}.`;
    case 'ADJUSTMENT':
      return `Stock at ${op.dest.label} is set to the counted quantities (${n}).`;
  }
}

/** "needs 10, 4 at WH1/Stock" */
export function shortMessage(requested: string, available: string, location: string, uom?: Uom) {
  const unit = uom && uom !== 'UNIT' ? ` ${uom.toLowerCase()}` : '';
  return `needs ${trimQuantity(requested)}${unit}, ${trimQuantity(available)} at ${location}`;
}
