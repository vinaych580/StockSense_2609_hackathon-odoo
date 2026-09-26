import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { RequirePermission } from '@/auth/RequirePermission';
import { ForbiddenPage } from '@/pages/StatusPage';
import { manager, mockApi, renderWithProviders, staff } from '@/test/render';

describe('routes', () => {
  it('sends / to the dashboard', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<App />, '/');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/);
  });

  it('shows 404 for an unknown path', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<App />, '/nope');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('sends signed-out users to log in, keeping where they were', async () => {
    mockApi({ 'GET /auth/me': [401, { error: { code: 'UNAUTHENTICATED', message: 'Log in' } }] });
    renderWithProviders(<App />, '/products');

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fproducts');
  });
});

describe('RequirePermission', () => {
  const routes = (
    <Routes>
      <Route path="/403" element={<ForbiddenPage />} />
      <Route element={<RequirePermission permission="users.manage" />}>
        <Route path="/settings/users" element={<p>users admin</p>} />
      </Route>
    </Routes>
  );

  it('sends a role without the permission to /403', async () => {
    mockApi({ 'GET /auth/me': [200, { data: staff }] });
    renderWithProviders(routes, '/settings/users');

    expect(await screen.findByRole('heading', { name: "You don't have access" })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/403$/);
  });

  it('lets a role with the permission through', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(routes, '/settings/users');

    expect(await screen.findByText('users admin')).toBeInTheDocument();
  });
});
