import type { MeDto } from '@stocksense/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { safeNext } from '@/lib/next';

import { meQueryKey } from './AuthProvider';

/** After log-in or sign-up: store the user where AuthProvider reads it, then go on to `next`. */
export function useSignIn() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    (me: MeDto, next?: string | null) => {
      queryClient.setQueryData(meQueryKey, me);
      navigate(safeNext(next), { replace: true });
    },
    [navigate, queryClient],
  );
}
