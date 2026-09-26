import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { vi } from 'vitest';

import { AuthProvider } from '@/auth/AuthProvider';

/** Shows where the router ended up, so tests can assert redirects. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** Renders with a fresh query client, the auth provider and a memory router at `path`. */
export function renderWithProviders(ui: ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          {ui}
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const manager = {
  id: 'u1',
  name: 'Maya Manager',
  email: 'manager@stocksense.test',
  role: 'MANAGER' as const,
  permissions: [],
};

export const staff = {
  id: 'u2',
  name: 'Neha Staff',
  email: 'staff@stocksense.test',
  role: 'STAFF' as const,
  permissions: [],
};

type MockReply = [status: number, body?: unknown];

/**
 * Stubs fetch from a map of `'METHOD /path'` (path after /api/v1, no query) to a reply or a function
 * returning one. Unmatched calls get a 404 ErrorBody. Returns the vi mock so tests can read the calls.
 */
export function mockApi(routes: Record<string, MockReply | ((body: unknown) => MockReply)>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}`;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const route = routes[key];
    const [status, payload] = typeof route === 'function' ? route(body) : (route ?? [404, { error: { code: 'NOT_FOUND', message: key } }]);
    return status === 204 ? new Response(null, { status }) : jsonResponse(status, payload);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The JSON body of the first call to `'METHOD /path'`. */
export function sentBody(fetchMock: ReturnType<typeof mockApi>, key: string) {
  const call = fetchMock.mock.calls.find(([input, init]) => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api\/v1/, '');
    return `${init?.method ?? 'GET'} ${path}` === key;
  });
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
}
