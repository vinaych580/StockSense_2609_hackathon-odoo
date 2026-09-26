import type { ListResponse, OperationDto, OperationLineDto, OperationStatus } from '@stocksense/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders } from '@/test/render';

const product = (name: string) => ({ productName: name }) as OperationLineDto;

function op(id: string, status: OperationStatus, overrides: Partial<OperationDto> = {}): OperationDto {
  return {
    id,
    reference: `WH1/IN/000${id}`,
    type: 'RECEIPT',
    status,
    version: 1,
    warehouseId: 'wh1',
    source: { id: 'v', label: 'Vendors', type: 'VENDOR' },
    dest: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
    partner: { id: 'p', name: 'Volt Electronics' },
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
    lines: [product('Office Chair'), product('Steel Rods'), product('Desk'), product('Paint')],
    ...overrides,
  };
}

const RECEIPTS: OperationDto[] = [
  op('11', 'DRAFT'),
  op('12', 'DRAFT', { lines: [product('Mouse')] }),
  op('13', 'READY', { isLate: true, scheduledDate: '2026-09-25T03:30:00.000Z' }),
  op('14', 'DONE'),
  op('15', 'CANCELED', { partner: null }),
];

const list = (data: OperationDto[], total = data.length): ListResponse<OperationDto> => ({ data, page: { page: 1, pageSize: 100, total } });

/** Query params of every GET /operations call. */
function calls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname === '/api/v1/operations')
    .map((u) => u.searchParams);
}

function setup(path: string, data: OperationDto[] = RECEIPTS, total?: number) {
  const fetchMock = mockApi({ 'GET /auth/me': [200, { data: manager }], 'GET /operations': [200, list(data, total)] });
  renderWithProviders(<App />, path);
  return { fetchMock, user: userEvent.setup() };
}

const location = () => screen.getByTestId('location').textContent ?? '';
const column = (label: string) => screen.getByRole('region', { name: label });

describe('Operation list board view', () => {
  it('toggles to the board, keeps it in the URL, and back to the list keeps the filters', async () => {
    const { user } = setup('/operations/receipts?status=DRAFT&search=volt&page=2');

    await user.click(await screen.findByRole('button', { name: 'Board view' }));
    expect(location()).toBe('/operations/receipts?status=DRAFT&search=volt&page=2&view=kanban');
    expect(await screen.findByRole('region', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(location()).toBe('/operations/receipts?status=DRAFT&search=volt&page=2');
    expect(await screen.findByRole('table', { name: 'Receipts' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('DRAFT');
  });

  it('opens on the board after a reload, asking for everything at once with the same filters and sort', async () => {
    const { fetchMock } = setup('/operations/receipts?view=kanban&late=true&sort=-scheduledDate&page=3');
    await screen.findByText('WH1/IN/00011');

    const params = calls(fetchMock);
    expect(params).toHaveLength(1);
    expect(params[0]!.get('page')).toBe('1');
    expect(params[0]!.get('pageSize')).toBe('100');
    expect(params[0]!.get('late')).toBe('true');
    expect(params[0]!.get('sort')).toBe('-scheduledDate');
    expect(params[0]!.get('type')).toBe('RECEIPT');
  });

  it('puts each card in its status column, with counts; receipts have no Waiting column', async () => {
    setup('/operations/receipts?view=kanban');
    await screen.findByText('WH1/IN/00011');

    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')).filter((n) => n !== 'Actions')).toEqual(
      expect.arrayContaining(['Draft', 'Ready', 'Done', 'Canceled']),
    );
    expect(screen.queryByRole('region', { name: 'Waiting' })).not.toBeInTheDocument();
    expect(within(column('Draft')).getAllByRole('link').map((a) => a.textContent)).toEqual([
      expect.stringContaining('WH1/IN/00011'),
      expect.stringContaining('WH1/IN/00012'),
    ]);
    expect(within(column('Draft')).getByLabelText('2 Draft')).toHaveTextContent('2');
    expect(within(column('Ready')).getByText('WH1/IN/00013')).toBeInTheDocument();
    expect(within(column('Done')).getByText('WH1/IN/00014')).toBeInTheDocument();
    expect(within(column('Canceled')).getByText('WH1/IN/00015')).toBeInTheDocument();
  });

  it('shows a Waiting column for deliveries', async () => {
    setup('/operations/deliveries?view=kanban', [op('21', 'WAITING', { type: 'DELIVERY', reference: 'WH1/OUT/00021' })]);
    expect(await within(await screen.findByRole('region', { name: 'Waiting' })).findByText('WH1/OUT/00021')).toBeInTheDocument();
  });

  it('summarises lines, shows the contact, and marks late cards red', async () => {
    setup('/operations/receipts?view=kanban');
    const draft = (await screen.findByText('WH1/IN/00011')).closest('a')!;
    expect(within(draft).getByText('4 lines · Office Chair, Steel Rods +2')).toBeInTheDocument();
    expect(within(draft).getByText('Volt Electronics')).toBeInTheDocument();
    expect(within(screen.getByText('WH1/IN/00012').closest('a')!).getByText('1 line · Mouse')).toBeInTheDocument();

    const late = screen.getByText('WH1/IN/00013').closest('a')!;
    expect(late).toHaveAttribute('data-late', 'true');
    expect(within(late).getByText('Late')).toBeInTheDocument();
    expect(within(late).getByText(/^Scheduled/)).toHaveClass('text-danger');
    expect(within(draft).queryByText('Late')).not.toBeInTheDocument();
  });

  it('hides the contact on transfer cards', async () => {
    setup('/operations/transfers?view=kanban', [op('31', 'READY', { type: 'TRANSFER', reference: 'WH1/INT/00031', partner: null })]);
    const card = (await screen.findByText('WH1/INT/00031')).closest('a')!;
    expect(within(card).queryByText('Volt Electronics')).not.toBeInTheDocument();
  });

  it('applies filter changes to the board', async () => {
    const { fetchMock, user } = setup('/operations/receipts?view=kanban');
    await screen.findByText('WH1/IN/00011');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'READY');
    await waitFor(() => expect(calls(fetchMock).at(-1)!.get('status')).toBe('READY'));
    expect(calls(fetchMock).at(-1)!.get('pageSize')).toBe('100');
    // Columns the status filter leaves out stay on the board, muted.
    expect(column('Draft')).toHaveClass('opacity-40');
    expect(column('Ready')).not.toHaveClass('opacity-40');
    expect(location()).toContain('view=kanban');
  });

  it('opens the document when a card is clicked', async () => {
    const { user } = setup('/operations/receipts?view=kanban');
    await user.click(await screen.findByText('WH1/IN/00013'));
    expect(location()).toBe('/operations/receipts/13');
  });

  it('says when there are more than the board shows', async () => {
    setup('/operations/receipts?view=kanban', RECEIPTS, 140);
    expect(await screen.findByText('Showing the first 5 of 140. Narrow the filters to see the rest.')).toBeInTheDocument();
  });

  it('shows an error with Retry', async () => {
    let fail = true;
    mockApi({
      'GET /auth/me': [200, { data: manager }],
      'GET /operations': () => (fail ? [500, { error: { code: 'INTERNAL', message: 'down' } }] : [200, list(RECEIPTS)]),
    });
    renderWithProviders(<App />, '/operations/receipts?view=kanban');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load receipts.");
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('WH1/IN/00011')).toBeInTheDocument();
  });
});
