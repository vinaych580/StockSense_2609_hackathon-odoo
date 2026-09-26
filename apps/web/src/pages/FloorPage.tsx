import { canOperate, OPERATION_STATUSES, type OperationDto, type OperationStatus, type OperationType } from '@stocksense/shared';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { Checked, Delta, ProcessLine, RevisionCloud, SectionHead, StatusTag, TitleBlock } from '@/components/drawing';
import { WarehousePlan, type RoomStat } from '@/components/Plan';
import { ScopeFilters, useScope, type Scope } from '@/components/ScopeFilters';
import { Button, Skeleton, Tabs } from '@/components/ui';
import { STATUS_LABEL, TYPE_META, TYPES, type ProductStock } from '@/lib/domain';
import { useDashboard, useIntegrity, useOperations, useProducts, useWarehouses } from '@/lib/queries';
import { cn, fmtDate, fmtQty, replenishHref, uomLabel } from '@/lib/utils';

const docHref = (d: Pick<OperationDto, 'type' | 'id'>) => `/${TYPE_META[d.type].path}/${d.id}`;

interface Revision {
  key: string;
  to: string;
  what: string;
  why: string;
  action?: { label: string; to: string };
}

/**
 * A product as one warehouse sees it: its figures, health and tripped rule there. Products the
 * warehouse doesn't carry (no stock ever, no rule) drop out, as they do in the dashboard KPIs.
 */
function inWarehouse(p: ProductStock, wh: string): ProductStock | null {
  const f = p.wh[wh];
  const rules = p.rules.filter((r) => r.warehouseId === wh);
  if (!f && rules.length === 0) return null;
  const onHand = f?.onHand ?? 0;
  const freeToUse = f?.freeToUse ?? 0;
  const lowRule = rules.find((r) => onHand <= Number(r.minQty)) ?? null;
  const health = onHand <= 0 ? 'OUT' : freeToUse < 0 ? 'SHORT' : lowRule ? 'LOW' : 'OK';
  return { ...p, onHand, freeToUse, lowRule, health };
}

/** Everything on the floor that has drifted from plan, as numbered revisions. */
function revisionsOf(products: ProductStock[], late: OperationDto[], waiting: OperationDto[], canReplenish: boolean, whCode?: string): Revision[] {
  const out: Revision[] = [];
  for (const d of late)
    out.push({ key: d.id, to: docHref(d), what: d.reference, why: `${TYPE_META[d.type].label} late since ${fmtDate(d.scheduledDate)}${d.partner ? `, ${d.partner.name}` : ''}` });
  for (const d of waiting)
    if (!d.isLate) out.push({ key: d.id, to: docHref(d), what: d.reference, why: `Waiting: not enough stock at ${d.source.label}` });
  const rank = { OUT: 0, SHORT: 1, LOW: 2, OK: 3 };
  for (const p of [...products].filter((p) => p.isActive && p.health !== 'OK').sort((a, b) => rank[a.health] - rank[b.health])) {
    const why =
      p.health === 'OUT'
        ? whCode ? `Out of stock in ${whCode}` : 'Out of stock everywhere'
        : p.health === 'SHORT'
          ? `${fmtQty(-p.freeToUse, p.uom)} ${uomLabel(p.uom)} more promised than on hand`
          : `${fmtQty(p.byWarehouse[p.lowRule!.warehouseId] ?? 0, p.uom)} ${uomLabel(p.uom)} left in ${p.lowRule!.warehouseCode}, reorder at ${fmtQty(p.lowRule!.minQty, p.uom)}`;
    const href = canReplenish ? replenishHref(p) : null;
    out.push({ key: p.id, to: `/stock/${p.id}`, what: `${p.sku} ${p.name}`, why, action: href ? { label: 'Replenish', to: href } : undefined });
  }
  return out;
}

function Revisions({ items }: { items: Revision[] }) {
  if (items.length === 0)
    return (
      <div className="flex items-center gap-3 border border-ink px-4 py-5">
        <span className="letter bg-yellow px-2 py-0.5 text-sm font-bold">Checked</span>
        <p className="text-ink-2">Nothing late, short or low. The floor matches the plan.</p>
      </div>
    );
  return (
    <RevisionCloud>
      <ol className="divide-y divide-rule-2">
        {items.map((r, i) => (
          <li key={r.key} className="flex items-center gap-3 py-2 pl-1 pr-2">
            <Delta n={i + 1} className="text-base" />
            <Link to={r.to} className="min-w-0 flex-1 hover:text-blue">
              <span className="block truncate font-semibold">{r.what}</span>
              <span className="block truncate text-sm text-ink-2">{r.why}</span>
            </Link>
            {r.action && (
              <Button asChild size="sm" variant="secondary">
                <Link to={r.action.to}>{r.action.label}</Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </RevisionCloud>
  );
}

const OPEN = 'DRAFT,WAITING,READY';
const STATUS_FILTERS = [{ key: 'OPEN', label: 'Open' }, ...OPERATION_STATUSES.map((s) => ({ key: s as string, label: STATUS_LABEL[s] }))];

/** The scope as list-page query params, so "All receipts" opens the same slice of the floor. */
function scopeSearch(scope: Scope, status: string) {
  const p = new URLSearchParams();
  if (status !== 'OPEN') p.set('status', status);
  if (scope.warehouseId) p.set('wh', scope.warehouseId);
  if (scope.locationId) p.set('loc', scope.locationId);
  if (scope.categoryId) p.set('cat', scope.categoryId);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function Queue({ type, status, scope }: { type: OperationType; status: string; scope: Scope }) {
  const meta = TYPE_META[type];
  const closed = status === 'DONE' || status === 'CANCELED';
  const q = useOperations({ type, status: status === 'OPEN' ? OPEN : status, sort: closed ? '-createdAt' : 'scheduledDate', pageSize: 6, ...scope });
  const docs = q.data?.data ?? [];
  const ordered = [...docs.filter((d) => d.isLate), ...docs.filter((d) => !d.isLate)];
  return (
    <section aria-labelledby={`q-${type}`} className="min-w-0">
      <SectionHead id={`q-${type}`} title={meta.plural} count={q.data?.page.total}>
        <Link to={`/${meta.path}${scopeSearch(scope, status)}`} className="text-sm text-blue hover:underline">All {meta.plural.toLowerCase()}</Link>
      </SectionHead>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : ordered.length === 0 ? (
        <p className="border-y-2 border-ink py-4 text-center text-ink-3">{status === 'OPEN' ? 'Nothing open.' : `Nothing ${STATUS_LABEL[status as OperationStatus].toLowerCase()}.`}</p>
      ) : (
        <table className="schedule">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((d) => (
              <tr key={d.id} data-link>
                <td className="max-w-0">
                  <Link to={docHref(d)} className="row-link block truncate font-semibold">{d.reference.split('/').slice(1).join('/')}</Link>
                  <span className="block truncate text-sm text-ink-2">{d.partner?.name ?? `${d.source.label} → ${d.dest.label}`}</span>
                </td>
                <td className={cn('whitespace-nowrap text-sm', d.isLate ? 'font-semibold text-red' : 'text-ink-2')}>{fmtDate(d.scheduledDate)}</td>
                <td>
                  <div className="flex flex-col items-start gap-1.5">
                    <StatusTag status={d.status} late={d.isLate} />
                    {type === 'DELIVERY' && <ProcessLine op={d} compact />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A pending-documents KPI: the count, its late share in red, and a way into that list. */
function Pending({ n, late, to }: { n?: number; late?: number; to: string }) {
  if (n === undefined) return <>·</>;
  return (
    <Link to={to} className="hover:text-blue">
      {n}
      {!!late && <span className="ml-1.5 text-sm font-semibold text-red">{late} late</span>}
    </Link>
  );
}

export function FloorPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { scope, active: scoped } = useScope();
  const typeFilter = (params.get('type') ?? 'ALL') as OperationType | 'ALL';
  const status = params.get('status') ?? 'OPEN';
  const setParam = (k: string, v: string | null) =>
    setParams(
      () => {
        const next = new URLSearchParams(window.location.search);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );
  const docScope = { ...scope, type: typeFilter === 'ALL' ? undefined : typeFilter };

  const products = useProducts();
  const warehouses = useWarehouses();
  const late = useOperations({ status: OPEN, late: true, sort: 'scheduledDate', pageSize: 20, ...docScope });
  const waiting = useOperations({ status: 'WAITING', sort: 'scheduledDate', pageSize: 20, ...docScope });
  const ready = useOperations({ status: 'READY', sort: 'scheduledDate', pageSize: 1, ...docScope });
  const dashboard = useDashboard(scope);
  const integrity = useIntegrity(user?.role === 'MANAGER');
  const today = new Date();
  const wh = warehouses.data?.find((w) => w.id === scope.warehouseId);

  const scopedProducts = useMemo(() => {
    let list = products.data;
    if (!list) return undefined;
    if (scope.categoryId) list = list.filter((p) => p.categoryId === scope.categoryId);
    if (scope.warehouseId) list = list.map((p) => inWarehouse(p, scope.warehouseId!)).filter((p): p is ProductStock => !!p);
    return list;
  }, [products.data, scope.categoryId, scope.warehouseId]);

  const revisions = useMemo(
    () =>
      scopedProducts && late.data && waiting.data
        ? revisionsOf(scopedProducts, late.data.data, waiting.data.data, !!user && canOperate(user.role, 'create', 'RECEIPT'), wh?.code)
        : null,
    [scopedProducts, late.data, waiting.data, user, wh?.code],
  );
  const stats = useMemo(() => {
    const s: Record<string, RoomStat> = {};
    for (const p of products.data ?? [])
      for (const l of p.locations) {
        const r = (s[l.id] ??= { products: 0, alarm: 0 });
        r.products += 1;
      }
    return s;
  }, [products.data]);

  const kpi = dashboard.data?.kpis;
  const firstLate = late.data?.data[0];
  const firstReady = ready.data?.data[0];
  const nextDoc = firstLate ?? firstReady;
  const stockHref = (health: 'OK' | 'LOW' | 'OUT') => {
    const p = new URLSearchParams();
    if (health !== 'OK') p.set('health', health);
    if (scope.categoryId) p.set('category', scope.categoryId);
    return `/stock${p.size ? `?${p}` : ''}`;
  };
  const listHref = (t: OperationType) => `/${TYPE_META[t].path}${scopeSearch(scope, 'OPEN')}`;
  const queues = typeFilter === 'ALL' ? TYPES : [typeFilter];

  return (
    <div className="flex flex-col gap-8">
      <TitleBlock
        sheet={1}
        title={today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        sub={
          revisions
            ? revisions.length
              ? `${user?.name.split(' ')[0]}, ${revisions.length} thing${revisions.length === 1 ? '' : 's'} ${scoped ? 'in this view' : 'on the floor'} need${revisions.length === 1 ? 's' : ''} a person.`
              : `${user?.name.split(' ')[0]}, ${scoped ? 'this part of the floor' : 'the floor'} matches the plan.`
            : 'Reading the floor…'
        }
        cells={[
          { caption: 'Products in stock', value: kpi ? <Link to={stockHref('OK')} className="hover:text-blue">{kpi.productsInStock}</Link> : '·' },
          { caption: 'Low stock', value: kpi ? <Link to={stockHref('LOW')} className="hover:text-blue">{kpi.lowStock}</Link> : '·' },
          { caption: 'Out of stock', value: kpi ? <Link to={stockHref('OUT')}>{kpi.outOfStock}</Link> : '·', alarm: !!kpi?.outOfStock },
          { caption: 'Pending receipts', value: <Pending n={kpi?.pendingReceipts.total} late={kpi?.pendingReceipts.late} to={listHref('RECEIPT')} /> },
          { caption: 'Pending deliveries', value: <Pending n={kpi?.pendingDeliveries.total} late={kpi?.pendingDeliveries.late} to={listHref('DELIVERY')} /> },
          { caption: 'Transfers scheduled', value: <Pending n={kpi?.scheduledTransfers.total} late={kpi?.scheduledTransfers.late} to={listHref('TRANSFER')} /> },
          ...(integrity.data
            ? [{
                caption: 'Ledger',
                value: integrity.data.ok ? (
                  <Link to="/ledger" title={`${integrity.data.balancesChecked} balances re-derived from ${integrity.data.movesChecked} entries`}>
                    <Checked>Checked</Checked>
                  </Link>
                ) : (
                  <Link to="/ledger"><Checked tone="bad">{integrity.data.mismatches.length} off</Checked></Link>
                ),
              }]
            : []),
        ]}
        next={
          nextDoc ? (
            <>
              <Button asChild variant="primary">
                <Link to={docHref(nextDoc)}>{firstLate ? 'Open' : 'Finish'} {nextDoc.reference}</Link>
              </Button>
              <span className="text-sm text-ink-2">{firstLate ? 'Late' : 'Ready to validate'}</span>
            </>
          ) : (
            <span className="text-sm text-ink-2">No document is waiting on you.</span>
          )
        }
      />

      <div className="flex flex-col gap-3" role="group" aria-label="Dashboard filters">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Tabs
            label="Filter by document type"
            value={typeFilter}
            onChange={(v) => setParam('type', v === 'ALL' ? null : v)}
            options={[{ key: 'ALL' as const, label: 'All documents' }, ...TYPES.map((t) => ({ key: t, label: TYPE_META[t].plural }))]}
          />
          <Tabs label="Filter by status" value={status} onChange={(v) => setParam('status', v === 'OPEN' ? null : v)} options={STATUS_FILTERS} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <ScopeFilters />
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <section aria-labelledby="revisions">
          <SectionHead id="revisions" title="Revisions outstanding" count={revisions?.length}>
            <span className="text-sm text-ink-3">Late, waiting, out, short and low, in that order</span>
          </SectionHead>
          {revisions ? <Revisions items={revisions} /> : <Skeleton className="h-72" />}
        </section>

        <section aria-labelledby="plan">
          <SectionHead id="plan" title="Floor plan">
            <Link to="/warehouses" className="text-sm text-blue hover:underline">Warehouses</Link>
          </SectionHead>
          {warehouses.data ? (
            <div className="flex flex-col gap-7 pt-3">
              {warehouses.data.filter((w) => w.isActive && (!scope.warehouseId || w.id === scope.warehouseId)).map((w) => (
                <WarehousePlan key={w.id} warehouse={w} stats={stats} roomHref={(id) => `/stock?location=${id}`} />
              ))}
            </div>
          ) : (
            <Skeleton className="h-72" />
          )}
        </section>
      </div>

      <div className={cn('grid gap-x-6 gap-y-8', queues.length > 1 && 'md:grid-cols-2 2xl:grid-cols-4')}>
        {queues.map((t) => <Queue key={t} type={t} status={status} scope={scope} />)}
      </div>
    </div>
  );
}
