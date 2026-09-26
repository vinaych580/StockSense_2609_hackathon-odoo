import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, manager, renderWithProviders } from '@/test/render';

import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('renders the home page for a signed-in user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: manager })));
    renderWithProviders(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Maya Manager/)).toBeInTheDocument();
    expect(screen.getByText('RECEIPT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
});
