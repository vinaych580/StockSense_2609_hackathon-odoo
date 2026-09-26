import { zodResolver } from '@hookform/resolvers/zod';
import type { OperationDto, OperationType } from '@stocksense/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, isApiError } from '@/lib/api';
import { applyServerError } from '@/lib/forms';
import { useProductOptions, usePartnerOptions, useUserOptions } from '@/lib/masterDataStub';
import { cn } from '@/lib/utils';
import { FieldError, FormAlert } from '@/pages/AuthLayout';
import { infoForType, partnerFor } from '@/pages/operations/operationTypes';

import {
  emptyValues,
  formPath,
  fromOperation,
  type OperationFormValues,
  operationFormSchema,
  toCreateBody,
  toUpdateBody,
} from './formSchema';
import { LinesEditor } from './LinesEditor';
import { LocationSelect } from './LocationSelect';
import { operationDetailKey } from './useOperationAction';

export { operationDetailKey };


const selectClass =
  'h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-danger';

type Props = { notice?: string; onDirtyChange?: (dirty: boolean) => void } & (
  | { type: OperationType; mode: 'create'; operation?: undefined }
  | { type: OperationType; mode: 'edit'; operation: OperationDto }
);

/** One form for all four types: creates a Draft, or edits one (PATCH with the version last read). */
export function OperationForm({ type, mode, operation, notice, onDirtyChange }: Props) {
  const info = infoForType(type);
  const partner = partnerFor(type);
  const counted = type === 'ADJUSTMENT';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Keep an existing line's product listed even if it has since been archived.
  const products = useProductOptions({ includeArchived: mode === 'edit' });
  const partners = usePartnerOptions(partner?.kind);
  const users = useUserOptions();
  const [saved, setSaved] = useState(notice);

  const schema = useMemo(() => operationFormSchema(type, products), [type, products]);
  const form = useForm<OperationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: operation ? fromOperation(operation) : emptyValues(type),
  });
  const { register, control, formState, handleSubmit, reset, setError } = form;
  const { errors, isSubmitting, isDirty } = formState;

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const onSubmit = handleSubmit(async (values) => {
    setSaved(undefined);
    try {
      if (mode === 'create') {
        const created = await api.post<OperationDto>('/operations', toCreateBody(type, values));
        await queryClient.invalidateQueries({ queryKey: ['operations', 'list'] });
        queryClient.setQueryData(operationDetailKey(created.id), created);
        navigate(`/operations/${info.slug}/${created.id}`, { state: { notice: `${created.reference} created as a Draft.` } });
      } else {
        const updated = await api.patch<OperationDto>(`/operations/${operation.id}`, toUpdateBody(type, values, operation.version));
        queryClient.setQueryData(operationDetailKey(updated.id), updated);
        await queryClient.invalidateQueries({ queryKey: ['operations', 'list'] });
        reset(fromOperation(updated));
        setSaved('Saved.');
      }
    } catch (e) {
      if (mode === 'edit' && isApiError(e, 'STALE_VERSION')) {
        // Load their version (and its `version`) behind the user's edits, which stay on screen.
        await queryClient.refetchQueries({ queryKey: operationDetailKey(operation.id), exact: true });
        setError('root.server', {
          message: 'Someone else changed this Draft. Their version is loaded behind your edits; save again to keep yours.',
        });
        return;
      }
      // Line errors come back as lines.N.countedQuantity for adjustments; the form calls that field `quantity`.
      applyServerError((path, error) => setError(formPath(String(path)) as never, error), e);
    }
  });

  const field = (name: keyof OperationFormValues) => ({
    id: name,
    'aria-invalid': !!errors[name],
    'aria-describedby': `${name}-error`,
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FormAlert message={errors.root?.server?.message} />

        <section aria-label="Details" className="grid gap-4 rounded-lg border border-hairline bg-card p-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sourceLocationId">From</Label>
            <Controller
              control={control}
              name="sourceLocationId"
              render={({ field: f }) => (
                <LocationSelect {...field('sourceLocationId')} aria-label="From" type={type} end="source" value={f.value} onChange={f.onChange} />
              )}
            />
            <FieldError id="sourceLocationId-error" message={errors.sourceLocationId?.message} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="destLocationId">To</Label>
            <Controller
              control={control}
              name="destLocationId"
              render={({ field: f }) => (
                <LocationSelect {...field('destLocationId')} aria-label="To" type={type} end="dest" value={f.value} onChange={f.onChange} />
              )}
            />
            <FieldError id="destLocationId-error" message={errors.destLocationId?.message} />
          </div>

          {partner && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="partnerId">{partner.label}</Label>
              <select {...field('partnerId')} {...register('partnerId')} className={selectClass}>
                <option value="">No {partner.label.toLowerCase()}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <FieldError id="partnerId-error" message={errors.partnerId?.message} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="responsibleId">Responsible</Label>
            <select {...field('responsibleId')} {...register('responsibleId')} className={selectClass}>
              <option value="">Nobody yet</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <FieldError id="responsibleId-error" message={errors.responsibleId?.message} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduledDate">Scheduled</Label>
            <Input type="date" {...field('scheduledDate')} {...register('scheduledDate')} />
            <FieldError id="scheduledDate-error" message={errors.scheduledDate?.message} />
          </div>
          <div className={cn('flex flex-col gap-2', partner ? 'md:col-span-2' : '')}>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              {...field('notes')}
              {...register('notes')}
              rows={2}
              className="min-h-16 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder={counted ? 'Why the count differs, e.g. damaged in handling' : 'Anything the team should know'}
            />
            <FieldError id="notes-error" message={errors.notes?.message} />
          </div>
        </section>

        <LinesEditor products={products} counted={counted} />

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span role="status" className="mr-auto flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" />
              {saved}
            </span>
          )}
          <Button variant="outline" asChild>
            <Link to={`/operations/${info.slug}`}>{mode === 'create' ? 'Cancel' : 'Back to list'}</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create draft' : 'Save draft'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
