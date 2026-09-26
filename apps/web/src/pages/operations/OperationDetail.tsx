import type { OperationDto } from '@stocksense/shared';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { ActionBar } from '@/components/operations/ActionBar';
import { LinesTable } from '@/components/operations/LinesTable';
import { PickPackChecklist } from '@/components/operations/PickPackChecklist';
import type { useOperationAction } from '@/components/operations/useOperationAction';
import { StatusStepper } from '@/components/shared/StatusStepper';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { LatePill } from './OperationListPage';
import { partnerFor } from './operationTypes';

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <dt className="eyebrow">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const dash = <span className="text-muted">—</span>;

/** A document past Draft, or one this role can't edit: its details, lines and the actions allowed now. */
export function OperationDetail({ operation: op, actions }: { operation: OperationDto; actions: ReturnType<typeof useOperationAction> }) {
  const partner = partnerFor(op.type);
  const by = (who: { name: string } | null, when: string | null) => (who ? `${who.name}, ${formatDate(when)}` : null);

  return (
    <>
      <StatusStepper status={op.status} type={op.type} />

      <dl className="grid gap-4 rounded-lg border border-hairline bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="From → To" className="sm:col-span-2 lg:col-span-1">
          <span className="flex items-center gap-1.5">
            {op.source.label}
            <ArrowRight aria-label="to" className="size-3.5 text-muted" />
            {op.dest.label}
          </span>
        </Field>
        {partner && <Field label={partner.label}>{op.partner?.name ?? dash}</Field>}
        <Field label="Responsible">{op.responsible?.name ?? dash}</Field>
        <Field label="Scheduled">
          <span className={cn('flex items-center gap-2', op.isLate && 'text-danger')}>
            {formatDate(op.scheduledDate)}
            {op.isLate && <LatePill />}
          </span>
        </Field>
        <Field label="Created">{by(op.createdBy, op.createdAt)}</Field>
        {op.validatedBy && <Field label="Validated">{by(op.validatedBy, op.validatedAt)}</Field>}
        {op.canceledBy && <Field label="Canceled">{by(op.canceledBy, op.canceledAt)}</Field>}
        {op.notes && (
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
            <span className="whitespace-pre-wrap">{op.notes}</span>
          </Field>
        )}
      </dl>

      <ActionBar operation={op} actions={actions} />
      {op.type === 'DELIVERY' && op.status === 'READY' && <PickPackChecklist operation={op} actions={actions} />}
      <LinesTable operation={op} shortLines={actions.shortLines} />
    </>
  );
}
