import { canOperate } from '@stocksense/shared';
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { OperationForm } from '@/components/operations/OperationForm';
import { NotFoundPage } from '@/pages/StatusPage';

import { infoForSlug } from './operationTypes';

/** /operations/:slug/new: a new Draft of that type. */
export function NewOperationPage() {
  const { slug } = useParams();
  const info = infoForSlug(slug);
  const { user } = useAuth();

  if (!info) return <NotFoundPage />;
  if (!user || !canOperate(user.role, 'create', info.type)) return <Navigate to="/403" replace />;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to={`/operations/${info.slug}`} className="inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" />
          {info.title}
        </Link>
        <h1 className="text-2xl font-semibold">New {info.noun}</h1>
        <p className="text-sm text-muted">Saved as a Draft. Nothing moves until it's validated.</p>
      </header>
      <OperationForm key={info.type} type={info.type} mode="create" />
    </div>
  );
}
