import type { OperationDto } from '@stocksense/shared';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

import { StatusBadge } from '@/components/shared/StatusBadge';

import { infoForType } from './operationTypes';

/** Stands in for the detail view and actions (C7) for documents that aren't editable Drafts. */
export function OperationDetailPlaceholder({ operation: op }: { operation: OperationDto }) {
  const info = infoForType(op.type);
  return (
    <div className="flex flex-col gap-4">
      <Link to={`/operations/${info.slug}`} className="inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        {info.title}
      </Link>
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{info.noun[0]!.toUpperCase() + info.noun.slice(1)} detail · C7</span>
        <div className="flex items-center gap-3">
          <h1 className="ref text-2xl font-semibold">{op.reference}</h1>
          <StatusBadge status={op.status} />
        </div>
        <p className="text-muted">
          {op.status === 'DRAFT' ? 'Your role can view this Draft but not edit it.' : 'The detail view and actions arrive in C7.'}
        </p>
      </div>
    </div>
  );
}
