/** Warehouses with their locations, drawn in plan, and the contacts documents are addressed to. */
import {
  locationCreateInput,
  locationUpdateInput,
  partnerCreateInput,
  partnerUpdateInput,
  warehouseCreateInput,
  warehouseUpdateInput,
  type LocationDto,
  type PartnerDto,
  type PartnerKind,
  type WarehouseDto,
} from '@stocksense/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { SectionHead, TitleBlock } from '@/components/drawing';
import { WarehousePlan, type RoomStat } from '@/components/Plan';
import { Button, DetailPanel, Empty, Field, FieldGrid, Input, Pager, SearchCell, Select, Skeleton, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { apiErrors, check, useCan, type Errors } from '@/lib/forms';
import { usePartners, useProducts, useWarehouses, useWrite } from '@/lib/queries';
import { cn } from '@/lib/utils';

// ─── Warehouses ─────────────────────────────────────────────────────────────────────────────

type WhPanel = { kind: 'warehouse'; warehouse?: WarehouseDto } | { kind: 'location'; warehouse: WarehouseDto; location?: LocationDto } | null;

export function WarehousesPage() {
  const { editMaster } = useCan();
  const warehouses = useWarehouses();
  const products = useProducts();
  const [panel, setPanel] = useState<WhPanel>(null);
  const toggleWh = useWrite((w: WarehouseDto) => api.post(`/warehouses/${w.id}/${w.isActive ? 'archive' : 'restore'}`), [['warehouses'], ['locations']]);
  const toggleLoc = useWrite((l: LocationDto) => api.post(`/locations/${l.id}/${l.isActive ? 'archive' : 'restore'}`), [['warehouses'], ['locations']]);

  const stats = useMemo(() => {
    const s: Record<string, RoomStat> = {};
    for (const p of products.data ?? []) for (const l of p.locations) (s[l.id] ??= { products: 0, alarm: 0 }).products += 1;
    return s;
  }, [products.data]);

  const all = warehouses.data ?? [];
  const rooms = all.reduce((n, w) => n + w.locations.filter((l) => l.type === 'INTERNAL').length, 0);

  return (
    <div className="flex flex-col gap-8">
      <TitleBlock
        sheet={8}
        title="Warehouses"
        sub="Each warehouse in plan, one room per location. Open a room to see what it holds."
        cells={[
          { caption: 'Warehouses', value: warehouses.data ? all.filter((w) => w.isActive).length : '·' },
          { caption: 'Locations', value: warehouses.data ? rooms : '·' },
          { caption: 'Archived', value: warehouses.data ? all.filter((w) => !w.isActive).length : '·' },
        ]}
        next={
          editMaster ? (
            <Button variant="primary" onClick={() => setPanel({ kind: 'warehouse' })}>New warehouse</Button>
          ) : (
            <span className="text-sm text-ink-2">Managers add warehouses and locations.</span>
          )
        }
      />

      {warehouses.isPending ? (
        <Skeleton className="h-96" />
      ) : all.length === 0 ? (
        <Empty title="No warehouses yet">Add the first one to start receiving stock.</Empty>
      ) : (
        all.map((w) => {
          const locs = w.locations.filter((l) => l.type === 'INTERNAL');
          return (
            <section key={w.id} aria-labelledby={`wh-${w.id}`} className="grid gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <div>
                <SectionHead id={`wh-${w.id}`} title={`${w.code} · ${w.name}`}>
                  {!w.isActive && <span className="letter text-xs font-bold text-ink-3">Archived</span>}
                </SectionHead>
                <div className="pt-3">
                  <WarehousePlan warehouse={w} stats={stats} roomHref={(id) => `/stock?location=${id}`} />
                </div>
                {w.address && <p className="pt-2 text-sm text-ink-2">{w.address}</p>}
              </div>
              {editMaster && (
                <div>
                  <SectionHead title="Locations" count={locs.length}>
                    <Button size="sm" onClick={() => setPanel({ kind: 'location', warehouse: w })} disabled={!w.isActive}>Add location</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPanel({ kind: 'warehouse', warehouse: w })}>Edit warehouse</Button>
                  </SectionHead>
                  <table className="schedule">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th className="num">Products</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {locs.map((l) => (
                        <tr key={l.id} className={cn(!l.isActive && 'hatch text-ink-3')}>
                          <td className="font-semibold">{l.code}</td>
                          <td>{l.name}{!l.isActive && <span className="letter ml-2 text-2xs">Archived</span>}</td>
                          <td className="num">{stats[l.id]?.products ?? 0}</td>
                          <td className="w-0 whitespace-nowrap">
                            <span className="flex justify-end gap-3">
                              <Button variant="link" onClick={() => setPanel({ kind: 'location', warehouse: w, location: l })}>Edit</Button>
                              <Button variant="link" disabled={!w.isActive} onClick={() => toggleLoc.mutate(l, { onSuccess: () => toast.success(`${l.label} ${l.isActive ? 'archived' : 'restored'}`), onError: (e) => apiErrors(e) })}>
                                {l.isActive ? 'Archive' : 'Restore'}
                              </Button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pt-3">
                    <Button size="sm" variant={w.isActive ? 'danger' : 'secondary'} loading={toggleWh.isPending && toggleWh.variables?.id === w.id} onClick={() => toggleWh.mutate(w, { onSuccess: () => toast.success(`${w.code} ${w.isActive ? 'archived' : 'restored'}`), onError: (e) => apiErrors(e) })}>
                      {w.isActive ? `Archive ${w.code}` : `Restore ${w.code}`}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}

      <WarehousePanel open={panel?.kind === 'warehouse'} onOpenChange={(o) => !o && setPanel(null)} warehouse={panel?.kind === 'warehouse' ? panel.warehouse : undefined} />
      <LocationPanel
        open={panel?.kind === 'location'}
        onOpenChange={(o) => !o && setPanel(null)}
        warehouse={panel?.kind === 'location' ? panel.warehouse : undefined}
        location={panel?.kind === 'location' ? panel.location : undefined}
      />
    </div>
  );
}

function WarehousePanel({ open, onOpenChange, warehouse }: { open: boolean; onOpenChange: (o: boolean) => void; warehouse?: WarehouseDto }) {
  const [form, setForm] = useState({ code: '', name: '', address: '' });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm({ code: warehouse?.code ?? '', name: warehouse?.name ?? '', address: warehouse?.address ?? '' });
    }
  }, [open, warehouse]);
  const save = useWrite((body: unknown) => (warehouse ? api.patch(`/warehouses/${warehouse.id}`, body) : api.post('/warehouses', body)), [['warehouses'], ['locations']]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = check(warehouse ? warehouseUpdateInput : warehouseCreateInput, form);
    if (parsed.errors) return setErrors(parsed.errors);
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(warehouse ? 'Warehouse saved' : `${form.code.toUpperCase()} created with a Stock location`);
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiErrors(err, { ALREADY_EXISTS: 'code' })),
    });
  };
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      detail={warehouse ? 'Edit' : 'New'}
      title={warehouse ? `${warehouse.code} ${warehouse.name}` : 'New warehouse'}
      footer={
        <>
          <Button type="submit" form="wh-form" variant="primary" loading={save.isPending}>{warehouse ? 'Save warehouse' : 'Create warehouse'}</Button>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <form id="wh-form" onSubmit={submit} noValidate>
        <FieldGrid className="grid-cols-[9rem_1fr]">
          <Field label="Code" htmlFor="wh-code" error={errors.code} hint={warehouse && !warehouse.codeEditable ? 'Locked: references like WH1/IN/00001 use it.' : 'Short, e.g. WH3'}>
            <Input id="wh-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="uppercase" disabled={!!warehouse && !warehouse.codeEditable} autoFocus={!warehouse} />
          </Field>
          <Field label="Name" htmlFor="wh-name" error={errors.name}>
            <Input id="wh-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Address" htmlFor="wh-addr" error={errors.address} className="col-span-2">
            <Textarea id="wh-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
          </Field>
        </FieldGrid>
      </form>
    </DetailPanel>
  );
}

function LocationPanel({ open, onOpenChange, warehouse, location }: { open: boolean; onOpenChange: (o: boolean) => void; warehouse?: WarehouseDto; location?: LocationDto }) {
  const [form, setForm] = useState({ code: '', name: '' });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm({ code: location?.code ?? '', name: location?.name ?? '' });
    }
  }, [open, location]);
  const save = useWrite((body: unknown) => (location ? api.patch(`/locations/${location.id}`, body) : api.post('/locations', body)), [['warehouses'], ['locations'], ['stock']]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = location ? form : { ...form, warehouseId: warehouse?.id };
    const parsed = check(location ? locationUpdateInput : locationCreateInput, body);
    if (parsed.errors) return setErrors(parsed.errors);
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(location ? 'Location saved' : 'Location added');
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiErrors(err, { ALREADY_EXISTS: 'code' })),
    });
  };
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      detail={location ? 'Edit' : 'New'}
      title={location ? location.label : `New location in ${warehouse?.code ?? ''}`}
      footer={
        <>
          <Button type="submit" form="loc-form" variant="primary" loading={save.isPending}>{location ? 'Save location' : 'Add location'}</Button>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <form id="loc-form" onSubmit={submit} noValidate>
        <FieldGrid className="grid-cols-[9rem_1fr]">
          <Field label="Code" htmlFor="loc-code" error={errors.code} hint="e.g. RACKC">
            <Input id="loc-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="uppercase" autoFocus />
          </Field>
          <Field label="Name" htmlFor="loc-name" error={errors.name}>
            <Input id="loc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </FieldGrid>
      </form>
    </DetailPanel>
  );
}

// ─── Contacts ───────────────────────────────────────────────────────────────────────────────

export function ContactsPage() {
  const { editMaster } = useCan();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'ALL';
  const search = params.get('q') ?? '';
  const archived = params.get('archived') === '1';
  const page = Number(params.get('page') ?? 1);
  const [panel, setPanel] = useState<{ partner?: PartnerDto } | null>(null);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const q = usePartners({ kind: kind === 'ALL' ? undefined : kind, search: search || undefined, active: archived ? 'false' : 'true', page, pageSize: 25 });
  const suppliers = usePartners({ kind: 'SUPPLIER', pageSize: 1 });
  const customers = usePartners({ kind: 'CUSTOMER', pageSize: 1 });
  const total = q.data?.page.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <TitleBlock
        sheet={9}
        title="Contacts"
        sub="Suppliers you receive from and customers you deliver to."
        cells={[
          { caption: 'Suppliers', value: suppliers.data?.page.total ?? '·' },
          { caption: 'Customers', value: customers.data?.page.total ?? '·' },
        ]}
        next={
          editMaster ? (
            <Button variant="primary" onClick={() => setPanel({})}>New contact</Button>
          ) : (
            <span className="text-sm text-ink-2">Managers add and edit contacts.</span>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchCell value={search} onChange={(v) => set('q', v || null)} placeholder="Name or email" label="Search contacts" />
        <Tabs
          label="Kind"
          value={kind}
          onChange={(v) => set('kind', v === 'ALL' ? null : v)}
          options={[
            { key: 'ALL', label: 'All' },
            { key: 'SUPPLIER', label: 'Suppliers' },
            { key: 'CUSTOMER', label: 'Customers' },
          ]}
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={archived} onChange={(e) => set('archived', e.target.checked ? '1' : null)} className="size-4 accent-[var(--ink)]" />
          Archived contacts
        </label>
      </div>
      {q.isPending ? (
        <Skeleton className="h-80" />
      ) : total === 0 ? (
        <Empty title="No contacts match">Clear the search or pick another kind.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="schedule min-w-[760px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((p) => (
                  <tr key={p.id} data-link={editMaster ? '' : undefined} className={cn(!p.isActive && 'text-ink-3')}>
                    <td className="font-semibold">
                      {editMaster ? (
                        <button type="button" onClick={() => setPanel({ partner: p })} className="row-link text-left font-semibold">{p.name}</button>
                      ) : (
                        p.name
                      )}
                    </td>
                    <td><span className={cn('letter text-xs font-semibold', p.kind === 'SUPPLIER' ? 'text-ink' : 'text-ink-2')}>{p.kind === 'SUPPLIER' ? 'Supplier' : 'Customer'}</span></td>
                    <td className="text-sm">{p.email ? <a href={`mailto:${p.email}`} className="relative z-[1] text-blue hover:underline">{p.email}</a> : '·'}</td>
                    <td className="whitespace-nowrap text-sm text-ink-2">{p.phone ?? '·'}</td>
                    <td className="max-w-72 truncate text-sm text-ink-2">{p.address ?? '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={Math.max(1, Math.ceil(total / 25))} onPage={(p) => set('page', String(p))} />
        </>
      )}
      <ContactPanel open={!!panel} onOpenChange={(o) => !o && setPanel(null)} partner={panel?.partner} />
    </div>
  );
}

function ContactPanel({ open, onOpenChange, partner }: { open: boolean; onOpenChange: (o: boolean) => void; partner?: PartnerDto }) {
  const [form, setForm] = useState({ name: '', kind: 'SUPPLIER' as PartnerKind, email: '', phone: '', address: '' });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm({ name: partner?.name ?? '', kind: partner?.kind ?? 'SUPPLIER', email: partner?.email ?? '', phone: partner?.phone ?? '', address: partner?.address ?? '' });
    }
  }, [open, partner]);
  const save = useWrite((body: unknown) => (partner ? api.patch(`/partners/${partner.id}`, body) : api.post('/partners', body)), [['partners']]);
  const toggle = useWrite(() => api.post(`/partners/${partner!.id}/${partner!.isActive ? 'archive' : 'restore'}`), [['partners']]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, email: form.email.trim() || null };
    const parsed = check(partner ? partnerUpdateInput : partnerCreateInput, body);
    if (parsed.errors) return setErrors(parsed.errors);
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(partner ? 'Contact saved' : 'Contact added');
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiErrors(err, { ALREADY_EXISTS: 'name' })),
    });
  };
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      detail={partner ? 'Edit' : 'New'}
      title={partner ? partner.name : 'New contact'}
      footer={
        <>
          <Button type="submit" form="contact-form" variant="primary" loading={save.isPending}>{partner ? 'Save contact' : 'Add contact'}</Button>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {partner && (
            <Button
              variant={partner.isActive ? 'danger' : 'secondary'}
              className="ml-auto"
              loading={toggle.isPending}
              onClick={() => toggle.mutate(undefined, { onSuccess: () => { toast.success(partner.isActive ? 'Contact archived' : 'Contact restored'); onOpenChange(false); }, onError: (e) => apiErrors(e) })}
            >
              {partner.isActive ? 'Archive' : 'Restore'}
            </Button>
          )}
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} noValidate>
        <FieldGrid className="grid-cols-2">
          <Field label="Name" htmlFor="c-name" error={errors.name} className="col-span-2">
            <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!partner} />
          </Field>
          <Field label="Kind" htmlFor="c-kind" error={errors.kind}>
            <Select id="c-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PartnerKind })}>
              <option value="SUPPLIER">Supplier</option>
              <option value="CUSTOMER">Customer</option>
            </Select>
          </Field>
          <Field label="Phone" htmlFor="c-phone" error={errors.phone}>
            <Input id="c-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={errors.email} className="col-span-2">
            <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Address" htmlFor="c-addr" error={errors.address} className="col-span-2">
            <Textarea id="c-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
          </Field>
        </FieldGrid>
      </form>
    </DetailPanel>
  );
}
