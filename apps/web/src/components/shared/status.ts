import type { OperationStatus } from '@stocksense/shared';

export type StatusTone = 'draft' | 'waiting' | 'ready' | 'done' | 'canceled';

/**
 * The canonical status → colour mapping. Badges, the stepper and the kanban columns (C9) all use it.
 * - DRAFT: muted grey, dashed; not committed yet.
 * - WAITING: warning amber; blocked on stock.
 * - READY: neutral strong (white); can proceed. Not cyan: the accent stays for links, nav, icons and focus.
 * - DONE: success green; stock posted.
 * - CANCELED: danger red; final, nothing posted.
 */
export const STATUS_TONE: Record<OperationStatus, StatusTone> = {
  DRAFT: 'draft',
  WAITING: 'waiting',
  READY: 'ready',
  DONE: 'done',
  CANCELED: 'canceled',
};

export const STATUS_LABEL: Record<OperationStatus, string> = {
  DRAFT: 'Draft',
  WAITING: 'Waiting',
  READY: 'Ready',
  DONE: 'Done',
  CANCELED: 'Canceled',
};

/** Text, border and dot classes per tone. */
export const TONE_CLASSES: Record<StatusTone, { text: string; border: string; dot: string }> = {
  draft: { text: 'text-muted', border: 'border-dashed border-hairline', dot: 'bg-muted' },
  waiting: { text: 'text-warning', border: 'border-warning/40 bg-warning/10', dot: 'bg-warning' },
  ready: { text: 'text-fg', border: 'border-fg/40 bg-fg/5', dot: 'bg-fg' },
  done: { text: 'text-success', border: 'border-success/40 bg-success/10', dot: 'bg-success' },
  canceled: { text: 'text-danger', border: 'border-danger/40 bg-danger/10', dot: 'bg-danger' },
};
