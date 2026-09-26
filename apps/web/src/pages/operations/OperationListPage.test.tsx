import type { ListResponse, MeDto, OperationDto } from '@stocksense/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders, staff } from '@/test/render';

const WH1 = '6a84c851-4c9d-5cae-9b05-c49b36e877b0';
const WH2 = '08e15f1b-0a8a-5434-a95b-3848f47e3084';

function op(overrides: Partial<OperationDto> = {}): OperationDto {
  return {
    id: 'op-1',
    reference: 'WH1/IN/00019',
    type: 'RECEIPT',
    status: 'READY',
    version: 1,
    warehouseId: WH1,
    source: { id: 'v', label: 'Vendors', type: 'VENDOR' },
    dest: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
    partner: { id: 'p', name: 'Volt Components' },
    responsible: null,
    scheduledDate: '2026-09-28T03:30:00.000Z',
    isLate: false,
    pickedAt: null,
    packedAt: null,
    notes: null,
    createdBy: { id: 'u1', name: 'Priya Sharma' },
    validatedBy: null,
    validatedAt: null,
    canceledBy: null,
    canceledAt: null,
    createdAt: '2026-09-26T04:00:00.000Z',
    lines: [],
    ...overrides,
  };
}

const RECEIPTS: ListResponse<OperationDto> = {
  data: [
    op({ lines: [{} as OperationDto['lines'][number], {} as OperationDto['lines'][number]] }),
    op({ id: 'op-2', reference: 'WH1/IN/00020', status: 'READY', isLate: true, scheduledDate: '2026-09-25T03:30:00.000Z' }),
    op({ id: 'op-3', reference: 'WH1/IN/00021', status: 'DRAFT', partner: { id: 'a', name: 'Azure Supplies' } }),
  ],
  page: { page: 1, pageSize: 25, total: 12 },
};

/** Query strings of every GET /operations call, as URLSearchParams. */
function operationCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname === '/api/v1/operations')
    .map((u) => u.searchParams);
}
const lastCall = (fetchMock: ReturnType<typeof mockApi>) => operationCalls(fetchMock).at(-1)!;

function setup(path = '/operations/receipts', me: MeDto = manager, list: ListResponse<OperationDto> = RECEIPTS) {
  const fetchMock = mockApi({ 'GET /auth/me': [200, { data: me }], 'GET /operations': [200, list] });
  renderWithProviders(<App />, path);
  return { fetchMock, user: userEvent.setup() };
}

const table = () => screen.findByRole('table', { name: /Receipts|Deliveries|Transfers|Adjustments/ });
const location = () => screen.getByTestId('location').textContent ?? '';

describe('OperationListPage', () => {
  it('lists receipts with status, contact, route and line count', async () => {
    const { fetchMock } = setup();
    await screen.findByText('WH1/IN/00019');
    const rows = within(await table()).getAllByRole('row').slice(1);

    expect(within(rows[0]!).getByText('WH1/IN/00019')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Ready')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Volt Components')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('WH1/Stock')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('1–12 of 12')).toBeInTheDocument();

    const params = lastCall(fetchMock);
    expect(params.get('type')).toBe('RECEIPT');
    expect(params.get('sort')).toBe('-createdAt');
    expect(params.get('page')).toBe('1');
  });

  it.each([
    ['/operations/deliveries', 'DELIVERY'],
    ['/operations/transfers', 'TRANSFER'],
    ['/operations/adjustments', 'ADJUSTMENT'],
  ])('%s asks for %s', async (path, type) => {
    const { fetchMock } = setup(path, manager, { data: [], page: { page: 1, pageSize: 25, total: 0 } });
    expect(await screen.findByText(/yet\./)).toBeInTheDocument();
    expect(lastCall(fetchMock).get('type')).toBe(type);
  });

  it('marks late documents', async () => {
    setup();
    const lateRow = (await screen.findByText('WH1/IN/00020')).closest('tr')!;
    expect(within(lateRow).getByText('Late')).toBeInTheDocument();
    expect(lateRow.className).toContain('border-l-danger');
    const onTime = screen.getByText('WH1/IN/00019').closest('tr')!;
    expect(within(onTime).queryByText('Late')).not.toBeInTheDocument();
  });

  it('hides the contact column for transfers', async () => {
    setup('/operations/transfers', manager, { data: [op({ type: 'TRANSFER', partner: null })], page: { page: 1, pageSize: 25, total: 1 } });
    await screen.findByText('WH1/IN/00019');
    expect(screen.queryByRole('columnheader', { name: 'Contact' })).not.toBeInTheDocument();
  });

  it('sends URL filters on the first request, so a reload keeps them', async () => {
    const { fetchMock } = setup(`/operations/receipts?status=READY&warehouseId=${WH1}&late=true&search=volt`);
    await screen.findByText('WH1/IN/00019');

    const params = operationCalls(fetchMock)[0]!;
    expect(params.get('status')).toBe('READY');
    expect(params.get('warehouseId')).toBe(WH1);
    expect(params.get('late')).toBe('true');
    expect(params.get('search')).toBe('volt');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('READY');
  });

  it('writes filter changes to the URL and the next request', async () => {
    const { fetchMock, user } = setup('/operations/receipts?page=2');
    await screen.findByText('WH1/IN/00019');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'DRAFT');
    await user.click(screen.getByRole('button', { name: 'Late' }));
    await user.type(screen.getByRole('searchbox'), 'IN/0002');
    await act(() => new Promise((r) => setTimeout(r, 350)));

    expect(location()).toBe('/operations/receipts?status=DRAFT&late=true&search=IN%2F0002');
    await waitFor(() => expect(lastCall(fetchMock).get('search')).toBe('IN/0002'));
    const params = lastCall(fetchMock);
    expect(params.get('status')).toBe('DRAFT');
    expect(params.get('late')).toBe('true');
    expect(params.get('page')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(location()).toBe('/operations/receipts');
  });

  it('only offers statuses the type can reach', async () => {
    setup();
    const status = await screen.findByRole('combobox', { name: 'Status' });
    expect(within(status).queryByRole('option', { name: 'Waiting' })).not.toBeInTheDocument();
    expect(within(status).getByRole('option', { name: 'Canceled' })).toBeInTheDocument();
  });

  it('narrows locations to the chosen warehouse and drops a location from another one', async () => {
    const wh1Stock = 'b03e4479-2673-51ba-8663-56be4c76f423';
    const { user } = setup(`/operations/receipts?locationId=${wh1Stock}`);
    const locationSelect = await screen.findByRole('combobox', { name: 'Location' });
    expect(within(locationSelect).getAllByRole('option')).toHaveLength(7); // All + 6

    await user.selectOptions(screen.getByRole('combobox', { name: 'Warehouse' }), WH2);

    expect(within(locationSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['All', 'WH2/Stock', 'WH2/Cold Room']);
    await waitFor(() => expect(location()).toBe(`/operations/receipts?warehouseId=${WH2}`));
  });

  it('shows New only to roles that can create this type', async () => {
    setup('/operations/receipts', manager);
    expect(await screen.findByRole('link', { name: 'New receipt' })).toHaveAttribute('href', '/operations/receipts/new');
  });

  it('hides New receipt from Staff', async () => {
    setup('/operations/receipts', staff);
    await screen.findByText('WH1/IN/00019');
    expect(screen.queryByRole('link', { name: /New/ })).not.toBeInTheDocument();
  });

  it('shows New transfer to Staff', async () => {
    setup('/operations/transfers', staff, { data: [], page: { page: 1, pageSize: 25, total: 0 } });
    expect(await screen.findByRole('link', { name: 'New transfer' })).toBeInTheDocument();
  });

  it('opens the document when a row is clicked', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('WH1/IN/00021'));
    expect(location()).toBe('/operations/receipts/op-3');
    expect(await screen.findByRole('heading', { name: 'Receipt detail' })).toBeInTheDocument();
  });

  it('names the detail placeholder by the singular noun', async () => {
    setup('/operations/deliveries/op-9');
    expect(await screen.findByRole('heading', { name: 'Delivery detail' })).toBeInTheDocument();
  });

  it('shows 404 for an unknown operation type', async () => {
    setup('/operations/returns/op-9');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows an error with Retry', async () => {
    let fail = true;
    const fetchMock = mockApi({
      'GET /auth/me': [200, { data: manager }],
      'GET /operations': () => (fail ? [500, { error: { code: 'INTERNAL', message: 'down' } }] : [200, RECEIPTS]),
    });
    renderWithProviders(<App />, '/operations/receipts');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load receipts.");
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('WH1/IN/00019')).toBeInTheDocument();
    expect(operationCalls(fetchMock)).toHaveLength(2);
  });
});
