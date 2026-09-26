import {
  canOperate,
  canTransition,
  LOCATION_RULES,
  OPERATION_STATUSES,
  PARTNER_RULES,
  SYSTEM_LOCATION_IDS,
  type OperationAction,
  type OperationDto,
  type OperationType,
} from '@stocksense/shared';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Balloon, Delta, ProcessLine, SectionHead, StatusTag, TitleBlock } from '@/components/drawing';
import { ScopeFilters, useScope } from '@/components/ScopeFilters';
import { Button, Confirm, Empty, Field, FieldGrid, Input, Note, Pager, SearchCell, Select, Skeleton, Tabs, Textarea } from '@/components/ui';
import { api, isApiError } from '@/lib/api';
import { SHEETS, STATUS_LABEL, TYPE_META } from '@/lib/domain';
import { apiErrors, type Errors } from '@/lib/forms';
import type { DataChanged } from '@/lib/live';
import { useLocations, useOperation, useOperationAction, useOperations, usePartners, useProducts, useQueueCounts, useWrite } from '@/lib/queries';
import { cn, fmtDate, fmtQty, uomLabel } from '@/lib/utils';

const sheetOf = (type: OperationType) => SHEETS.find((s) => s.type === type)!.no;

export function OperationListPage({ type }: { type: OperationType }) {
  const meta = TYPE_META[type];
  const { user } = useAuth();
  const counts = useQueueCounts();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'OPEN';
  const search = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const set = (k: string, v: string | null) => {
    // The live URL, not this render's params: the scope filters write to it too.
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const { scope, active: scoped } = useScope();
  const q = useOperations({
    type,
    status: status === 'OPEN' || status === 'LATE' ? 'DRAFT,WAITING,READY' : status === 'ALL' ? undefined : status,
    late: status === 'LATE' ? true : undefined,
    search: search || undefined,
    ...scope,
    sort: status === 'DONE' || status === 'CANCELED' || status === 'ALL' ? '-createdAt' : 'scheduledDate',
    page,
    pageSize: 25,
  });
  const total = q.data?.page.total ?? 0;
  const c = counts.data?.[type];
  const canCreate = !!user && canOperate(user.role, 'create', type);

  return (
    <div className="flex flex-col gap-6">
      <TitleBlock
        sheet={sheetOf(type)}
        title={meta.plural}
        sub={
          {
            RECEIPT: 'Goods arriving from suppliers. Validating one adds the stock.',
            DELIVERY: 'Goods leaving for customers: pick, pack, then validate.',
            TRANSFER: 'Stock moving between locations. The total never changes, only where it sits.',
            ADJUSTMENT: 'Counts. Validating one posts the difference between what was counted and what the ledger says.',
          }[type]
        }
        cells={[
          { caption: 'Open', value: c?.open ?? '·' },
          { caption: 'Late', value: c?.late ?? '·', alarm: !!c?.late },
          { caption: 'Reference', value: `WH/${meta.code}/…` },
        ]}
        next={
          canCreate ? (
            <Button asChild variant="primary">
              <Link to={`/${meta.path}/new`}>New {meta.label.toLowerCase()}</Link>
            </Button>
          ) : (
            <span className="text-sm text-ink-2">Managers create {meta.plural.toLowerCase()}.</span>
          )
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <SearchCell value={search} onChange={(v) => set('q', v || null)} placeholder="Reference or contact" label="Search documents" />
          <Tabs
            label="Filter by status"
            value={status}
            onChange={(v) => set('status', v === 'OPEN' ? null : v)}
            options={[
              { key: 'OPEN', label: 'Open' },
              { key: 'LATE', label: 'Late', count: c?.late, alarm: true },
              ...OPERATION_STATUSES.map((s) => ({ key: s as string, label: STATUS_LABEL[s] })),
              { key: 'ALL', label: 'All' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <ScopeFilters />
        </div>
      </div>

      {q.isPending ? (
        <Skeleton className="h-80" />
      ) : q.data?.data.length === 0 ? (
        <Empty
          title={`No ${meta.plural.toLowerCase()} here`}
          action={canCreate ? <Button asChild size="sm"><Link to={`/${meta.path}/new`}>New {meta.label.toLowerCase()}</Link></Button> : undefined}
        >
          {scoped ? 'Try another status, or clear the search and filters.' : 'Try another status, or clear the search.'}
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="schedule min-w-[760px]">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>{meta.partner ?? 'Route'}</th>
                  <th>{type === 'ADJUSTMENT' ? 'Counted at' : 'From → To'}</th>
                  <th>Scheduled</th>
                  <th className="num">Lines</th>
                  <th>Progress</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((d) => {
                  const late = d.isLate && d.status !== 'DONE' && d.status !== 'CANCELED';
                  return (
                    <tr key={d.id} data-link className={cn(d.status === 'CANCELED' && 'text-ink-3')}>
                      <td className="whitespace-nowrap">
                        <Link to={`/${meta.path}/${d.id}`} className="row-link font-semibold">{d.reference}</Link>
                      </td>
                      <td className="max-w-56 truncate">{d.partner?.name ?? <span className="text-ink-3">·</span>}</td>
                      <td className="text-sm text-ink-2">{type === 'ADJUSTMENT' ? d.dest.label : `${d.source.label} → ${d.dest.label}`}</td>
                      <td className={cn('whitespace-nowrap text-sm', late ? 'font-semibold text-red' : 'text-ink-2')}>{fmtDate(d.scheduledDate)}</td>
                      <td className="num text-ink-2">{d.lines.length}</td>
                      <td><ProcessLine op={d} compact /></td>
                      <td><StatusTag status={d.status} late={late} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={Math.max(1, Math.ceil(total / 25))} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}

const ACTION_LABEL: Partial<Record<OperationAction, string>> = {
  confirm: 'Mark ready',
  'check-availability': 'Check stock again',
  pick: 'Mark picked',
  unpick: 'Undo pick',
  pack: 'Mark packed',
  unpack: 'Undo pack',
  validate: 'Validate',
  'reset-to-draft': 'Back to draft',
  cancel: 'Cancel document',
};

const ACTION_DONE: Partial<Record<OperationAction, string>> = {
  confirm: 'Marked ready',
  'check-availability': 'Stock checked',
  pick: 'Marked picked',
  unpick: 'Pick undone',
  pack: 'Marked packed',
  unpack: 'Pack undone',
  validate: 'Validated. Stock updated',
  'reset-to-draft': 'Back in draft',
  cancel: 'Document canceled',
};

function actionsFor(op: OperationDto, role: 'MANAGER' | 'STAFF') {
  const order: OperationAction[] = ['confirm', 'check-availability', 'pick', 'unpick', 'pack', 'unpack', 'validate', 'reset-to-draft', 'cancel'];
  return order.filter((a) => {
    if (!canTransition(a, op.type, op.status) || !canOperate(role, a, op.type)) return false;
    if (a === 'pick') return !op.pickedAt;
    if (a === 'unpick') return !!op.pickedAt && !op.packedAt;
    if (a === 'pack') return !!op.pickedAt && !op.packedAt;
    if (a === 'unpack') return !!op.packedAt;
    if (a === 'validate' && op.type === 'DELIVERY') return !!op.packedAt;
    return true;
  });
}

export function OperationDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useOperation(id);
  const act = useOperationAction(id);
  const [balanceChanged, setBalanceChanged] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const op = q.data;

  // Live: when someone else moves this document on, say who (the cache refetches on its own).
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<DataChanged>).detail;
      if (d.operationId === id && d.actorName && d.actorName !== user?.name && (d.version ?? 0) > (op?.version ?? 0))
        toast(`${d.actorName} just changed this document`, { description: 'It has been updated in place.' });
    };
    window.addEventListener('stocksense:changed', onChange);
    return () => window.removeEventListener('stocksense:changed', onChange);
  }, [id, user?.name, op?.version]);

  if (q.isPending) return <Skeleton className="h-96" />;
  if (!op || !user)
    return <Empty title="Document not found">It may have been removed, or the link is wrong.</Empty>;

  const meta = TYPE_META[op.type];
  const actions = actionsFor(op, user.role);
  // The highlighted button is always the document's next step forward.
  const primary = (['validate', 'pack', 'pick', 'confirm', 'check-availability'] as const).find((a) => actions.includes(a));
  const secondary = actions.filter((a) => a !== primary && a !== 'pick' && a !== 'pack' && a !== 'unpick' && a !== 'unpack');
  const canEdit = op.status === 'DRAFT' && canOperate(user.role, 'edit', op.type);
  const isAdj = op.type === 'ADJUSTMENT';
  const shortLines = op.lines.filter((l) => l.shortBy && Number(l.shortBy) > 0);
  const late = op.isLate && op.status !== 'DONE' && op.status !== 'CANCELED';
  const checklist = op.type === 'DELIVERY' && (op.status === 'READY' || op.status === 'WAITING' || op.status === 'DONE');

  const run = (action: OperationAction, acknowledgeBalanceChange?: boolean) => {
    act.mutate(
      { action, version: op.version, acknowledgeBalanceChange },
      {
        onSuccess: (res) => {
          setBalanceChanged(false);
          setConfirmCancel(false);
          toast.success(res.replayed ? 'Already validated' : (ACTION_DONE[action] ?? 'Done'), {
            description: res.posted ? `${res.posted.movesPosted} ledger ${res.posted.movesPosted === 1 ? 'entry' : 'entries'} posted` : undefined,
          });
        },
        onError: (e) => {
          setConfirmCancel(false);
          if (isApiError(e, 'BALANCE_CHANGED')) return setBalanceChanged(true);
          if (isApiError(e, 'STALE_VERSION')) {
            void q.refetch();
            return toast.error('Someone else changed this document', { description: 'It has been reloaded. Check it and try again.' });
          }
          if (isApiError(e, 'INSUFFICIENT_STOCK')) {
            void q.refetch();
            return toast.error('Not enough stock', { description: e.error.message });
          }
          toast.error(isApiError(e) ? e.error.message : 'Something went wrong');
        },
      },
    );
  };
  const busy = (a: OperationAction) => act.isPending && act.variables?.action === a;

  return (
    <div className="flex flex-col gap-8">
      <Link to={`/${meta.path}`} className="w-fit text-sm text-blue hover:underline">← {meta.plural}</Link>

      <TitleBlock
        sheet={sheetOf(op.type)}
        title={op.reference}
        sub={<StatusTag status={op.status} late={late} className="mt-1" />}
        cells={[
          { caption: isAdj ? 'Counted at' : 'From', value: isAdj ? op.dest.label : op.source.label },
          ...(isAdj ? [] : [{ caption: 'To', value: op.dest.label }]),
          ...(meta.partner ? [{ caption: meta.partner, value: op.partner?.name ?? '·' }] : []),
          { caption: 'Scheduled', value: fmtDate(op.scheduledDate), alarm: late },
          { caption: 'Responsible', value: op.responsible?.name ?? '·' },
          op.validatedBy
            ? { caption: 'Validated by', value: `${op.validatedBy.name}, ${fmtDate(op.validatedAt)}` }
            : op.canceledBy
              ? { caption: 'Canceled by', value: `${op.canceledBy.name}, ${fmtDate(op.canceledAt)}` }
              : { caption: 'Created by', value: `${op.createdBy.name}, ${fmtDate(op.createdAt)}` },
        ]}
        next={
          primary || canEdit || secondary.length ? (
            <>
              {primary && (
                <Button variant="primary" loading={busy(primary)} onClick={() => run(primary)}>
                  {ACTION_LABEL[primary]}
                </Button>
              )}
              {canEdit && (
                <Button asChild variant={primary ? 'secondary' : 'primary'}>
                  <Link to={`/${meta.path}/${op.id}/edit`}>Edit</Link>
                </Button>
              )}
              {secondary.map((a) => (
                <Button key={a} size="sm" variant={a === 'cancel' ? 'danger' : 'ghost'} loading={busy(a)} onClick={() => (a === 'cancel' ? setConfirmCancel(true) : run(a))}>
                  {ACTION_LABEL[a]}
                </Button>
              ))}
            </>
          ) : op.status === 'DONE' ? (
            <span className="letter bg-yellow px-2 py-0.5 text-sm font-bold">Checked and posted</span>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-start gap-x-12 gap-y-6">
        <section aria-label="Progress">
          <ProcessLine op={op} />
        </section>
        {checklist && (
          <section aria-labelledby="checklist" className="min-w-72 flex-1">
            <h2 id="checklist" className="letter pb-1.5 text-sm font-bold">Pick and pack</h2>
            <ul className="border-y-2 border-ink">
              {([
                ['pick', 'unpick', 'Picked from the shelves', op.pickedAt],
                ['pack', 'unpack', 'Packed for dispatch', op.packedAt],
              ] as const).map(([doIt, undo, label, at]) => {
                const can = actions.includes(doIt);
                const canUndo = actions.includes(undo);
                return (
                  <li key={doIt} className="flex items-center gap-3 border-b border-rule-2 py-2 last:border-b-0">
                    <button
                      type="button"
                      disabled={!(can || canUndo)}
                      onClick={() => run(at ? undo : doIt)}
                      aria-pressed={!!at}
                      aria-label={at ? `Undo: ${label}` : label}
                      className={cn(
                        'flex size-6 items-center justify-center border border-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        at ? 'bg-yellow' : 'bg-sheet hover:bg-sheet-2',
                      )}
                    >
                      {at && <Check className="size-4" strokeWidth={3} />}
                    </button>
                    <span className={cn('flex-1', !at && !can && 'text-ink-3')}>{label}</span>
                    <span className="text-sm text-ink-3">{at ? fmtDate(at, true) : can ? 'Next' : op.status === 'WAITING' ? 'Waiting for stock' : ''}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {op.notes && (
        <p className="max-w-[75ch] border border-dashed border-ink-3 px-4 py-2.5 text-ink-2">
          <span className="letter mr-2 text-2xs font-semibold text-ink-3">Note</span>
          {op.notes}
        </p>
      )}

      {shortLines.length > 0 && op.status !== 'DONE' && op.status !== 'CANCELED' && (
        <Note tone="red" title={`Short at ${op.source.label}`}>
          {shortLines.length === 1 ? 'One line is' : `${shortLines.length} lines are`} missing stock. The document waits until a receipt or transfer brings it in; then check stock again.
        </Note>
      )}

      {balanceChanged && (
        <Note
          tone="red"
          role="alert"
          title="Stock moved since this count"
          actions={
            <>
              <Button size="sm" onClick={() => setBalanceChanged(false)}>Keep as is</Button>
              <Button size="sm" variant="primary" loading={busy('validate')} onClick={() => run('validate', true)}>Validate anyway</Button>
            </>
          }
        >
          Validating now posts the counted quantity minus today's balance, not the balance at count time.
        </Note>
      )}

      <section aria-labelledby="lines">
        <SectionHead id="lines" title="Lines" count={op.lines.length} />
        <div className="overflow-x-auto">
          <table className="schedule min-w-[620px]">
            <thead>
              <tr>
                <th className="w-12">Item</th>
                <th>Product</th>
                {isAdj ? (
                  <>
                    <th className="num">At count</th>
                    <th className="num">Counted</th>
                    <th className="num">Difference</th>
                  </>
                ) : (
                  <>
                    <th className="num">Quantity</th>
                    {op.type !== 'RECEIPT' && op.status !== 'DONE' && <th className="num">At {op.source.label}</th>}
                    {op.status === 'DONE' && <th className="num">Posted</th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {op.lines.map((l, i) => {
                const short = !!l.shortBy && Number(l.shortBy) > 0 && op.status !== 'DONE' && op.status !== 'CANCELED';
                const diff = isAdj && l.countedQuantity !== null && l.balanceAtCount !== null ? Number(l.countedQuantity) - Number(l.balanceAtCount) : null;
                return (
                  <tr key={l.id} className={cn(short && 'bg-red-wash')}>
                    <td>{short ? <Delta n={i + 1} className="text-lg" /> : <Balloon n={i + 1} />}</td>
                    <td>
                      <Link to={`/stock/${l.productId}`} className="font-semibold hover:text-blue">{l.productName}</Link>
                      <span className="block text-sm text-ink-3">{l.sku}{!l.productActive && ', archived'}</span>
                    </td>
                    {isAdj ? (
                      <>
                        <td className="num text-ink-2">{fmtQty(l.balanceAtCount, l.uom)}</td>
                        <td className="num text-md font-semibold">{fmtQty(l.countedQuantity, l.uom)} <span className="text-sm font-normal text-ink-3">{uomLabel(l.uom)}</span></td>
                        <td className={cn('num font-semibold', diff !== null && diff < 0 ? 'text-red' : diff ? 'text-ink' : 'text-ink-3')}>
                          {diff === null ? '·' : diff === 0 ? 'Matches' : `${diff > 0 ? '+' : '−'}${fmtQty(Math.abs(diff), l.uom)}`}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num">
                          <span className="text-md font-semibold">{fmtQty(l.quantity, l.uom)}</span>
                          <span className="ml-1 text-sm text-ink-3">{uomLabel(l.uom)}</span>
                        </td>
                        {op.type !== 'RECEIPT' && op.status !== 'DONE' && (
                          <td className={cn('num', short ? 'font-semibold text-red' : 'text-ink-2')}>
                            {fmtQty(l.onHand, l.uom)}
                            {short && <span className="block text-sm">short {fmtQty(l.shortBy, l.uom)}</span>}
                          </td>
                        )}
                        {op.status === 'DONE' && <td className="num font-semibold"><span className="highlight px-0.5">{fmtQty(l.postedQuantity, l.uom)}</span></td>}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Confirm
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${op.reference}?`}
        confirmLabel="Cancel document"
        danger
        loading={busy('cancel')}
        onConfirm={() => run('cancel')}
      >
        A canceled document can't be reopened. Nothing has been posted, so stock stays as it is.
      </Confirm>
    </div>
  );
}

// ─── Create and edit ────────────────────────────────────────────────────────────────────────

interface FormLine {
  key: number;
  productId: string;
  qty: string;
}

let lineKey = 0;

/** New document, or edit a Draft. Receipts arrive pre-filled from Replenish (?product=&qty=&warehouse=). */
export function OperationFormPage({ type }: { type: OperationType }) {
  const meta = TYPE_META[type];
  const { id } = useParams();
  const editing = !!id;
  const existing = useOperation(id ?? '');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const products = useProducts();
  const locations = useLocations();
  const partnerKind = PARTNER_RULES[type];
  const partners = usePartners({ kind: partnerKind, pageSize: 100 });
  const rules = LOCATION_RULES[type];
  const isAdj = type === 'ADJUSTMENT';

  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FormLine[]>([{ key: lineKey++, productId: '', qty: '' }]);
  const [errors, setErrors] = useState<Errors>({});
  const [seeded, setSeeded] = useState(false);

  // Fill the form once: from the draft being edited, or from Replenish's query string.
  useEffect(() => {
    if (seeded) return;
    if (editing) {
      const op = existing.data;
      if (!op) return;
      setSource(op.source.id);
      setDest(op.dest.id);
      setPartnerId(op.partner?.id ?? '');
      setDate(op.scheduledDate ? op.scheduledDate.slice(0, 10) : '');
      setNotes(op.notes ?? '');
      setLines(op.lines.map((l) => ({ key: lineKey++, productId: l.productId, qty: String(Number(isAdj ? l.countedQuantity : l.quantity) || '') })));
      setSeeded(true);
      return;
    }
    if (!locations.data) return;
    const wh = params.get('warehouse');
    const internal = locations.data.filter((l) => l.type === 'INTERNAL' && (!wh || l.warehouseId === wh));
    const stockLoc = internal.find((l) => l.code === 'STOCK') ?? internal[0];
    if (rules.source === 'INTERNAL') setSource(stockLoc?.id ?? '');
    else setSource(SYSTEM_LOCATION_IDS[rules.source as 'VENDOR' | 'ADJUSTMENT']);
    if (rules.dest === 'INTERNAL') setDest(rules.source === 'INTERNAL' ? '' : (stockLoc?.id ?? ''));
    else setDest(SYSTEM_LOCATION_IDS[rules.dest as 'CUSTOMER']);
    const product = params.get('product');
    if (product) setLines([{ key: lineKey++, productId: product, qty: params.get('qty') ?? '' }]);
    setDate(new Date().toISOString().slice(0, 10));
    setSeeded(true);
  }, [seeded, editing, existing.data, locations.data, params, rules, isAdj]);

  const internalLocs = locations.data?.filter((l) => l.type === 'INTERNAL') ?? [];
  const activeProducts = products.data?.filter((p) => p.isActive) ?? [];
  const stockAt = (productId: string, locId: string) =>
    products.data?.find((p) => p.id === productId)?.locations.find((l) => l.id === locId)?.onHand ?? 0;
  const drawFrom = rules.source === 'INTERNAL' ? source : isAdj ? dest : '';

  const save = useWrite(
    (body: Record<string, unknown>) =>
      editing ? api.patch<OperationDto>(`/operations/${id}`, { ...body, version: existing.data!.version }) : api.post<OperationDto>('/operations', { type, ...body }),
    [['operations']],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!source) errs.sourceLocationId = 'Choose a location';
    if (!dest) errs.destLocationId = 'Choose a location';
    if (source && source === dest) errs.destLocationId = 'Source and destination must differ';
    const filled = lines.filter((l) => l.productId || l.qty);
    if (filled.length === 0) errs.lines = 'Add at least one product';
    filled.forEach((l, i) => {
      if (!l.productId) errs[`lines.${i}.productId`] = 'Choose a product';
      if (l.qty.trim() === '') errs[`lines.${i}.${isAdj ? 'countedQuantity' : 'quantity'}`] = isAdj ? 'Enter the count' : 'Enter a quantity';
    });
    if (Object.keys(errs).length) return setErrors(errs);
    setErrors({});
    save.mutate(
      {
        sourceLocationId: source,
        destLocationId: dest,
        partnerId: partnerId || null,
        scheduledDate: date ? new Date(`${date}T09:00:00`).toISOString() : null,
        notes: notes.trim() || null,
        lines: filled.map((l) => ({ productId: l.productId, [isAdj ? 'countedQuantity' : 'quantity']: l.qty.trim() })),
      },
      {
        onSuccess: (op) => {
          toast.success(editing ? 'Draft saved' : `${op.reference} drafted`);
          navigate(`/${meta.path}/${op.id}`);
        },
        onError: (err) => {
          if (isApiError(err, 'STALE_VERSION')) {
            void existing.refetch();
            setSeeded(false);
            toast.error('Someone else changed this draft', { description: 'It has been reloaded with their changes.' });
            return;
          }
          setErrors(apiErrors(err, { SAME_LOCATION: 'destLocationId', INACTIVE_REFERENCE: 'lines' }));
        },
      },
    );
  };

  if (editing && existing.isPending) return <Skeleton className="h-96" />;
  if (editing && existing.data && existing.data.status !== 'DRAFT')
    return <Empty title="Only drafts can be edited" action={<Button asChild size="sm"><Link to={`/${meta.path}/${id}`}>Back to {existing.data.reference}</Link></Button>}>Move it back to draft first.</Empty>;

  const locSelect = (which: 'source' | 'dest') => {
    const value = which === 'source' ? source : dest;
    const setter = which === 'source' ? setSource : setDest;
    const err = which === 'source' ? errors.sourceLocationId : errors.destLocationId;
    const label = isAdj ? 'Counted at' : which === 'source' ? 'From' : 'To';
    return (
      <Field label={label} htmlFor={which} error={err}>
        <Select id={which} value={value} onChange={(e) => setter(e.target.value)} aria-invalid={!!err}>
          <option value="">Choose a location…</option>
          {internalLocs.map((l) => <option key={l.id} value={l.id} disabled={!l.isActive}>{l.label}</option>)}
        </Select>
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <Link to={editing ? `/${meta.path}/${id}` : `/${meta.path}`} className="w-fit text-sm text-blue hover:underline">
        ← {editing ? existing.data?.reference : meta.plural}
      </Link>
      <TitleBlock
        sheet={sheetOf(type)}
        title={editing ? `Edit ${existing.data?.reference}` : `New ${meta.label.toLowerCase()}`}
        sub={editing ? 'Drafts can change freely. Nothing posts to the ledger until the document is validated.' : `Saved as a draft with the next WH/${meta.code} reference. Nothing posts until it's validated.`}
        next={
          <>
            <Button type="submit" variant="primary" loading={save.isPending}>{editing ? 'Save draft' : 'Create draft'}</Button>
            <Button asChild variant="ghost" size="sm"><Link to={editing ? `/${meta.path}/${id}` : `/${meta.path}`}>Cancel</Link></Button>
          </>
        }
      />

      <section aria-labelledby="header">
        <SectionHead id="header" title="Header" />
        <FieldGrid className="grid-cols-1 sm:grid-cols-3">
          {partnerKind && (
            <Field label={meta.partner!} htmlFor="partner" error={errors.partnerId}>
              <Select id="partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">None</option>
                {partners.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          )}
          {rules.source === 'INTERNAL' && locSelect('source')}
          {rules.dest === 'INTERNAL' && locSelect('dest')}
          <Field label="Scheduled" htmlFor="date" error={errors.scheduledDate}>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="notes" className="sm:col-span-3">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional: vehicle, gate, anything the floor should know" />
          </Field>
        </FieldGrid>
      </section>

      <section aria-labelledby="form-lines">
        <SectionHead id="form-lines" title="Lines" count={lines.length}>
          <Button size="sm" onClick={() => setLines((ls) => [...ls, { key: lineKey++, productId: '', qty: '' }])}>
            <Plus /> Add line
          </Button>
        </SectionHead>
        {errors.lines && <p className="pb-2 text-sm text-red">{errors.lines}</p>}
        <div className="overflow-x-auto">
          <table className="schedule min-w-[640px]">
            <thead>
              <tr>
                <th className="w-12">Item</th>
                <th>Product</th>
                {drawFrom && <th className="num">{isAdj ? 'Ledger says' : 'Available'}</th>}
                <th className="w-44 num">{isAdj ? 'Counted' : 'Quantity'}</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const p = activeProducts.find((x) => x.id === l.productId);
                const avail = drawFrom && l.productId ? stockAt(l.productId, drawFrom) : null;
                const over = !isAdj && avail !== null && l.qty !== '' && Number(l.qty) > avail;
                const qtyErr = errors[`lines.${i}.${isAdj ? 'countedQuantity' : 'quantity'}`];
                const productErr = errors[`lines.${i}.productId`];
                return (
                  <tr key={l.key}>
                    <td><Balloon n={i + 1} /></td>
                    <td>
                      <select
                        value={l.productId}
                        onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, productId: e.target.value } : x)))}
                        aria-label={`Product for line ${i + 1}`}
                        aria-invalid={!!productErr}
                        className={cn('h-8 w-full border bg-sheet px-2 outline-none focus:border-blue', productErr ? 'border-red' : 'border-rule')}
                      >
                        <option value="">Choose a product…</option>
                        {activeProducts.map((x) => (
                          <option key={x.id} value={x.id} disabled={lines.some((o) => o.key !== l.key && o.productId === x.id)}>
                            {x.sku} · {x.name}
                          </option>
                        ))}
                      </select>
                      {productErr && <span className="block pt-1 text-sm text-red">{productErr}</span>}
                    </td>
                    {drawFrom && (
                      <td className={cn('num whitespace-nowrap', over ? 'font-semibold text-red' : 'text-ink-2')}>
                        {avail !== null && p ? `${fmtQty(avail, p.uom)} ${uomLabel(p.uom)}` : '·'}
                        {over && <span className="block text-sm">will wait for stock</span>}
                      </td>
                    )}
                    <td>
                      <span className={cn('flex h-8 items-center border bg-sheet focus-within:border-blue', qtyErr ? 'border-red' : 'border-rule')}>
                        <input
                          value={l.qty}
                          inputMode="decimal"
                          onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))}
                          aria-label={`${isAdj ? 'Counted quantity' : 'Quantity'} for line ${i + 1}`}
                          aria-invalid={!!qtyErr}
                          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right font-semibold outline-none"
                        />
                        <span className="pr-2 text-sm text-ink-3">{p ? uomLabel(p.uom) : ''}</span>
                      </span>
                      {qtyErr && <span className="block pt-1 text-right text-sm text-red">{qtyErr}</span>}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [{ key: lineKey++, productId: '', qty: '' }]))}
                        aria-label={`Remove line ${i + 1}`}
                        className="flex size-8 items-center justify-center text-ink-3 hover:bg-red-wash hover:text-red"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isAdj && rules.source === 'INTERNAL' && (
          <p className="pt-2 text-sm text-ink-3">A line asking for more than is available is allowed; the document waits until stock arrives.</p>
        )}
      </section>
    </form>
  );
}
