import { type ListResponse, OPERATION_STATUSES, type OperationDto, type OperationStatus } from '@stocksense/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { STATUS_LABEL } from '@/components/shared/status';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { LatePill } from './OperationListPage';
import type { OperationTypeInfo } from './operationTypes';

/** The board asks for this many at once: the API's page-size maximum. */
export const KANBAN_PAGE_SIZE = 100;

function lineSummary(op: OperationDto) {
  const n = op.lines.length;
  if (n === 0) return 'No lines';
  const names = op.lines.slice(0, 2).map((l) => l.productName);
  const more = n > 2 ? ` +${n - 2}` : '';
  return `${n} line${n === 1 ? '' : 's'} · ${names.join(', ')}${more}`;
}

export function OperationCard({ op, info }: { op: OperationDto; info: OperationTypeInfo }) {
  return (
    <li>
      <Link
        to={`/operations/${info.slug}/${op.id}`}
        data-late={op.isLate || undefined}
        className={cn(
          'flex flex-col gap-1.5 rounded-lg border border-hairline bg-card p-3 text-fg no-underline transition-colors hover:bg-elevated',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          op.isLate && 'border-l-2 border-l-danger',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="ref text-sm">{op.reference}</span>
          {op.isLate && <LatePill />}
        </span>
        <span className="truncate text-xs text-muted">{lineSummary(op)}</span>
        {info.hasPartner && op.partner && <span className="truncate text-sm">{op.partner.name}</span>}
        <span className={cn('text-xs', op.isLate ? 'text-danger' : 'text-muted')}>
          {op.scheduledDate ? `Scheduled ${formatDate(op.scheduledDate)}` : 'Not scheduled'}
        </span>
      </Link>
    </li>
  );
}

interface Props {
  info: OperationTypeInfo;
  data?: ListResponse<OperationDto>;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  emptyMessage: ReactNode;
  /** Statuses the status filter leaves out: their columns stay, muted, so the board keeps its shape. */
  statusFilter?: string;
}

/** A read-only board: one column per status. Status changes happen on the detail page, not by dragging. */
export function OperationKanban({ info, data, isLoading, isFetching, error, onRetry, emptyMessage, statusFilter }: Props) {
  // Receipts and adjustments never wait on stock: no Waiting column, as in the status filter.
  const statuses = OPERATION_STATUSES.filter((s) => s !== 'WAITING' || info.canWait);
  const byStatus = new Map<OperationStatus, OperationDto[]>(statuses.map((s) => [s, []]));
  for (const op of data?.data ?? []) byStatus.get(op.status)?.push(op);
  const shown = statusFilter ? new Set(statusFilter.split(',')) : undefined;

  if (error && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-card px-4 py-10 text-sm text-muted">
        <span>Couldn't load {info.plural}.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const total = data?.page.total ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {data && total > data.data.length && (
        <p className="text-sm text-warning">
          Showing the first {data.data.length} of {total}. Narrow the filters to see the rest.
        </p>
      )}
      {data && total === 0 && <p className="text-sm text-muted">{emptyMessage}</p>}
      <div
        aria-label={`${info.title} board`}
        aria-busy={isLoading || isFetching || undefined}
        className={cn('grid gap-3 overflow-x-auto pb-2', isFetching && data && 'opacity-60 transition-opacity')}
        style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(14rem, 1fr))` }}
      >
        {statuses.map((status) => {
          const cards = byStatus.get(status) ?? [];
          const excluded = !!shown && !shown.has(status);
          return (
            <section
              key={status}
              aria-label={STATUS_LABEL[status]}
              data-status={status}
              className={cn('flex min-h-40 flex-col gap-2 rounded-lg border border-hairline bg-canvas p-2', excluded && 'opacity-40')}
            >
              <header className="flex items-center justify-between px-1 pt-1">
                <StatusBadge status={status} />
                <span className="font-mono text-xs text-muted tabular-nums" aria-label={`${cards.length} ${STATUS_LABEL[status]}`}>
                  {isLoading && !data ? '…' : cards.length}
                </span>
              </header>
              {isLoading && !data ? (
                <div className="flex flex-col gap-2">
                  {[0, 1].map((i) => (
                    <div key={i} data-testid="skeleton-card" className="h-20 animate-pulse rounded-lg bg-card" />
                  ))}
                </div>
              ) : cards.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted">None</p>
              ) : (
                <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
                  {cards.map((op) => (
                    <OperationCard key={op.id} op={op} info={info} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
