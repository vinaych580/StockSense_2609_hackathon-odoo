import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders, staff } from '@/test/render';

describe('AppShell', () => {
  it('renders the sidebar and marks the current page', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<App />, '/stock');

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const label of ['Dashboard', 'Stock', 'Products', 'Move History', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Stock' })).toHaveAttribute('aria-current', 'page');
  });

  it('expands and collapses the Operations group', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<App />, '/dashboard');
    const user = userEvent.setup();

    const toggle = await screen.findByRole('button', { name: 'Operations' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Receipts' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('link', { name: 'Deliveries' }));
    expect(await screen.findByRole('heading', { name: 'Deliveries' })).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByRole('link', { name: 'Deliveries' })).not.toBeInTheDocument();
  });

  it('opens the Operations group when the page is inside it', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<App />, '/operations/transfers');

    expect(await screen.findByRole('link', { name: 'Transfers' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    [manager, 'MANAGER'],
    [staff, 'STAFF'],
  ])('shows %s.name and the role in the top bar', async (me, role) => {
    mockApi({ 'GET /auth/me': [200, { data: me }] });
    renderWithProviders(<App />, '/dashboard');

    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText(me.name)).toBeInTheDocument();
    expect(within(banner).getByText(role)).toBeInTheDocument();
  });

  it('logs out from the user menu', async () => {
    let signedIn = true;
    const fetchMock = mockApi({
      'GET /auth/me': () => (signedIn ? [200, { data: manager }] : [401, { error: { code: 'UNAUTHENTICATED', message: 'Log in' } }]),
      'POST /auth/logout': () => {
        signedIn = false;
        return [204];
      },
    });
    renderWithProviders(<App />, '/dashboard');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Maya Manager/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});
