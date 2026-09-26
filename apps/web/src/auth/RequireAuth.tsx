import { Navigate, Outlet, useLocation } from 'react-router';

import { loginPath, useAuth } from './AuthProvider';

/** Layout route for signed-in pages: sends everyone else to /login?next=<where they were>. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
  }
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return <Outlet />;
}
