import type { OperationDto } from '@stocksense/shared';
import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';

import { useAuth } from '@/auth/AuthProvider';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ACTION_LABEL, actionEffect, availableActions, type ButtonAction, NEEDS_CONFIRMATION } from './actions';
import { trimQuantity } from './formSchema';
import type { useOperationAction } from './useOperationAction';

type Actions = ReturnType<typeof useOperationAction>;

interface Props {
  operation: OperationDto;
  actions: Actions;
  /** Set while the Draft form has unsaved edits: acting would use the stored document, not the edits. */
  disabledReason?: string;
}

/** The buttons the state machine and the role allow, and what happened after the last one. */
export function ActionBar({ operation: op, actions, disabledReason }: Props) {
  const { user } = useAuth();
  const available = user ? availableActions(op, user.role) : [];
  const busy = actions.pending !== null;

  const button = (action: ButtonAction) => {
    const primary = action === 'validate';
    const props = {
      variant: primary ? ('default' as const) : ('outline' as const),
      disabled: busy || !!disabledReason,
    };
    if (NEEDS_CONFIRMATION.has(action)) {
      return (
        <ConfirmDialog
          key={action}
          title={`${action === 'validate' ? 'Validate' : 'Cancel'} ${op.reference}?`}
          effect={actionEffect(op, action as 'validate' | 'cancel')}
          confirmLabel={action === 'validate' ? 'Validate' : `Cancel ${op.type.toLowerCase()}`}
          cancelLabel={action === 'cancel' ? 'Keep it' : 'Cancel'}
          tone={action === 'cancel' ? 'danger' : 'default'}
          onConfirm={() => actions.run(action)}
          trigger={
            <Button {...props} className={cn(action === 'cancel' && 'text-danger')}>
              {ACTION_LABEL[action]}
            </Button>
          }
        />
      );
    }
    return (
      <Button key={action} {...props} onClick={() => void actions.run(action)}>
        {actions.pending === action && <Loader2 className="animate-spin" aria-hidden />}
        {ACTION_LABEL[action]}
      </Button>
    );
  };

  if (available.length === 0 && !actions.notice && !actions.alert) return null;

  return (
    <section aria-label="Actions" className="flex flex-col gap-3">
      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {available.map(button)}
          {disabledReason && <span className="text-sm text-muted">{disabledReason}</span>}
        </div>
      )}

      {actions.notice && (
        <p role="status" className={cn('flex items-center gap-1.5 text-sm', actions.noticeTone === 'warning' ? 'text-warning' : 'text-success')}>
          {actions.noticeTone === 'warning' ? <Info className="size-4" /> : <Check className="size-4" />}
          {actions.notice}
        </p>
      )}
      {actions.alert && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {actions.alert}
        </p>
      )}

      {actions.changed && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium text-warning">The stock changed since these were counted.</p>
          <table className="w-full">
            <thead>
              <tr className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
                <th className="py-1 text-left font-normal">Product</th>
                <th className="py-1 text-right font-normal">Counted</th>
                <th className="py-1 text-right font-normal">Balance then</th>
                <th className="py-1 text-right font-normal">Balance now</th>
              </tr>
            </thead>
            <tbody>
              {actions.changed.balances.map((b) => (
                <tr key={b.productId}>
                  <td className="py-1">
                    <span className="ref text-xs text-muted">{b.sku}</span> {b.productName}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">{trimQuantity(b.counted)}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{trimQuantity(b.balanceAtCount)}</td>
                  <td className="py-1 text-right font-mono text-warning tabular-nums">{trimQuantity(b.currentBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted">Posting anyway sets stock to the counted quantities. Recount if you're not sure.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void actions.run(actions.changed!.action, { acknowledgeBalanceChange: true })}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Post anyway
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={actions.dismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
