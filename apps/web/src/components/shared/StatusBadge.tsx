import type { OperationStatus } from '@stocksense/shared';

import { cn } from '@/lib/utils';

import { STATUS_LABEL, STATUS_TONE, TONE_CLASSES } from './status';

export function StatusBadge({ status, className }: { status: OperationStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  const classes = TONE_CLASSES[tone];
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-[0.12em] whitespace-nowrap uppercase',
        classes.text,
        classes.border,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', classes.dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}
