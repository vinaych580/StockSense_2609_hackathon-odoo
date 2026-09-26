import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import type { ProductOption } from '@/lib/masterDataStub';
import { FieldError } from '@/pages/AuthLayout';

import { newLineKey, type OperationFormValues } from './formSchema';
import { ProductCombobox } from './ProductCombobox';
import { QuantityInput } from './QuantityInput';

/** One row per product. Adjustments record a counted quantity; the other types a quantity to move. */
export function LinesEditor({ products, counted }: { products: ProductOption[]; counted: boolean }) {
  const { control, formState } = useFormContext<OperationFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'fieldId' });
  const lines = useWatch({ control, name: 'lines' });
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const errors = formState.errors.lines;

  const takenBy = useMemo(() => {
    const map = new Map<string, number>();
    lines?.forEach((l, i) => l.productId && !map.has(l.productId) && map.set(l.productId, i + 1));
    return map;
  }, [lines]);

  const quantityLabel = counted ? 'Counted' : 'Quantity';

  return (
    <section aria-label="Lines" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">Lines</h2>
        <span className="text-xs text-muted">{fields.length} of 200</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-hairline bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
              <th className="h-10 w-10 px-3 text-left font-normal">#</th>
              <th className="px-3 text-left font-normal">Product</th>
              <th className="w-44 px-3 text-right font-normal">{quantityLabel}</th>
              <th className="w-12" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 && (
              <tr className="border-t border-hairline">
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  No lines yet. Add the products this document moves.
                </td>
              </tr>
            )}
            {fields.map((field, i) => {
              const line = lines?.[i];
              const uom = line?.productId ? byId.get(line.productId)?.uom : undefined;
              const lineErrors = errors?.[i];
              return (
                <tr key={field.fieldId} className="border-t border-hairline align-top">
                  <td className="px-3 py-2.5 text-muted tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Controller
                      control={control}
                      name={`lines.${i}.productId`}
                      render={({ field: f }) => (
                        <ProductCombobox
                          id={`lines.${i}.productId`}
                          aria-label={`Line ${i + 1} product`}
                          aria-invalid={!!lineErrors?.productId}
                          aria-describedby={`lines-${i}-product-error`}
                          products={products}
                          value={f.value}
                          onChange={f.onChange}
                          takenBy={takenBy}
                        />
                      )}
                    />
                    <FieldError id={`lines-${i}-product-error`} message={lineErrors?.productId?.message} />
                  </td>
                  <td className="px-3 py-2">
                    <Controller
                      control={control}
                      name={`lines.${i}.quantity`}
                      render={({ field: f }) => (
                        <QuantityInput
                          aria-label={`Line ${i + 1} ${quantityLabel.toLowerCase()}`}
                          aria-invalid={!!lineErrors?.quantity}
                          aria-describedby={`lines-${i}-quantity-error`}
                          value={f.value}
                          onChange={f.onChange}
                          onBlur={f.onBlur}
                          ref={f.ref}
                          uom={uom}
                        />
                      )}
                    />
                    <FieldError id={`lines-${i}-quantity-error`} message={lineErrors?.quantity?.message} />
                  </td>
                  <td className="px-2 py-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => remove(i)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FieldError id="lines-error" message={errors?.message ?? errors?.root?.message} />
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= 200}
          onClick={() => {
            append({ key: newLineKey(), productId: '', quantity: '' }, { shouldFocus: false });
            const index = fields.length;
            setTimeout(() => document.getElementById(`lines.${index}.productId`)?.focus());
          }}
        >
          <Plus />
          Add line
        </Button>
      </div>
    </section>
  );
}
