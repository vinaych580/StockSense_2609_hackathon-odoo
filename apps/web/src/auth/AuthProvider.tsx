import type { MeDto } from '@stocksense/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { api, isApiError, setSessionExpiredHandler } from '@/lib/api';

export const meQueryKey = ['auth', 'me'] as const;

/** `/login`, optionally remembering where to go back to after signing in. */
export function loginPath(next?: string) {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

interface AuthContextValue {
  user: MeDto | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<MeDto | null> {
  try {
    return await api.get<MeDto>('/auth/me', undefined, { skipSessionHandler: true });
  } catch (e) {
    // Signed out (or expired) is a state, not an error.
    if (isApiError(e) && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useQuery({ queryKey: meQueryKey, queryFn: fetchMe, retry: false });

  const signOutLocally = useCallback(() => {
    queryClient.clear();
    queryClient.setQueryData(meQueryKey, null);
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      if (!isApiError(e) || e.status !== 401) throw e;
    }
    signOutLocally();
    navigate('/login', { replace: true });
  }, [navigate, signOutLocally]);

  // Any call that comes back 401 SESSION_EXPIRED signs the user out and sends them to log in.
  const here = location.pathname + location.search;
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (location.pathname === '/login') return;
      signOutLocally();
      navigate(loginPath(here), { replace: true });
    });
    return () => setSessionExpiredHandler(undefined);
  }, [here, location.pathname, navigate, signOutLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: me.data ?? null, isLoading: me.isPending, logout }),
    [me.data, me.isPending, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
