import { canOperate, canTransition, type OperationAction, type OperationDto, type Role, type Uom } from '@stocksense/shared';

import { trimQuantity } from './formSchema';

/** The action bar's buttons, in order. Pick and pack live in the delivery checklist instead. */
export const ACTION_ORDER = ['confirm', 'check-availability', 'validate', 'reset-to-draft', 'cancel'] as const;
export type ButtonAction = (typeof ACTION_ORDER)[number];

/** The delivery checklist's steps and their undo. */
export const CHECKLIST_ACTIONS = ['pick', 'unpick', 'pack', 'unpack'] as const;
export type ChecklistAction = (typeof CHECKLIST_ACTIONS)[number];

export type AnyAction = ButtonAction | ChecklistAction;

export const ACTION_LABEL: Record<AnyAction, string> = {
  confirm: 'Confirm',
  'check-availability': 'Check availability',
  validate: 'Validate',
  'reset-to-draft': 'Back to draft',
  cancel: 'Cancel',
  pick: 'Pick',
  unpick: 'Undo pick',
  pack: 'Pack',
  unpack: 'Undo pack',
};

/** Validate and Cancel ask first: one changes stock, the other can't be undone. */
export const NEEDS_CONFIRMATION: ReadonlySet<ButtonAction> = new Set(['validate', 'cancel']);

const allowed = (op: OperationDto, role: Role, action: OperationAction) =>
  canTransition(action, op.type, op.status) && canOperate(role, action, op.type);

/** Bar buttons this role may press on this document now: the state machine and the role must both allow it. */
export function availableActions(op: OperationDto, role: Role): ButtonAction[] {
  return ACTION_ORDER.filter((action) => allowed(op, role, action));
}

/** Checklist actions this role may press now: each step, or its undo once done. */
export function checklistActions(op: OperationDto, role: Role): Set<ChecklistAction> {
  const state: Record<ChecklistAction, boolean> = {
    pick: !op.pickedAt,
    unpick: !!op.pickedAt,
    pack: !op.packedAt,
    unpack: !!op.packedAt,
  };
  return new Set(CHECKLIST_ACTIONS.filter((action) => state[action] && allowed(op, role, action)));
}

/**
 * Why an allowed button can't be pressed yet. The state machine lets a Ready delivery validate, but the
 * server refuses it (NOT_READY) until it's picked and packed, so the button waits for both.
 */
export function blockedReason(op: OperationDto, action: AnyAction): string | undefined {
  if (op.type !== 'DELIVERY') return undefined;
  if (action === 'validate' && op.status === 'READY') {
    if (!op.pickedAt) return 'Pick and pack first.';
    if (!op.packedAt) return 'Pack first.';
  }
  if (action === 'pack' && !op.pickedAt) return 'Pick first.';
  return undefined;
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
