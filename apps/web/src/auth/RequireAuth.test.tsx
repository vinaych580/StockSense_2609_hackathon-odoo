import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, manager, renderWithProviders } from '@/test/render';

import { RequireAuth } from './RequireAuth';

const routes = (
  <Routes>
    <Route path="/login" element={<p>login page</p>} />
    <Route element={<RequireAuth />}>
      <Route path="/stock" element={<p>stock page</p>} />
    </Route>
  </Routes>
);

afterEach(() => vi.unstubAllGlobals());

describe('RequireAuth', () => {
  it('redirects to /login with next when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Log in' } })));
    renderWithProviders(routes, '/stock?warehouseId=w1');

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fstock%3FwarehouseId%3Dw1');
  });

  it('renders the page when signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: manager })));
    renderWithProviders(routes, '/stock');

    expect(await screen.findByText('stock page')).toBeInTheDocument();
  });
});
