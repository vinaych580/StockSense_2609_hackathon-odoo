import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { manager, mockApi, renderWithProviders } from '@/test/render';

import { FilterBar, FilterDateRange, FilterSearch, FilterSelect, FilterToggle } from './FilterBar';

const statuses = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Ready' },
];

function OperationsFilters() {
  return (
    <FilterBar>
      <FilterSearch placeholder="Reference or contact" />
      <FilterSelect name="status" label="Status" options={statuses} />
      <FilterDateRange />
      <FilterToggle name="late" label="Late" />
    </FilterBar>
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';

describe('FilterBar', () => {
  it('starts from the URL, so a reload keeps the filters', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<OperationsFilters />, '/ops?search=WH1&status=READY&dateFrom=2026-09-01&late=true');

    expect(await screen.findByRole('searchbox')).toHaveValue('WH1');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('READY');
    expect(screen.getByLabelText('Date from')).toHaveValue('2026-09-01');
    expect(screen.getByRole('button', { name: 'Late' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('writes each field to the URL and resets the page', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<OperationsFilters />, '/ops?page=3');
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status' }), 'DRAFT');
    expect(location()).toBe('/ops?status=DRAFT');

    await user.click(screen.getByRole('button', { name: 'Late' }));
    expect(location()).toBe('/ops?status=DRAFT&late=true');

    await user.type(screen.getByLabelText('Date to'), '2026-09-26');
    expect(location()).toContain('dateTo=2026-09-26');

    await user.click(screen.getByRole('button', { name: 'Late' }));
    expect(location()).not.toContain('late');
  });

  it('debounces search into the URL', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<OperationsFilters />, '/ops');
    const user = userEvent.setup();

    await user.type(await screen.findByRole('searchbox'), 'IN/0001');
    expect(location()).toBe('/ops');
    await act(() => new Promise((r) => setTimeout(r, 350)));
    expect(location()).toBe('/ops?search=IN%2F0001');
  });

  it('clears only its own params, and is disabled when nothing is set', async () => {
    mockApi({ 'GET /auth/me': [200, { data: manager }] });
    renderWithProviders(<OperationsFilters />, '/ops?status=READY&late=true&search=x&sort=-reference&page=2');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Clear' }));

    expect(location()).toBe('/ops?sort=-reference');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});
