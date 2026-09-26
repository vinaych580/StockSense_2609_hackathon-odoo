import type { OperationDto } from '@stocksense/shared';
import { Check, Loader2 } from 'lucide-react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

import { ACTION_LABEL, blockedReason, type ChecklistAction, checklistActions } from './actions';
import type { useOperationAction } from './useOperationAction';

interface Step {
  title: string;
  at: string | null;
  notYet: string;
  doneWord: string;
  action: ChecklistAction;
  undo: ChecklistAction;
  undoHint?: string;
}

/**
 * A Ready delivery's two steps, in order: Pick, then Pack. They're document-level (pickedAt, packedAt), so this
 * only reflects those timestamps: when the document drops back to Waiting, the server clears them and the steps reset.
 */
export function PickPackChecklist({ operation: op, actions }: { operation: OperationDto; actions: ReturnType<typeof useOperationAction> }) {
  const { user } = useAuth();
  const allowed = user ? checklistActions(op, user.role) : new Set<ChecklistAction>();
  const busy = actions.pending !== null;

  const steps: Step[] = [
    {
      title: 'Pick',
      at: op.pickedAt,
      notYet: 'Not picked yet',
      doneWord: 'Picked',
      action: 'pick',
      undo: 'unpick',
      undoHint: op.packedAt ? 'Also clears Pack.' : undefined,
    },
    { title: 'Pack', at: op.packedAt, notYet: 'Not packed yet', doneWord: 'Packed', action: 'pack', undo: 'unpack' },
  ];

  const control = (action: ChecklistAction, variant: 'default' | 'ghost', hint?: string) => {
    if (!allowed.has(action)) return null;
    const blocked = blockedReason(op, action);
    return (
      <div className="flex items-center gap-2">
        {(blocked ?? hint) && <span className="text-xs text-muted">{blocked ?? hint}</span>}
        <Button size="sm" variant={variant} disabled={busy || !!blocked} onClick={() => void actions.run(action)}>
          {actions.pending === action && <Loader2 className="animate-spin" aria-hidden />}
          {ACTION_LABEL[action]}
        </Button>
      </div>
    );
  };

  return (
    <section aria-label="Pick and pack" className="flex flex-col gap-3">
      <h2 className="eyebrow">Pick and pack</h2>
      <ol className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card">
        {steps.map((step, i) => {
          const done = !!step.at;
          return (
            <li key={step.title} data-done={done} className="flex items-center gap-4 px-4 py-3">
              <span
                aria-hidden
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs',
                  done ? 'border-success bg-success/10 text-success' : 'border-hairline text-muted',
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="flex flex-1 flex-col">
                <span className="font-medium">{step.title}</span>
                <span className={cn('text-sm', done ? 'text-success' : 'text-muted')}>
                  {done ? `${step.doneWord} ${formatDateTime(step.at!)}` : step.notYet}
                </span>
              </div>
              {done ? control(step.undo, 'ghost', step.undoHint) : control(step.action, 'default')}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
