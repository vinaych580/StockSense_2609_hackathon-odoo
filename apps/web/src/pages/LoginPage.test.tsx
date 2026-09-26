import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders, sentBody } from '@/test/render';

const signedOut: [number, unknown] = [401, { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue' } }];

async function logIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('LoginPage', () => {
  it('shows a wrong password inline and stays on /login', async () => {
    mockApi({
      'GET /auth/me': signedOut,
      'POST /auth/login': [401, { error: { code: 'UNAUTHENTICATED', message: 'Wrong email or password' } }],
    });
    renderWithProviders(<App />, '/login');

    await logIn('manager@stocksense.test', 'not-the-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/);
  });

  it('logs in and returns to ?next', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': signedOut, 'POST /auth/login': [200, { data: manager }] });
    renderWithProviders(<App />, '/login?next=%2Fstock');

    await logIn(' Manager@StockSense.test ', 'correct-password');

    expect(await screen.findByRole('heading', { name: 'Stock' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/stock$/);
    // The shared schema trims and lower-cases the email before it is sent.
    expect(sentBody(fetchMock, 'POST /auth/login')).toEqual({ email: 'manager@stocksense.test', password: 'correct-password' });
  });

  it('ignores a ?next that points off the site', async () => {
    mockApi({ 'GET /auth/me': signedOut, 'POST /auth/login': [200, { data: manager }] });
    renderWithProviders(<App />, '/login?next=%2F%2Fevil.test');

    await logIn('manager@stocksense.test', 'correct-password');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('checks the fields before calling the API', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': signedOut });
    renderWithProviders(<App />, '/login');

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(sentBody(fetchMock, 'POST /auth/login')).toBeUndefined();
  });

  it('sends a signed-in user straight on', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<App />, '/login?next=%2Fmoves');

    expect(await screen.findByRole('heading', { name: 'Move History' })).toBeInTheDocument();
  });

  it('shows the dev-only demo accounts', async () => {
    mockApi({ 'GET /auth/me': signedOut });
    renderWithProviders(<App />, '/login');

    expect(await screen.findByRole('button', { name: 'Manager, Priya' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Staff, Neha' })).toBeInTheDocument();
  });
});
