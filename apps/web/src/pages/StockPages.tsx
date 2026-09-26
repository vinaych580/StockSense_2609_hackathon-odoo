import { reorderRuleInput, type MoveDto, type ProductDto, type ReorderRuleDto } from '@stocksense/shared';
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Checked, HealthTag, SectionHead, StockDimension, TitleBlock } from '@/components/drawing';
import { Button, Confirm, Empty, Field, FieldGrid, Input, SearchCell, Select, Skeleton, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { TYPE_META, type Health, type ProductStock } from '@/lib/domain';
import { apiErrors, check, useCan, type Errors } from '@/lib/forms';
import { useCategories, useLocations, useMoves, useProducts, useWarehouses, useWrite } from '@/lib/queries';
import { cn, fmtDate, fmtQty, replenishHref, uomLabel } from '@/lib/utils';
import { CategoriesPanel, ImportPanel, ProductPanel } from './ProductPanels';
import { canOperate } from '@stocksense/shared';

type Filter = Health | 'ALL';

export function StockTrayPage() {
  const { editMaster, user } = useCan();
  const products = useProducts();
  const categories = useCategories();
  const locations = useLocations();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('health') ?? 'ALL') as Filter;
  const search = params.get('q') ?? '';
  const categoryId = params.get('category') ?? '';
  const locationId = params.get('location') ?? '';
  const archived = params.get('archived') === '1';
  const [panel, setPanel] = useState<'new' | 'import' | 'categories' | null>(null);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const pool = useMemo(
    () => (products.data ?? []).filter((p) => (archived ? !p.isActive : p.isActive)),
    [products.data, archived],
  );
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pool.filter(
      (p) =>
        (filter === 'ALL' || p.health === filter) &&
        (!categoryId || p.categoryId === categoryId) &&
        (!locationId || p.locations.some((l) => l.id === locationId)) &&
        (!s || p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)),
    );
  }, [pool, filter, search, categoryId, locationId]);
  const count = (h: Filter) => (h === 'ALL' ? pool.length : pool.filter((p) => p.health === h).length);
  const location = locations.data?.find((l) => l.id === locationId);
  const canReplenish = !!user && canOperate(user.role, 'create', 'RECEIPT');

  return (
    <div className="flex flex-col gap-6">
      <TitleBlock
        sheet={2}
        title="Stock"
        sub="Every product totalled across every location. Open one to read the ledger behind its number."
        cells={[
          { caption: 'Products', value: products.data ? products.data.filter((p) => p.isActive).length : '·' },
          { caption: 'Out', value: products.data ? count('OUT') : '·', alarm: count('OUT') > 0 },
          { caption: 'Short', value: products.data ? count('SHORT') : '·', alarm: count('SHORT') > 0 },
          { caption: 'Low', value: products.data ? count('LOW') : '·' },
          { caption: 'Categories', value: categories.data?.filter((c) => c.isActive).length ?? '·' },
        ]}
        next={
          editMaster ? (
            <>
              <Button variant="primary" onClick={() => setPanel('new')}>New product</Button>
              <Button onClick={() => setPanel('import')}>Import CSV</Button>
              <Button variant="ghost" size="sm" onClick={() => setPanel('categories')}>Categories</Button>
            </>
          ) : (
            <span className="text-sm text-ink-2">Managers add and edit products.</span>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchCell value={search} onChange={(v) => set('q', v || null)} placeholder="SKU or name" label="Search products" />
        <Tabs
          label="Filter by stock health"
          value={filter}
          onChange={(v) => set('health', v === 'ALL' ? null : v)}
          options={[
            { key: 'ALL', label: 'All', count: count('ALL') },
            { key: 'OUT', label: 'Out', count: count('OUT'), alarm: true },
            { key: 'SHORT', label: 'Short', count: count('SHORT'), alarm: true },
            { key: 'LOW', label: 'Low', count: count('LOW') },
            { key: 'OK', label: 'In stock', count: count('OK') },
          ]}
        />
        <label className="flex h-8 items-center gap-2 border border-ink px-2.5">
          <span className="letter text-2xs font-semibold text-ink-3">Category</span>
          <Select value={categoryId} onChange={(e) => set('category', e.target.value || null)} className="h-full w-40 text-sm" aria-label="Filter by category">
            <option value="">All</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        {location && (
          <span className="flex h-8 items-center gap-2 border border-ink bg-sheet-2 pl-2.5">
            <span className="letter text-2xs font-semibold text-ink-3">Held at</span>
            <span className="text-sm font-semibold">{location.label}</span>
            <button type="button" onClick={() => set('location', null)} className="h-full border-l border-ink px-2 text-sm hover:bg-sheet-3" aria-label="Clear location filter">×</button>
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={archived} onChange={(e) => set('archived', e.target.checked ? '1' : null)} className="size-4 accent-[var(--ink)]" />
          Archived products
        </label>
      </div>

      {products.isPending ? (
        <Skeleton className="h-96" />
      ) : products.isError ? (
        <Empty title="Stock didn't load">Check the API is running, then reload.</Empty>
      ) : list.length === 0 ? (
        <Empty title="No products match" action={<Button size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}>
          Clear the search or pick another filter.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="schedule min-w-[860px]">
            <thead>
              <tr>
                <th className="w-24">SKU</th>
                <th className="w-[22%]">Product</th>
                <th className="num">On hand</th>
                <th className="num">Free</th>
                <th className="num">Incoming</th>
                <th className="num">Forecast</th>
                <th>Reorder</th>
                <th className="hidden xl:table-cell">Held at</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const alarm = p.health === 'OUT' || p.health === 'SHORT';
                const rule = p.lowRule ?? p.rules[0];
                const href = canReplenish ? replenishHref(p) : null;
                return (
                  <tr key={p.id} data-link className={cn(!p.isActive && 'text-ink-3')}>
                    <td className="font-semibold">{p.sku}</td>
                    <td className="max-w-0">
                      <Link to={`/stock/${p.id}`} className="row-link block truncate font-semibold">{p.name}</Link>
                      <span className="block truncate text-sm text-ink-3">{p.category ?? 'No category'}</span>
                    </td>
                    <td className={cn('num whitespace-nowrap', p.health === 'LOW' && 'hatch')}>
                      <span className={cn('text-md font-semibold', alarm && 'text-red')}>{fmtQty(p.onHand, p.uom)}</span>
                      <span className="ml-1 text-sm text-ink-3">{uomLabel(p.uom)}</span>
                    </td>
                    <td className={cn('num', p.freeToUse < 0 ? 'font-semibold text-red' : 'text-ink-2')}>{fmtQty(p.freeToUse, p.uom)}</td>
                    <td className="num text-ink-2">{p.incoming ? `+${fmtQty(p.incoming, p.uom)}` : '·'}</td>
                    <td className="num text-ink-2">{fmtQty(p.forecast, p.uom)}</td>
                    <td className="whitespace-nowrap text-sm text-ink-2">
                      {rule ? `${fmtQty(rule.minQty, p.uom)}–${fmtQty(rule.maxQty, p.uom)} ${rule.warehouseCode}` : '·'}
                    </td>
                    <td className="hidden max-w-56 truncate text-sm text-ink-2 xl:table-cell">
                      {p.locations.length ? p.locations.map((l) => l.label).join(', ') : 'Nowhere'}
                    </td>
                    <td>
                      <span className="relative z-[1] flex items-center gap-2">
                        <HealthTag health={p.health} />
                        {href && (
                          <Link to={href} className="letter text-2xs font-bold text-blue hover:underline">Replenish</Link>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProductPanel open={panel === 'new'} onOpenChange={(o) => setPanel(o ? 'new' : null)} />
      <ImportPanel open={panel === 'import'} onOpenChange={(o) => setPanel(o ? 'import' : null)} />
      <CategoriesPanel open={panel === 'categories'} onOpenChange={(o) => setPanel(o ? 'categories' : null)} />
    </div>
  );
}

/** Change to the product's total that a move causes. Internal moves only relocate it. */
const delta = (m: MoveDto) => (m.direction === 'IN' ? Number(m.quantity) : m.direction === 'OUT' ? -Number(m.quantity) : 0);

interface Leader {
  from: { x: number; y: number };
  to: { x: number; y: number }[];
}

/**
 * Leader lines: point at a location's quantity and straight leaders fan out to every ledger entry that
 * touched it. Measured from the DOM; drawn over both columns.
 */
function useLeaders(active: string | null, box: React.RefObject<HTMLDivElement | null>) {
  const [leader, setLeader] = useState<Leader | null>(null);
  useLayoutEffect(() => {
    const root = box.current;
    if (!active || !root || window.innerWidth < 1280) return setLeader(null);
    const measure = () => {
      const base = root.getBoundingClientRect();
      const src = root.querySelector<HTMLElement>(`[data-leader-src="${active}"]`);
      if (!src) return setLeader(null);
      const s = src.getBoundingClientRect();
      const to = [...root.querySelectorAll<HTMLElement>(`[data-leader-to~="${active}"]`)].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - base.left - 4, y: r.top - base.top + r.height / 2 };
      });
      setLeader({ from: { x: s.right - base.left + 6, y: s.top - base.top + s.height / 2 }, to });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, box]);
  return leader;
}

export function ProductRecordPage() {
  const { productId = '' } = useParams();
  const { editMaster, user } = useCan();
  const products = useProducts();
  const warehouses = useWarehouses();
  const moves = useMoves({ productId, pageSize: 100 }, !!productId);
  const p = products.data?.find((x) => x.id === productId);
  const [whId, setWhId] = useState<string>('ALL');
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const leader = useLeaders(hover, box);

  const archive = useWrite(
    () => api.post<ProductDto>(`/products/${productId}/${p?.isActive ? 'archive' : 'restore'}`),
    [['stock'], ['categories']],
  );

  // Moves arrive newest first; the table reads oldest first, like a revision table. Walk back from today.
  const rows = useMemo(() => {
    if (!p || !moves.data) return [];
    let bal = p.onHand;
    const out = moves.data.data.map((m) => {
      const row = { m, d: delta(m), bal };
      bal -= row.d;
      return row;
    });
    return out.reverse();
  }, [p, moves.data]);
  const complete = moves.data ? moves.data.page.total <= moves.data.data.length : true;
  const opening = rows.length ? rows[0]!.bal - rows[0]!.d : 0;
  const reconciles = complete && Math.abs(opening) < 0.0005;

  if (products.isPending) return <Skeleton className="h-[600px]" />;
  if (!p)
    return (
      <Empty title="Product not found" action={<Button asChild size="sm"><Link to="/stock">Back to stock</Link></Button>}>
        The link may be wrong.
      </Empty>
    );

  const whs = warehouses.data?.filter((w) => w.isActive && (p.wh[w.id] || p.rules.some((r) => r.warehouseId === w.id))) ?? [];
  const fig = whId === 'ALL' ? p : (p.wh[whId] ?? { onHand: 0, incoming: 0, outgoing: 0, freeToUse: 0, forecast: 0 });
  const rule = whId === 'ALL' ? (p.rules.length === 1 ? p.rules[0] : undefined) : p.rules.find((r) => r.warehouseId === whId);
  const href = user && canOperate(user.role, 'create', 'RECEIPT') ? replenishHref(p) : null;
  const value = p.unitCost ? p.onHand * Number(p.unitCost) : null;

  return (
    <div className="flex flex-col gap-8">
      <Link to="/stock" className="w-fit text-sm text-blue hover:underline">← All stock</Link>
      <TitleBlock
        sheet="S-02"
        title={<>{p.name}{!p.isActive && <span className="letter ml-3 align-middle text-sm font-bold text-ink-3">Archived</span>}</>}
        cells={[
          { caption: 'SKU', value: p.sku },
          { caption: 'Unit', value: uomLabel(p.uom) },
          { caption: 'Category', value: p.category ?? '·' },
          { caption: 'Unit cost', value: p.unitCost ? `₹${Number(p.unitCost).toLocaleString('en-IN')}` : '·' },
          { caption: 'Stock value', value: value !== null ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '·' },
          { caption: 'Health', value: <HealthTag health={p.health} /> },
        ]}
        next={
          href || editMaster ? (
            <>
              {href && (
                <Button asChild variant="primary">
                  <Link to={href}>Replenish</Link>
                </Button>
              )}
              {editMaster && (
                <Button variant={href ? 'secondary' : 'primary'} onClick={() => setEditOpen(true)}>Edit product</Button>
              )}
              {editMaster && (
                <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)}>{p.isActive ? 'Archive' : 'Restore'}</Button>
              )}
            </>
          ) : undefined
        }
      />

      <section aria-labelledby="dim">
        <SectionHead id="dim" title="Stock dimension">
          {whs.length > 0 && (
            <Tabs
              label="Warehouse"
              value={whId}
              onChange={setWhId}
              options={[{ key: 'ALL', label: 'All warehouses' }, ...whs.map((w) => ({ key: w.id, label: w.code }))]}
            />
          )}
        </SectionHead>
        <div className="border-y-2 border-ink px-2 pt-3">
          <StockDimension
            key={whId}
            onHand={fig.onHand}
            outgoing={fig.outgoing}
            incoming={fig.incoming}
            forecast={fig.forecast}
            min={rule ? Number(rule.minQty) : undefined}
            max={rule ? Number(rule.maxQty) : undefined}
            uom={p.uom}
          />
        </div>
        {whId === 'ALL' && p.rules.length > 1 && (
          <p className="pt-2 text-sm text-ink-3">Reorder rules are per warehouse; pick one to see its minimum and maximum.</p>
        )}
      </section>

      <div ref={box} className="relative grid gap-10 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-8">
          <section aria-labelledby="held">
            <SectionHead id="held" title="Held at" count={p.locations.length} />
            {p.locations.length === 0 ? (
              <p className="border-y-2 border-ink py-3 text-ink-3">Nowhere. Nothing on hand.</p>
            ) : (
              <ul className="border-y-2 border-ink" onMouseLeave={() => setHover(null)}>
                {p.locations.map((l) => (
                  <li
                    key={l.id}
                    data-leader-src={l.id}
                    onMouseEnter={() => setHover(l.id)}
                    onFocus={() => setHover(l.id)}
                    tabIndex={0}
                    className={cn('flex cursor-default items-baseline justify-between border-b border-rule-2 px-1 py-2 outline-none last:border-b-0', hover === l.id && 'bg-yellow')}
                  >
                    <span className="text-ink-2">{l.label}</span>
                    <span className="font-semibold">{fmtQty(l.onHand, p.uom)} <span className="text-sm font-normal text-ink-3">{uomLabel(p.uom)}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {p.locations.length > 0 && <p className="hidden pt-2 text-sm text-ink-3 xl:block">Point at a location to trace its entries.</p>}
          </section>
          <ReorderRules product={p} canEdit={editMaster} />
        </aside>

        <section aria-labelledby="ledger" className="min-w-0">
          <SectionHead id="ledger" title="Revision table" count={rows.length}>
            {rows.length > 0 &&
              (reconciles ? (
                <Checked>Ledger matches on hand</Checked>
              ) : !complete ? (
                <span className="text-sm text-ink-3">Latest 100 entries</span>
              ) : (
                <Checked tone="bad">Does not reconcile</Checked>
              ))}
          </SectionHead>
          <div className="overflow-x-auto">
            <table className="schedule min-w-[640px]">
              <caption className="sr-only">Ledger for {p.name}, oldest first</caption>
              <thead>
                <tr>
                  <th className="w-12 num">Rev</th>
                  <th>Date</th>
                  <th>Document</th>
                  <th>From → To</th>
                  <th className="num">In</th>
                  <th className="num">Out</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {moves.isPending ? (
                  <tr><td colSpan={7} className="py-6 text-ink-3">Reading the ledger…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-ink-3">No entries yet. The first validated document starts this table.</td></tr>
                ) : (
                  rows.map(({ m, d, bal }, i) => {
                    const touched = hover && (m.from.id === hover || m.to.id === hover);
                    return (
                      <tr key={m.id} className={cn(touched && 'bg-yellow/60')}>
                        <td className="num text-ink-3" data-leader-to={`${m.from.id} ${m.to.id}`}>{i + 1}</td>
                        <td className="whitespace-nowrap text-sm text-ink-2">{fmtDate(m.doneAt)}</td>
                        <td>
                          <Link to={`/${TYPE_META[m.operationType].path}/${m.operationId}`} className="font-semibold text-blue hover:underline">{m.reference}</Link>
                        </td>
                        <td className="text-sm text-ink-2">{m.from.label} → {m.to.label}</td>
                        <td className="num font-semibold">{d > 0 ? fmtQty(d, p.uom) : m.direction === 'INTERNAL' ? <span className="text-sm font-normal text-ink-3">moved</span> : ''}</td>
                        <td className="num font-semibold text-red">{d < 0 ? fmtQty(-d, p.uom) : ''}</td>
                        <td className="num text-md font-bold">{fmtQty(bal, p.uom)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {leader && leader.to.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" aria-hidden>
            <circle cx={leader.from.x} cy={leader.from.y} r="3" fill="var(--blue)" />
            {leader.to.map((t, i) => {
              const len = Math.hypot(t.x - leader.from.x, t.y - leader.from.y);
              const a = Math.atan2(t.y - leader.from.y, t.x - leader.from.x);
              const head = (s: number) => `${t.x - 9 * Math.cos(a + s)},${t.y - 9 * Math.sin(a + s)}`;
              return (
                <g key={i}>
                  <line
                    x1={leader.from.x}
                    y1={leader.from.y}
                    x2={t.x}
                    y2={t.y}
                    stroke="var(--blue)"
                    strokeWidth="1"
                    style={{ strokeDasharray: len, ['--len' as string]: len, animation: `pen .35s ${i * 30}ms cubic-bezier(.16,1,.3,1) both` }}
                  />
                  <polygon points={`${t.x},${t.y} ${head(0.28)} ${head(-0.28)}`} fill="var(--blue)" />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <ProductPanel open={editOpen} onOpenChange={setEditOpen} product={p} />
      <Confirm
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={p.isActive ? `Archive ${p.sku}?` : `Restore ${p.sku}?`}
        confirmLabel={p.isActive ? 'Archive' : 'Restore'}
        danger={p.isActive}
        loading={archive.isPending}
        onConfirm={() =>
          archive.mutate(undefined, {
            onSuccess: () => {
              setArchiveOpen(false);
              toast.success(p.isActive ? `${p.sku} archived` : `${p.sku} restored`);
            },
            onError: (e) => {
              setArchiveOpen(false);
              apiErrors(e);
            },
          })
        }
      >
        {p.isActive
          ? 'It leaves the stock sheet and can’t be put on new documents. Its ledger stays as it is, and you can restore it later.'
          : 'It comes back to the stock sheet and can be used on documents again.'}
      </Confirm>
    </div>
  );
}

/** Reorder rules: one per warehouse. Managers set the minimum and maximum; Replenish refills to the maximum. */
function ReorderRules({ product, canEdit }: { product: ProductStock; canEdit: boolean }) {
  const warehouses = useWarehouses();
  const [draft, setDraft] = useState<{ warehouseId: string; minQty: string; maxQty: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const save = useWrite((body: unknown) => api.put<ReorderRuleDto>('/reorder-rules', body), [['stock']]);
  const remove = useWrite((id: string) => api.delete(`/reorder-rules/${id}`), [['stock']]);
  const free = warehouses.data?.filter((w) => w.isActive) ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const parsed = check(reorderRuleInput, { productId: product.id, ...draft });
    if (parsed.errors) return setErrors(parsed.errors);
    save.mutate(parsed.data, {
      onSuccess: () => {
        setDraft(null);
        setErrors({});
        toast.success('Reorder rule saved');
      },
      onError: (err) => setErrors(apiErrors(err)),
    });
  };

  return (
    <section aria-labelledby="rules">
      <SectionHead id="rules" title="Reorder rules" count={product.rules.length}>
        {canEdit && !draft && (
          <Button size="sm" onClick={() => setDraft({ warehouseId: free.find((w) => !product.rules.some((r) => r.warehouseId === w.id))?.id ?? free[0]?.id ?? '', minQty: '', maxQty: '' })}>
            Add rule
          </Button>
        )}
      </SectionHead>
      {product.rules.length === 0 && !draft ? (
        <p className="border-y-2 border-ink py-3 text-sm text-ink-3">No rule. This product is never flagged low.</p>
      ) : (
        <ul className="border-y-2 border-ink">
          {product.rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 border-b border-rule-2 px-1 py-2 last:border-b-0">
              <span>
                <span className="letter mr-2 text-xs font-bold">{r.warehouseCode}</span>
                <span className="text-ink-2">min</span> <span className="font-semibold">{fmtQty(r.minQty, product.uom)}</span>
                <span className="text-ink-2"> · max</span> <span className="font-semibold">{fmtQty(r.maxQty, product.uom)}</span>
              </span>
              {canEdit && (
                <span className="flex gap-3">
                  <Button variant="link" onClick={() => setDraft({ warehouseId: r.warehouseId, minQty: r.minQty.replace(/\.?0+$/, ''), maxQty: r.maxQty.replace(/\.?0+$/, '') })}>Edit</Button>
                  <Button variant="link" className="text-red" onClick={() => remove.mutate(r.id, { onError: (e) => apiErrors(e) })}>Remove</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <FieldGrid className="grid-cols-3">
            <Field label="Warehouse" htmlFor="rule-wh" error={errors.warehouseId}>
              <Select id="rule-wh" value={draft.warehouseId} onChange={(e) => setDraft({ ...draft, warehouseId: e.target.value })}>
                {free.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </Select>
            </Field>
            <Field label="Min" htmlFor="rule-min" error={errors.minQty}>
              <Input id="rule-min" inputMode="decimal" value={draft.minQty} onChange={(e) => setDraft({ ...draft, minQty: e.target.value })} autoFocus />
            </Field>
            <Field label="Max" htmlFor="rule-max" error={errors.maxQty}>
              <Input id="rule-max" inputMode="decimal" value={draft.maxQty} onChange={(e) => setDraft({ ...draft, maxQty: e.target.value })} />
            </Field>
          </FieldGrid>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={save.isPending}>Save rule</Button>
            <Button size="sm" onClick={() => { setDraft(null); setErrors({}); }}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  );
}
