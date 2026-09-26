import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

const DEFAULT_PAGE_SIZE = 25;

/** How a list page shows its rows: a table, or a board of status columns. */
export type ListView = 'list' | 'kanban';

function positiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/**
 * Page, page size and sort for a server-paged list, kept in the URL. `sort` uses the API's form:
 * a field name, with a leading '-' for descending ('-createdAt').
 */
export function useListParams({ defaultSort, pageSize: defaultPageSize = DEFAULT_PAGE_SIZE }: { defaultSort?: string; pageSize?: number } = {}) {
  const [params, setParams] = useSearchParams();
  const page = positiveInt(params.get('page'), 1);
  const pageSize = positiveInt(params.get('pageSize'), defaultPageSize, 100);
  const sort = params.get('sort') || defaultSort;
  const view: ListView = params.get('view') === 'kanban' ? 'kanban' : 'list';

  const update = useCallback(
    (changes: Record<string, string | undefined>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const setPage = useCallback((p: number) => update({ page: p <= 1 ? undefined : String(p) }), [update]);
  // A new sort starts again at page 1.
  const setSort = useCallback((s: string) => update({ sort: s === defaultSort ? undefined : s, page: undefined }), [update, defaultSort]);

  // Filters, sort and the list's page are left alone, so switching back to the list finds them as they were.
  const setView = useCallback((v: ListView) => update({ view: v === 'list' ? undefined : v }), [update]);

  return { page, pageSize, sort, view, setPage, setSort, setView };
}

/** The current values of these filter params (empty ones left out), for a query key and the API query. */
export function useFilterParams<K extends string>(keys: readonly K[]): Partial<Record<K, string>> {
  const [params] = useSearchParams();
  const signature = keys.map((k) => `${k}=${params.get(k) ?? ''}`).join('&');
  return useMemo(() => {
    const values: Partial<Record<K, string>> = {};
    for (const key of keys) {
      const value = params.get(key);
      if (value) values[key] = value;
    }
    return values;
    // `signature` captures exactly the values read above, so the object only changes when they do.
  }, [signature]);
}
