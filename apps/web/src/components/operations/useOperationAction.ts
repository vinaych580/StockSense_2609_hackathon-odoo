import type { ChangedBalance, OperationActionResponse, OperationDto, ShortLine } from '@stocksense/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { api, isApiError } from '@/lib/api';

import type { ButtonAction } from './actions';

export const operationDetailKey = (id: string) => ['operations', 'detail', id] as const;

export interface ActionState {
  pending: ButtonAction | null;
  notice?: string;
  /** `warning` for outcomes that need attention: waiting for stock, or a reload after someone else's change. */
  noticeTone?: 'success' | 'warning';
  alert?: string;
  /** INSUFFICIENT_STOCK: exactly the lines that are short, by product. */
  shortLines: Map<string, ShortLine>;
  /** BALANCE_CHANGED: the counts to confirm, and the action to resend. */
  changed?: { action: ButtonAction; balances: ChangedBalance[] };
}

const EMPTY: ActionState = { pending: null, shortLines: new Map() };

function successNotice(action: ButtonAction, res: OperationActionResponse) {
  if (res.replayed) return 'Already validated.';
  const op = res.operation;
  switch (action) {
    case 'validate': {
      const moves = res.posted?.movesPosted ?? 0;
      return `Validated. ${moves} move${moves === 1 ? '' : 's'} posted.`;
    }
    case 'confirm':
    case 'check-availability':
      return op.status === 'WAITING' ? 'Waiting for stock.' : 'Ready.';
    case 'pick':
      return 'Marked picked.';
    case 'pack':
      return 'Marked packed.';
    case 'reset-to-draft':
      return 'Back to Draft.';
    case 'cancel':
      return 'Canceled.';
  }
}

/**
 * Runs POST /operations/:id/<action> with the version last read, and turns the special 409s into
 * state the page can show: short lines, changed balances, or a reload after someone else's change.
 */
export function useOperationAction(id: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ActionState>(EMPTY);

  const run = useCallback(
    async (action: ButtonAction, options: { acknowledgeBalanceChange?: boolean } = {}) => {
      // Always the latest version in the cache, so a retry after a reload uses the new one.
      const version = queryClient.getQueryData<OperationDto>(operationDetailKey(id))?.version;
      setState((s) => ({ ...s, pending: action, alert: undefined, notice: undefined }));
      try {
        const res = await api.post<OperationActionResponse>(`/operations/${id}/${action}`, {
          version,
          ...(options.acknowledgeBalanceChange ? { acknowledgeBalanceChange: true } : {}),
        });
        queryClient.setQueryData(operationDetailKey(id), res.operation);
        void queryClient.invalidateQueries({ queryKey: ['operations', 'list'] });
        const waiting = !res.replayed && res.operation.status === 'WAITING';
        setState({ ...EMPTY, notice: successNotice(action, res), noticeTone: waiting ? 'warning' : 'success' });
      } catch (e) {
        if (isApiError(e, 'INSUFFICIENT_STOCK')) {
          const lines = (e.error.details as ShortLine[] | undefined) ?? [];
          setState({ ...EMPTY, alert: e.error.message, shortLines: new Map(lines.map((l) => [l.productId, l])) });
          // The stock moved since this page loaded: refresh its on-hand numbers to match the error.
          void queryClient.refetchQueries({ queryKey: operationDetailKey(id), exact: true });
        } else if (isApiError(e, 'BALANCE_CHANGED')) {
          setState({ ...EMPTY, changed: { action, balances: (e.error.details as ChangedBalance[] | undefined) ?? [] } });
          void queryClient.refetchQueries({ queryKey: operationDetailKey(id), exact: true });
        } else if (isApiError(e, 'STALE_VERSION')) {
          // Reload the document; nothing typed on the page is reset.
          await queryClient.refetchQueries({ queryKey: operationDetailKey(id), exact: true });
          setState({ ...EMPTY, notice: 'Someone else changed this document, so the latest version is loaded. Check it and try again.', noticeTone: 'warning' });
        } else {
          setState({ ...EMPTY, alert: isApiError(e) ? e.error.message : 'Something went wrong. Try again.' });
        }
        // Let a ConfirmDialog close: the outcome is shown on the page, not in the dialog.
      }
    },
    [id, queryClient],
  );

  const dismiss = useCallback(() => setState((s) => ({ ...s, changed: undefined, alert: undefined, notice: undefined })), []);

  return { ...state, run, dismiss };
}
