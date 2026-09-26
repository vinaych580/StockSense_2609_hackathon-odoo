import { OPERATION_STATUSES, type OperationStatus, type OperationType } from '@stocksense/shared';
import { StrictMode, useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { FilterBar, FilterDateRange, FilterSearch, FilterSelect, FilterToggle } from '@/components/shared/FilterBar';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StatusStepper } from '@/components/shared/StatusStepper';
import { Button } from '@/components/ui/button';
import { useListParams } from '@/lib/listParams';

import '../index.css';

// Dev-only gallery of the shared components (C4), for checking them by eye. Not part of the app build.

interface Row {
  id: string;
  reference: string;
  contact: string;
  status: OperationStatus;
  scheduled: string;
}

const ROWS: Row[] = Array.from({ length: 33 }, (_, i) => ({
  id: String(i + 1),
  reference: `WH1/IN/${String(i + 1).padStart(5, '0')}`,
  contact: ['Acme Metals', 'Bharat Traders', 'Zenith Supply'][i % 3]!,
  status: OPERATION_STATUSES[i % 5]!,
  scheduled: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
}));

const columns: Column<Row>[] = [
  { id: 'reference', header: 'Reference', sortKey: 'reference', cell: (r) => <span className="ref">{r.reference}</span> },
  { id: 'contact', header: 'Contact', cell: (r) => r.contact },
  { id: 'scheduled', header: 'Scheduled', sortKey: 'scheduledDate', cell: (r) => r.scheduled },
  { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

/** Sort and page over local data, the way a list page does over the API. */
function LiveTable() {
  const { page, pageSize, sort, setPage, setSort } = useListParams({ defaultSort: '-reference', pageSize: 10 });
  const sorted = useMemo(() => {
    const key = sort?.replace(/^-/, '') === 'scheduledDate' ? 'scheduled' : 'reference';
    const dir = sort?.startsWith('-') ? -1 : 1;
    return [...ROWS].sort((a, b) => a[key].localeCompare(b[key]) * dir);
  }, [sort]);
  return (
    <DataTable
      aria-label="Live"
      columns={columns}
      rows={sorted.slice((page - 1) * pageSize, page * pageSize)}
      getRowId={(r) => r.id}
      page={{ page, pageSize, total: ROWS.length }}
      sort={sort}
      onSortChange={setSort}
      onPageChange={setPage}
    />
  );
}

function UrlProbe() {
  const { search } = useLocation();
  return <p className="ref text-xs text-muted">URL: {search || '(no params)'}</p>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TYPES: OperationType[] = ['DELIVERY', 'RECEIPT'];

function Gallery() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10">
      <header>
        <span className="eyebrow">Dev only</span>
        <h1 className="text-2xl font-semibold">Shared components</h1>
      </header>

      <Section title="FilterBar">
        <FilterBar>
          <FilterSearch placeholder="Reference or contact" />
          <FilterSelect name="status" label="Status" options={OPERATION_STATUSES.map((s) => ({ value: s, label: s }))} />
          <FilterSelect name="warehouseId" label="Warehouse" options={[{ value: 'wh1', label: 'WH1' }, { value: 'wh2', label: 'WH2' }]} />
          <FilterDateRange />
          <FilterToggle name="late" label="Late" />
        </FilterBar>
        <UrlProbe />
      </Section>

      <Section title="DataTable · sort and page">
        <LiveTable />
      </Section>

      <div className="grid gap-6 md:grid-cols-3">
        <Section title="DataTable · loading">
          <DataTable columns={columns.slice(0, 2)} getRowId={(r) => r.id} isLoading skeletonRows={3} />
        </Section>
        <Section title="DataTable · empty">
          <DataTable columns={columns.slice(0, 2)} getRowId={(r) => r.id} rows={[]} emptyMessage="No receipts match these filters." />
        </Section>
        <Section title="DataTable · error">
          <DataTable columns={columns.slice(0, 2)} getRowId={(r) => r.id} error={new Error('x')} onRetry={() => alert('retry')} />
        </Section>
      </div>

      <Section title="StatusBadge">
        <div className="flex flex-wrap gap-3">
          {OPERATION_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="StatusStepper">
        <div className="flex flex-col gap-4">
          {TYPES.flatMap((type) =>
            OPERATION_STATUSES.filter((s) => !(type === 'RECEIPT' && s === 'WAITING')).map((s) => (
              <div key={`${type}-${s}`} className="flex items-center gap-4">
                <span className="ref w-40 text-xs text-muted">
                  {type} · {s}
                </span>
                <StatusStepper status={s} type={type} />
              </div>
            )),
          )}
        </div>
      </Section>

      <Section title="ConfirmDialog">
        <div className="flex gap-3">
          <ConfirmDialog
            title="Validate WH1/OUT/00004?"
            effect="Stock of 3 products will decrease at WH1/Stock."
            confirmLabel="Validate"
            onConfirm={() => wait(1500)}
            trigger={<Button>Validate (succeeds)</Button>}
          />
          <ConfirmDialog
            title="Cancel WH1/IN/00012?"
            effect="The receipt is canceled. No stock changes."
            confirmLabel="Cancel receipt"
            cancelLabel="Keep it"
            tone="danger"
            onConfirm={() => wait(1000).then(() => Promise.reject(new Error('Someone else changed this. Reload and try again.')))}
            trigger={<Button variant="outline">Cancel (fails)</Button>}
          />
        </div>
      </Section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Gallery />
    </BrowserRouter>
  </StrictMode>,
);
