import type { OperationStatus, OperationType } from '@stocksense/shared';
import { Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { STATUS_LABEL } from './status';

type Step = Exclude<OperationStatus, 'CANCELED'>;

/** Only deliveries and transfers can wait on stock (check-availability is limited to them). */
export function stepsFor(type?: OperationType): Step[] {
  return type === 'RECEIPT' || type === 'ADJUSTMENT' ? ['DRAFT', 'READY', 'DONE'] : ['DRAFT', 'WAITING', 'READY', 'DONE'];
}

/** An operation's progress: Draft → (Waiting) → Ready → Done, or a Canceled marker. */
export function StatusStepper({ status, type, className }: { status: OperationStatus; type?: OperationType; className?: string }) {
  const steps = stepsFor(type);
  const canceled = status === 'CANCELED';
  const done = status === 'DONE';
  const current = canceled ? -1 : steps.indexOf(status as Step);

  return (
    <ol aria-label="Status" className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
      {steps.map((step, i) => {
        const state = canceled ? 'muted' : done || i < current ? 'complete' : i === current ? 'current' : 'upcoming';
        return (
          <li key={step} data-state={state} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className={cn('h-px w-6', state === 'complete' || state === 'current' ? 'bg-fg/40' : 'bg-hairline')} />}
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs',
                state === 'complete' && (done && i === steps.length - 1 ? 'border-success bg-success/10 text-success' : 'border-fg/40 text-fg'),
                state === 'current' && 'border-accent text-accent ring-2 ring-accent/20',
                (state === 'upcoming' || state === 'muted') && 'border-hairline text-muted',
              )}
            >
              {state === 'complete' ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                state === 'current' ? 'text-accent' : state === 'complete' ? (done && i === steps.length - 1 ? 'text-success' : 'text-fg') : 'text-muted',
              )}
            >
              {STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
      {canceled && (
        <li data-state="canceled" aria-current="step" className="flex items-center gap-2">
          <span aria-hidden className="h-px w-6 bg-hairline" />
          <span className="flex size-6 items-center justify-center rounded-full border border-danger bg-danger/10 text-danger">
            <X className="size-3.5" aria-hidden />
          </span>
          <span className="text-danger">{STATUS_LABEL.CANCELED}</span>
        </li>
      )}
    </ol>
  );
}
