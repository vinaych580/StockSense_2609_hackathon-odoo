import type { ListResponse } from '@stocksense/shared';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** The API sort field; makes the header clickable. */
  sortKey?: string;
  align?: 'left' | 'right';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows?: T[];
  getRowId: (row: T) => string;
  page?: ListResponse<T>['page'];
  /** API form: 'createdAt' ascending, '-createdAt' descending. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  /** Refetching with rows already shown: they stay, dimmed. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: ReactNode;
  errorMessage?: ReactNode;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
  'aria-label'?: string;
}

function nextSort(sortKey: string, current?: string) {
  // First click sorts descending (newest or largest first), then it toggles.
  return current === `-${sortKey}` ? sortKey : `-${sortKey}`;
}

function sortState(sortKey: string, current?: string): 'ascending' | 'descending' | 'none' {
  if (current === sortKey) return 'ascending';
  if (current === `-${sortKey}`) return 'descending';
  return 'none';
}

/** A server-paged, server-sorted table. The parent fetches; this renders the states and emits changes. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  page,
  sort,
  onSortChange,
  onPageChange,
  isLoading,
  isFetching,
  error,
  onRetry,
  emptyMessage = 'Nothing here yet.',
  errorMessage = "Couldn't load this list.",
  onRowClick,
  skeletonRows = 5,
  'aria-label': ariaLabel,
}: DataTableProps<T>) {
  const hasRows = !!rows && rows.length > 0;
  const showSkeleton = isLoading && !hasRows;
  const showError = !!error && !hasRows && !isLoading;
  const showEmpty = !isLoading && !error && rows?.length === 0;

  const message = (content: ReactNode) => (
    <tr>
      <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted">
        {content}
      </td>
    </tr>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-card">
      <div className="overflow-x-auto">
        <table aria-label={ariaLabel} aria-busy={isLoading || isFetching || undefined} className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((col) => {
                const state = col.sortKey ? sortState(col.sortKey, sort) : undefined;
                const Arrow = state === 'ascending' ? ArrowUp : state === 'descending' ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={state}
                    className={cn(
                      'h-10 px-4 font-mono text-[11px] font-normal tracking-[0.12em] whitespace-nowrap text-muted uppercase',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.className,
                    )}
                  >
                    {col.sortKey && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(nextSort(col.sortKey!, sort))}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md uppercase outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring',
                          state !== 'none' && 'text-fg',
                        )}
                      >
                        {col.header}
                        <Arrow aria-hidden className={cn('size-3.5', state === 'none' && 'opacity-50')} />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn(isFetching && hasRows && 'opacity-60 transition-opacity')}>
            {showSkeleton &&
              Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} data-testid="skeleton-row" className="border-t border-hairline">
                  {columns.map((col) => (
                    <td key={col.id} className="h-11 px-4">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-elevated" />
                    </td>
                  ))}
                </tr>
              ))}
            {showError &&
              message(
                <div role="alert" className="flex flex-col items-center gap-3">
                  <span>{errorMessage}</span>
                  {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                      Retry
                    </Button>
                  )}
                </div>,
              )}
            {showEmpty && message(emptyMessage)}
            {hasRows &&
              rows.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-t border-hairline', onRowClick && 'cursor-pointer hover:bg-elevated')}
                >
                  {columns.map((col) => (
                    <td key={col.id} className={cn('h-11 px-4', col.align === 'right' && 'text-right', col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {page && page.total > 0 && <Pagination page={page} onPageChange={onPageChange} />}
    </div>
  );
}

function Pagination({ page, onPageChange }: { page: ListResponse<unknown>['page']; onPageChange?: (page: number) => void }) {
  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <div className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-2 text-sm text-muted">
      <span>
        {first}–{last} of {page.total}
      </span>
      {onPageChange && lastPage > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page.page >= lastPage} onClick={() => onPageChange(page.page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
