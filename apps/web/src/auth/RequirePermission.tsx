import { hasPermission, type Permission } from '@stocksense/shared';
import { Navigate, Outlet } from 'react-router';

import { useAuth } from './AuthProvider';

/** Layout route inside RequireAuth: users whose role lacks `permission` go to /403. The API enforces it anyway. */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user || !hasPermission(user.role, permission)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
