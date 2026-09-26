import { canOperate, type OperationDto } from '@stocksense/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, useLocation, useParams } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { OperationForm, operationDetailKey } from '@/components/operations/OperationForm';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { api, isApiError } from '@/lib/api';
import { NotFoundPage } from '@/pages/StatusPage';

import { OperationDetailPlaceholder } from './OperationDetailPlaceholder';
import { infoForSlug, infoForType } from './operationTypes';

/** /operations/:slug/:id: a Draft the user may edit opens in the form; anything else waits for C7's detail view. */
export function OperationPage() {
  const { slug, id = '' } = useParams();
  const { user } = useAuth();
  const { state } = useLocation() as { state: { notice?: string } | null };
  const query = useQuery({
    queryKey: operationDetailKey(id),
    queryFn: () => api.get<OperationDto>(`/operations/${id}`),
    enabled: !!infoForSlug(slug),
    retry: (count, e) => !isApiError(e, 'NOT_FOUND') && !isApiError(e, 'VALIDATION_FAILED') && count < 1,
  });

  if (!infoForSlug(slug) || isApiError(query.error, 'NOT_FOUND') || isApiError(query.error, 'VALIDATION_FAILED')) return <NotFoundPage />;
  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
        <div className="h-7 w-56 animate-pulse rounded bg-elevated" />
        <div className="h-48 animate-pulse rounded-lg bg-card" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-muted">Couldn't load this document.</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const op = query.data;
  const info = infoForType(op.type);
  // A link with the wrong type in the path goes to the right one.
  if (info.slug !== slug) return <Navigate to={`/operations/${info.slug}/${op.id}`} replace />;

  if (op.status !== 'DRAFT' || !user || !canOperate(user.role, 'edit', op.type)) {
    return <OperationDetailPlaceholder operation={op} />;
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to={`/operations/${info.slug}`} className="inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" />
          {info.title}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="ref text-2xl font-semibold">{op.reference}</h1>
          <StatusBadge status={op.status} />
        </div>
      </header>
      {/* Keyed by id so moving between documents starts a fresh form. */}
      <OperationForm key={op.id} type={op.type} mode="edit" operation={op} notice={state?.notice} />
    </div>
  );
}
