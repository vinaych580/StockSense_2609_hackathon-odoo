/** Detail sheets for product master data: create and edit, categories, and CSV import. */
import {
  productCreateInput,
  productUpdateInput,
  UOMS,
  type CategoryDto,
  type ProductDto,
  type ProductImportResult,
  type Uom,
} from '@stocksense/shared';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Delta } from '@/components/drawing';
import { Button, DetailPanel, Field, FieldGrid, Input, Note, Select } from '@/components/ui';
import { api } from '@/lib/api';
import type { ProductStock } from '@/lib/domain';
import { apiErrors, check, type Errors } from '@/lib/forms';
import { useCategories, useLocations, useWrite } from '@/lib/queries';
import { cn, uomLabel } from '@/lib/utils';

const UOM_NAME: Record<Uom, string> = { UNIT: 'Units', BOX: 'Boxes', KG: 'Kilograms', L: 'Litres', M: 'Metres' };

interface Line {
  locationId: string;
  quantity: string;
}

/** New product (with opening stock posted through an adjustment) or edit an existing one. */
export function ProductPanel({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product?: ProductStock }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const locations = useLocations();
  const editing = !!product;
  const blank = { sku: '', name: '', categoryId: '', uom: 'UNIT' as Uom, unitCost: '' };
  const [form, setForm] = useState(blank);
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setLines([]);
    setForm(
      product
        ? { sku: product.sku, name: product.name, categoryId: product.categoryId ?? '', uom: product.uom, unitCost: product.unitCost ?? '' }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  const save = useWrite(
    (body: unknown) =>
      product ? api.patch<ProductDto>(`/products/${product.id}`, body) : api.post<ProductDto>('/products', body),
    [['stock'], ['moves'], ['categories'], ['operations']],
  );

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = {
      sku: form.sku,
      name: form.name,
      categoryId: form.categoryId || null,
      uom: form.uom,
      unitCost: form.unitCost.trim() || null,
      ...(editing ? {} : { initialStock: lines.filter((l) => l.locationId || l.quantity).length ? lines : undefined }),
    };
    const parsed = check(editing ? productUpdateInput : productCreateInput, body);
    if (parsed.errors) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (p) => {
        toast.success(editing ? 'Product saved' : `${p.sku} created`, {
          description: !editing && lines.length ? 'Opening stock posted to the ledger through an adjustment.' : undefined,
        });
        onOpenChange(false);
        if (!editing) navigate(`/stock/${p.id}`);
      },
      onError: (err) => setErrors(apiErrors(err, { SKU_TAKEN: 'sku', UOM_LOCKED: 'uom', UOM_PRECISION: 'initialStock' })),
    });
  };

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      detail={editing ? 'Edit' : 'New'}
      title={editing ? `${product.sku} ${product.name}` : 'New product'}
      footer={
        <>
          <Button type="submit" form="product-form" variant="primary" loading={save.isPending}>
            {editing ? 'Save product' : 'Create product'}
          </Button>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FieldGrid className="grid-cols-[10rem_1fr]">
          <Field label="SKU" htmlFor="sku" error={errors.sku}>
            <Input id="sku" value={form.sku} onChange={set('sku')} className="uppercase" autoFocus={!editing} aria-invalid={!!errors.sku} />
          </Field>
          <Field label="Name" htmlFor="name" error={errors.name}>
            <Input id="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Category" htmlFor="cat" error={errors.categoryId} className="col-span-2">
            <Select id="cat" value={form.categoryId} onChange={set('categoryId')}>
              <option value="">No category</option>
              {categories.data?.filter((c) => c.isActive || c.id === form.categoryId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Unit"
            htmlFor="uom"
            error={errors.uom}
            hint={editing && !product.uomEditable ? 'Locked: this product is already on documents.' : undefined}
          >
            <Select id="uom" value={form.uom} onChange={set('uom')} disabled={editing && !product.uomEditable}>
              {UOMS.map((u) => <option key={u} value={u}>{UOM_NAME[u]}</option>)}
            </Select>
          </Field>
          <Field label="Unit cost (₹)" htmlFor="cost" error={errors.unitCost}>
            <Input id="cost" inputMode="decimal" value={form.unitCost} onChange={set('unitCost')} placeholder="Optional" aria-invalid={!!errors.unitCost} />
          </Field>
        </FieldGrid>

        {!editing && (
          <section>
            <div className="flex items-end justify-between pb-2">
              <div>
                <h3 className="letter text-sm font-bold">Opening stock</h3>
                <p className="text-sm text-ink-2">Posted as an inventory adjustment, so it shows in the ledger like any other stock.</p>
              </div>
              <Button size="sm" onClick={() => setLines((ls) => [...ls, { locationId: '', quantity: '' }])}>
                <Plus /> Location
              </Button>
            </div>
            {errors.initialStock && <p className="pb-2 text-sm text-red">{errors.initialStock}</p>}
            {lines.length === 0 ? (
              <p className="border-y border-dashed border-ink-3 py-3 text-sm text-ink-3">None. The product starts at zero everywhere.</p>
            ) : (
              <FieldGrid className="grid-cols-[1fr_9rem_auto]">
                {lines.map((l, i) => (
                  <div key={i} className="contents">
                    <Field label={`Location ${i + 1}`} htmlFor={`loc-${i}`} error={errors[`initialStock.${i}.locationId`]}>
                      <Select id={`loc-${i}`} value={l.locationId} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, locationId: e.target.value } : x)))}>
                        <option value="">Choose…</option>
                        {locations.data?.map((loc) => <option key={loc.id} value={loc.id}>{loc.label}</option>)}
                      </Select>
                    </Field>
                    <Field label={`Quantity (${uomLabel(form.uom)})`} htmlFor={`qty-${i}`} error={errors[`initialStock.${i}.quantity`]}>
                      <Input id={`qty-${i}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                    </Field>
                    <button
                      type="button"
                      aria-label={`Remove location ${i + 1}`}
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      className="-ml-px -mt-px flex w-10 items-center justify-center border border-ink text-ink-2 hover:bg-red-wash hover:text-red"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </FieldGrid>
            )}
          </section>
        )}
      </form>
    </DetailPanel>
  );
}

/** Categories: add, rename, archive. */
export function CategoriesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const categories = useCategories();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const create = useWrite((n: string) => api.post<CategoryDto>('/categories', { name: n }), [['categories']]);
  const rename = useWrite((v: { id: string; name: string }) => api.patch<CategoryDto>(`/categories/${v.id}`, { name: v.name }), [['categories'], ['stock']]);
  const toggle = useWrite((c: CategoryDto) => api.post(`/categories/${c.id}/${c.isActive ? 'archive' : 'restore'}`), [['categories']]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name');
    create.mutate(name.trim(), {
      onSuccess: () => {
        setName('');
        setError(undefined);
      },
      onError: (err) => setError(apiErrors(err, { ALREADY_EXISTS: 'name' }).name),
    });
  };

  return (
    <DetailPanel open={open} onOpenChange={onOpenChange} detail="Cat" title="Categories">
      <form onSubmit={add} className="flex items-stretch pb-6">
        <FieldGrid className="flex-1 grid-cols-1">
          <Field label="New category" htmlFor="new-cat" error={error}>
            <Input id="new-cat" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Packaging" />
          </Field>
        </FieldGrid>
        <Button type="submit" variant="primary" className="h-auto" loading={create.isPending}>Add</Button>
      </form>
      <table className="schedule">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Products</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {categories.data?.map((c) => (
            <tr key={c.id} className={cn(!c.isActive && 'hatch text-ink-3')}>
              <td>
                {editing?.id === c.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename.mutate(editing, { onSuccess: () => setEditing(null), onError: (err) => apiErrors(err) });
                    }}
                    className="flex gap-2"
                  >
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      aria-label={`Rename ${c.name}`}
                      className="h-7 flex-1 border border-blue bg-sheet px-2 outline-none"
                    />
                    <Button size="sm" type="submit" variant="primary" loading={rename.isPending}>Save</Button>
                  </form>
                ) : (
                  <span className="font-medium">{c.name}{!c.isActive && <span className="letter ml-2 text-2xs">Archived</span>}</span>
                )}
              </td>
              <td className="num">{c.productCount}</td>
              <td className="w-0 whitespace-nowrap text-right">
                {editing?.id !== c.id && (
                  <span className="flex justify-end gap-3">
                    <Button variant="link" onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</Button>
                    <Button variant="link" onClick={() => toggle.mutate(c, { onError: (err) => apiErrors(err) })}>
                      {c.isActive ? 'Archive' : 'Restore'}
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DetailPanel>
  );
}

/** CSV import: check the whole file first, then write it in one go. */
export function ImportPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const run = useWrite(
    (dryRun: boolean) => api.post<ProductImportResult>('/products/import', { csv: file!.csv, dryRun, updateExisting }),
    [['stock'], ['moves'], ['categories'], ['operations']],
  );

  useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
    }
  }, [open]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setResult(null);
    setFile({ name: f.name, csv: await f.text() });
  };

  const go = (dryRun: boolean) =>
    run.mutate(dryRun, {
      onSuccess: (r) => {
        setResult(r);
        if (!dryRun && r.errors.length === 0) toast.success(`Imported ${r.created} new, ${r.updated} updated`);
      },
      onError: (err) => apiErrors(err),
    });

  const checked = result?.dryRun && result.errors.length === 0;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      detail="CSV"
      title="Import products"
      wide
      footer={
        result && !result.dryRun && result.errors.length === 0 ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>
        ) : (
          <>
            <Button variant={checked ? 'secondary' : 'primary'} disabled={!file} loading={run.isPending && run.variables} onClick={() => go(true)}>
              Check file
            </Button>
            <Button variant={checked ? 'primary' : 'secondary'} disabled={!checked} loading={run.isPending && !run.variables} onClick={() => go(false)}>
              Import {result?.rows ? `${result.rows} rows` : ''}
            </Button>
            <span className="text-sm text-ink-2">Nothing is written until the check passes.</span>
          </>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <p className="max-w-[65ch] text-ink-2">
          Columns: <span className="font-semibold text-ink">sku</span> (required), name, category, uom, unit_cost, initial_qty, location, min_qty, max_qty.
          New SKUs are created, existing ones updated, and opening stock is posted to the ledger.{' '}
          <a href="/api/v1/products/import/template" download className="font-medium text-blue underline">Download the template</a>
        </p>

        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-ink-3 px-6 py-10 text-center transition-colors hover:border-ink hover:bg-sheet-2 focus-within:outline focus-within:outline-2 focus-within:outline-blue"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files[0]);
          }}
        >
          <Upload className="size-6 text-ink-2" />
          <span className="font-semibold">{file ? file.name : 'Drop a CSV here, or choose a file'}</span>
          <span className="text-sm text-ink-3">{file ? `${file.csv.split('\n').filter(Boolean).length - 1} data rows` : 'UTF-8, first row is the header'}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>

        <label className="flex items-center gap-2.5">
          <input type="checkbox" checked={updateExisting} onChange={(e) => { setUpdateExisting(e.target.checked); setResult(null); }} className="size-4 accent-[var(--ink)]" />
          <span>Update products whose SKU already exists <span className="text-ink-3">(otherwise they're reported as errors)</span></span>
        </label>

        {result && (
          <section className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 border-2 border-ink sm:grid-cols-4">
              {([
                ['Rows', result.rows],
                ['New', result.created],
                ['Updated', result.updated],
                ['Unchanged', result.unchanged],
              ] as const).map(([k, v]) => (
                <div key={k} className="border-r border-ink px-3 py-1.5 last:border-r-0">
                  <dt className="letter text-2xs text-ink-3">{k}</dt>
                  <dd className="text-xl font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {result.errors.length === 0 ? (
              <Note title={result.dryRun ? 'The file checks out' : 'Imported'}>
                {result.categoriesCreated.length > 0 && <>New categories: {result.categoriesCreated.join(', ')}. </>}
                {result.stockOperations.length > 0 && <>Opening stock posted by {result.stockOperations.join(', ')}. </>}
                {result.dryRun && 'Import to write it.'}
              </Note>
            ) : (
              <Note tone="red" title={`${result.errors.length} problem${result.errors.length === 1 ? '' : 's'} to fix`}>Fix these in the file and check it again. Nothing was written.</Note>
            )}
            {[...result.errors.map((i) => ({ ...i, bad: true })), ...result.warnings.map((i) => ({ ...i, bad: false }))].length > 0 && (
              <table className="schedule">
                <thead>
                  <tr>
                    <th className="w-0" />
                    <th className="num">Row</th>
                    <th>Column</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.errors.map((i) => ({ ...i, bad: true })), ...result.warnings.map((i) => ({ ...i, bad: false }))].map((i, n) => (
                    <tr key={n}>
                      <td>{i.bad ? <Delta n={n + 1} /> : <span className="letter text-2xs text-ink-3">Note</span>}</td>
                      <td className="num">{i.row}</td>
                      <td className="text-ink-2">{i.column ?? '·'}</td>
                      <td className={cn(i.bad && 'text-red')}>{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </DetailPanel>
  );
}
