import type { OperationType } from '@stocksense/shared';
import { Link, useSearchParams } from 'react-router';
import { Checked, TitleBlock } from '@/components/drawing';
import { Button, Empty, Input, Pager, SearchCell, Skeleton, Tabs } from '@/components/ui';
import { TYPE_META, TYPES } from '@/lib/domain';
import { useCan } from '@/lib/forms';
import { useIntegrity, useMoves } from '@/lib/queries';
import { cn, fmtDate, fmtQty, uomLabel } from '@/lib/utils';

/** The ledger, drawn as the sheet's revision table: numbered, dated, signed, never erased. */
export function MovesPage() {
  const { manager } = useCan();
  const integrity = useIntegrity(manager);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const type = params.get('type') ?? 'ALL';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page') ?? 1);
  const q = useMoves({
    search: search || undefined,
    type: type === 'ALL' ? undefined : type,
    dateFrom: from || undefined,
    dateTo: to || undefined,
    page,
    pageSize: 50,
  });
  const total = q.data?.page.total ?? 0;
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <TitleBlock
        sheet={3}
        title="Ledger"
        sub="Append-only. Every entry was posted by a validated document, and none can be edited or deleted. Stock balances are this table, summed."
        cells={[
          { caption: 'Entries', value: q.data ? total.toLocaleString('en-IN') : '·' },
          { caption: 'Showing', value: type === 'ALL' ? 'Every document type' : TYPE_META[type as OperationType].plural },
          { caption: 'Order', value: 'Newest first' },
        ]}
        next={
          manager ? (
            <>
              {integrity.data &&
                (integrity.data.ok ? (
                  <Checked>{integrity.data.balancesChecked} balances match</Checked>
                ) : (
                  <Checked tone="bad">{integrity.data.mismatches.length} balances off</Checked>
                ))}
              <Button size="sm" loading={integrity.isFetching} onClick={() => void integrity.refetch()}>
                Check again
              </Button>
              {integrity.data && (
                <span className="w-full text-sm text-ink-2">
                  Every balance re-derived from {integrity.data.movesChecked.toLocaleString('en-IN')} entries at {fmtDate(integrity.data.checkedAt, true)}.
                </span>
              )}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchCell value={search} onChange={(v) => set('q', v || null)} placeholder="Reference, SKU or product" label="Search the ledger" />
        <Tabs
          label="Document type"
          value={type}
          onChange={(v) => set('type', v === 'ALL' ? null : v)}
          options={[{ key: 'ALL', label: 'All' }, ...TYPES.map((t) => ({ key: t as string, label: TYPE_META[t].plural }))]}
        />
        <span className="flex min-h-8 max-w-full flex-wrap items-center gap-x-2 border border-ink px-2.5">
          <span className="letter text-2xs font-semibold text-ink-3">From</span>
          <Input type="date" value={from} onChange={(e) => set('from', e.target.value || null)} className="h-8 w-32 text-sm" aria-label="From date" />
          <span className="letter text-2xs font-semibold text-ink-3">To</span>
          <Input type="date" value={to} onChange={(e) => set('to', e.target.value || null)} className="h-8 w-32 text-sm" aria-label="To date" />
        </span>
      </div>

      {q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.data?.data.length === 0 ? (
        <Empty title="No entries match">Clear the search or the dates to read the whole ledger.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="schedule min-w-[900px]">
              <thead>
                <tr>
                  <th className="num w-16">Rev</th>
                  <th>Posted</th>
                  <th>Document</th>
                  <th>Product</th>
                  <th>From → To</th>
                  <th className="num">Quantity</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((m, i) => (
                  <tr key={m.id}>
                    <td className="num text-ink-3">{total - ((page - 1) * 50 + i)}</td>
                    <td className="whitespace-nowrap text-sm text-ink-2">{fmtDate(m.doneAt, true)}</td>
                    <td className="whitespace-nowrap">
                      <Link to={`/${TYPE_META[m.operationType].path}/${m.operationId}`} className="font-semibold text-blue hover:underline">{m.reference}</Link>
                    </td>
                    <td className="max-w-64">
                      <Link to={`/stock/${m.product.id}`} className="block truncate hover:text-blue">
                        <span className="mr-2 text-sm font-semibold text-ink-2">{m.product.sku}</span>
                        {m.product.name}
                      </Link>
                    </td>
                    <td className="text-sm text-ink-2">{m.from.label} → {m.to.label}</td>
                    <td className={cn('num whitespace-nowrap font-semibold', m.direction === 'OUT' && 'text-red')}>
                      {m.direction === 'IN' ? '+' : m.direction === 'OUT' ? '−' : ''}
                      {fmtQty(m.quantity, m.product.uom)}
                      <span className="ml-1 text-sm font-normal text-ink-3">{uomLabel(m.product.uom)}</span>
                      {m.direction === 'INTERNAL' && <span className="letter ml-2 text-2xs font-semibold text-ink-3">Moved</span>}
                    </td>
                    <td className="whitespace-nowrap text-sm text-ink-2">{m.doneBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={Math.max(1, Math.ceil(total / 50))} onPage={(p) => set('page', String(p))} prev="Newer" next="Older" />
        </>
      )}
    </div>
  );
}
