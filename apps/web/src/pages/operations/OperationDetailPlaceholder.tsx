import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { NotFoundPage } from '@/pages/StatusPage';

import { infoForSlug } from './operationTypes';

/** Stands in for the operation form (C6) and detail view (C7) so list rows and New have somewhere to go. */
export function OperationDetailPlaceholder({ isNew = false }: { isNew?: boolean }) {
  const { slug, id } = useParams();
  const info = infoForSlug(slug);
  if (!info) return <NotFoundPage />;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/operations/${info.slug}`} className="inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        {info.title}
      </Link>
      <div className="flex flex-col gap-1">
        <span className="eyebrow">{isNew ? 'C6' : 'C6 / C7'}</span>
        <h1 className="text-2xl font-semibold">{isNew ? `New ${info.noun}` : `${info.noun[0]!.toUpperCase()}${info.noun.slice(1)} detail`}</h1>
        {!isNew && <p className="ref text-sm text-muted">{id}</p>}
        <p className="text-muted">{isNew ? 'The operation form arrives in C6.' : 'The detail view arrives in C6 and C7.'}</p>
      </div>
    </div>
  );
}
