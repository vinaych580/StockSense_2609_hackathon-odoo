import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { mockApi, renderWithProviders, sentBody, staff } from '@/test/render';

const signedOut: [number, unknown] = [401, { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue' } }];

async function signUp() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Name'), 'Neha Staff');
  await user.type(screen.getByLabelText('Email'), 'neha@stocksense.test');
  await user.type(screen.getByLabelText('Password'), 'long-enough-password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignupPage', () => {
  it('creates a Staff account without sending a role, then opens the dashboard', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': signedOut, 'POST /auth/signup': [201, { data: staff }] });
    renderWithProviders(<App />, '/signup');

    await signUp();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(sentBody(fetchMock, 'POST /auth/signup')).toEqual({
      name: 'Neha Staff',
      email: 'neha@stocksense.test',
      password: 'long-enough-password',
    });
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
  });

  it('shows EMAIL_TAKEN on the email field', async () => {
    mockApi({
      'GET /auth/me': signedOut,
      'POST /auth/signup': [409, { error: { code: 'EMAIL_TAKEN', message: 'That email is already registered. Log in instead.' } }],
    });
    renderWithProviders(<App />, '/signup');

    await signUp();

    expect(await screen.findByText('That email is already registered. Log in instead.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
