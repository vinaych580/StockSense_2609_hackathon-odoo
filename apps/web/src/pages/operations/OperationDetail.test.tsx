import type { MeDto, OperationDto, OperationLineDto } from '@stocksense/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders, staff } from '@/test/render';

function line(overrides: Partial<OperationLineDto>): OperationLineDto {
  return {
    id: 'l1',
    productId: 'p-oc',
    sku: 'OC-10',
    productName: 'Office Chair',
    uom: 'UNIT',
    productActive: true,
    quantity: '6.000',
    countedQuantity: null,
    balanceAtCount: null,
    postedQuantity: null,
    onHand: null,
    shortBy: null,
    ...overrides,
  };
}

function op(overrides: Partial<OperationDto> = {}): OperationDto {
  return {
    id: 'op-1',
    reference: 'WH1/IN/00012',
    type: 'RECEIPT',
    status: 'READY',
    version: 3,
    warehouseId: 'wh1',
    source: { id: 'v', label: 'Vendors', type: 'VENDOR' },
    dest: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
    partner: { id: 'p', name: 'Volt Electronics' },
    responsible: { id: 'u2', name: 'Neha Kapoor' },
    scheduledDate: '2026-09-30T03:30:00.000Z',
    isLate: false,
    pickedAt: null,
    packedAt: null,
    notes: 'C7 check',
    createdBy: { id: 'u1', name: 'Priya Sharma' },
    validatedBy: null,
    validatedAt: null,
    canceledBy: null,
    canceledAt: null,
    createdAt: '2026-09-26T04:00:00.000Z',
    lines: [line({}), line({ id: 'l2', productId: 'p-sr', sku: 'SR-01', productName: 'Steel Rods', uom: 'KG', quantity: '12.500' })],
    ...overrides,
  };
}

const done = (o: OperationDto) => ({ ...o, status: 'DONE' as const, version: o.version + 1, validatedBy: { id: 'u1', name: 'Priya Sharma' }, validatedAt: '2026-09-26T05:00:00.000Z' });

/** Bodies of every POST to this action, in order. */
function posts(fetchMock: ReturnType<typeof mockApi>, action: string) {
  return fetchMock.mock.calls
    .filter(([input, init]) => init?.method === 'POST' && String(input).endsWith(`/${action}`))
    .map(([, init]) => JSON.parse(String(init!.body)));
}

function setup(document: OperationDto, routes: Parameters<typeof mockApi>[0] = {}, me: MeDto = manager) {
  const slug = { RECEIPT: 'receipts', DELIVERY: 'deliveries', TRANSFER: 'transfers', ADJUSTMENT: 'adjustments' }[document.type];
  const fetchMock = mockApi({
    'GET /auth/me': [200, { data: me }],
    [`GET /operations/${document.id}`]: [200, { data: document }],
    'GET /operations': [200, { data: [], page: { page: 1, pageSize: 25, total: 0 } }],
    ...routes,
  });
  renderWithProviders(<App />, `/operations/${slug}/${document.id}`);
  return { fetchMock, user: userEvent.setup() };
}

async function validateThroughDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Validate' }));
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Validate' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
}

describe('OperationDetail', () => {
  it('shows the details, stepper and lines of a Ready receipt', async () => {
    setup(op());
    expect(await screen.findByRole('heading', { name: 'WH1/IN/00012' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('Volt Electronics')).toBeInTheDocument();
    expect(screen.getByText('C7 check')).toBeInTheDocument();
    const lines = within(screen.getByRole('region', { name: 'Lines' }));
    expect(lines.getByText('Steel Rods')).toBeInTheDocument();
    expect(lines.getByText('12.5')).toBeInTheDocument();
  });

  it('validates a Draft receipt in one action, after the dialog states the effect', async () => {
    const draft = op({ status: 'DRAFT' });
    const { fetchMock, user } = setup(draft, {
      'POST /operations/op-1/validate': [200, { data: { operation: done(draft), posted: { movesPosted: 2, unchangedLines: 0, productIds: [], warehouseIds: [] } } }],
    });

    await user.click(await screen.findByRole('button', { name: 'Validate' }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription('Stock of 2 products will increase at WH1/Stock.');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Validated. 2 moves posted.')).toBeInTheDocument();
    expect(posts(fetchMock, 'validate')).toEqual([{ version: 3 }]);
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    // Done: no buttons left, and the Draft form is gone.
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });

  it('treats a replayed validate as success', async () => {
    const { user } = setup(op(), {
      'POST /operations/op-1/validate': [200, { data: { operation: done(op()), replayed: true } }],
    });
    await validateThroughDialog(user);
    expect(await screen.findByText('Already validated.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks exactly the short lines red on INSUFFICIENT_STOCK', async () => {
    const delivery = op({
      type: 'DELIVERY',
      reference: 'WH1/OUT/00014',
      source: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
      dest: { id: 'c', label: 'Customers', type: 'CUSTOMER' },
      pickedAt: '2026-09-26T05:00:00.000Z',
      packedAt: '2026-09-26T05:01:00.000Z',
    });
    const { fetchMock, user } = setup(delivery, {
      'POST /operations/op-1/validate': [
        409,
        {
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: 'Not enough stock for 1 line',
            details: [{ productId: 'p-sr', sku: 'SR-01', productName: 'Steel Rods', locationId: 's', locationName: 'WH1/Stock', requested: '12.500', available: '4.000' }],
          },
        },
      ],
    });
    await validateThroughDialog(user);

    expect(await screen.findByText('needs 12.5 kg, 4 at WH1/Stock')).toBeInTheDocument();
    expect(screen.getByText('Steel Rods').closest('tr')).toHaveAttribute('data-short', 'true');
    expect(screen.getByText('Office Chair').closest('tr')).not.toHaveAttribute('data-short');
    expect(screen.getByRole('alert')).toHaveTextContent('Not enough stock for 1 line');
    // The page reloads the document so its on-hand numbers match the error.
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/operations/op-1') && init?.method === 'GET').length).toBe(2));
  });

  it('shows short lines on load from shortBy, before any action', async () => {
    setup(
      op({
        type: 'DELIVERY',
        status: 'WAITING',
        source: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
        dest: { id: 'c', label: 'Customers', type: 'CUSTOMER' },
        lines: [line({ productId: 'p-dk', sku: 'DK-11', productName: 'Desk', quantity: '999.000', onHand: '14.000', shortBy: '985.000' })],
      }),
    );
    expect(await screen.findByText('needs 999, 14 at WH1/Stock')).toBeInTheDocument();
    expect(screen.getByText('Desk').closest('tr')).toHaveAttribute('data-short', 'true');
  });

  it('shows BALANCE_CHANGED and posts anyway with the flag', async () => {
    const adjustment = op({
      type: 'ADJUSTMENT',
      reference: 'WH1/ADJ/00003',
      status: 'READY',
      source: { id: 'a', label: 'Inventory adjustment', type: 'ADJUSTMENT' },
      lines: [line({ productId: 'p-tp', sku: 'TP-31', productName: 'Packing Tape', quantity: null, countedQuantity: '56.000' })],
    });
    let first = true;
    const { fetchMock, user } = setup(adjustment, {
      'POST /operations/op-1/validate': () => {
        if (first) {
          first = false;
          return [409, { error: { code: 'BALANCE_CHANGED', message: 'Changed', details: [{ productId: 'p-tp', sku: 'TP-31', productName: 'Packing Tape', counted: '56.000', balanceAtCount: '58.000', currentBalance: '50.000' }] } }];
        }
        return [200, { data: { operation: done(adjustment), posted: { movesPosted: 1, unchangedLines: 0, productIds: [], warehouseIds: [] } } }];
      },
    });
    await validateThroughDialog(user);

    const panel = await screen.findByText('The stock changed since these were counted.');
    const box = within(panel.closest('[role=alert]') as HTMLElement);
    expect(box.getByText('56')).toBeInTheDocument();
    expect(box.getByText('58')).toBeInTheDocument();
    expect(box.getByText('50')).toBeInTheDocument();

    await user.click(box.getByRole('button', { name: 'Post anyway' }));
    expect(await screen.findByText('Validated. 1 move posted.')).toBeInTheDocument();
    expect(posts(fetchMock, 'validate')).toEqual([{ version: 3 }, { version: 3, acknowledgeBalanceChange: true }]);
  });

  it('reloads on STALE_VERSION and sends the new version next time', async () => {
    let version = 3;
    let first = true;
    const { fetchMock, user } = setup(op({ type: 'TRANSFER', status: 'WAITING', source: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' } }), {
      'GET /operations/op-1': () => [200, { data: op({ type: 'TRANSFER', status: 'WAITING', version, source: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' } }) }],
      'POST /operations/op-1/check-availability': () => {
        if (first) {
          first = false;
          version = 5; // someone else saved meanwhile
          return [409, { error: { code: 'STALE_VERSION', message: 'Changed by someone else' } }];
        }
        return [200, { data: { operation: op({ type: 'TRANSFER', status: 'READY', version: 6 }) } }];
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Check availability' }));
    expect(await screen.findByText(/latest version is loaded/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check availability' }));

    expect(await screen.findByText('Ready.')).toBeInTheDocument();
    expect(posts(fetchMock, 'check-availability')).toEqual([{ version: 3 }, { version: 5 }]);
  });

  it('keeps typed Draft edits on a STALE_VERSION save and saves with the new version', async () => {
    let version = 3;
    const transfer = () => op({ type: 'TRANSFER', status: 'DRAFT', version, reference: 'WH1/INT/00006', source: { id: 'b03e4479-2673-51ba-8663-56be4c76f423', label: 'WH1/Stock', type: 'INTERNAL' }, dest: { id: '59c0ae35-6400-5211-9245-97efd658be4e', label: 'WH1/Rack A', type: 'INTERNAL' }, lines: [] });
    let first = true;
    const { fetchMock, user } = setup(transfer(), {
      'GET /operations/op-1': () => [200, { data: transfer() }],
      'PATCH /operations/op-1': () => {
        if (first) {
          first = false;
          version = 4;
          return [409, { error: { code: 'STALE_VERSION', message: 'Changed' } }];
        }
        return [200, { data: { ...transfer(), version: 5, notes: 'C7 check, recount' } }];
      },
    });

    await user.type(await screen.findByLabelText('Notes'), ', recount');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/Their version is loaded behind your edits/)).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('C7 check, recount');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init!.body)).version);
    expect(patches).toEqual([3, 4]);
  });

  it('disables actions while the Draft form has unsaved edits', async () => {
    const { user } = setup(op({ status: 'DRAFT' }));
    const validate = await screen.findByRole('button', { name: 'Validate' });
    expect(validate).toBeEnabled();

    await user.type(screen.getByLabelText('Notes'), '!');
    expect(validate).toBeDisabled();
    expect(screen.getByText('Save your changes first.')).toBeInTheDocument();
  });

  it('shows other errors inline, e.g. NOT_READY from pack', async () => {
    const delivery = op({ type: 'DELIVERY', source: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' }, pickedAt: '2026-09-26T05:00:00.000Z', packedAt: null });
    const { user } = setup(delivery, {
      'POST /operations/op-1/pack': [409, { error: { code: 'NOT_READY', message: 'Pick WH1/IN/00012 before packing it' } }],
    });
    await user.click(await screen.findByRole('button', { name: 'Mark packed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick WH1/IN/00012 before packing it');
  });

  it('cancels through the dialog', async () => {
    const draft = op({ type: 'DELIVERY', status: 'DRAFT', source: { id: 'b03e4479-2673-51ba-8663-56be4c76f423', label: 'WH1/Stock', type: 'INTERNAL' } });
    const { fetchMock, user } = setup(draft, {
      'POST /operations/op-1/cancel': [200, { data: { operation: { ...draft, status: 'CANCELED', version: 4, canceledBy: { id: 'u1', name: 'Priya Sharma' }, canceledAt: '2026-09-26T05:00:00.000Z' } } }],
    });

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleDescription('WH1/IN/00012 is canceled. No stock changes.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel delivery' }));

    expect(await screen.findByText('Canceled.')).toBeInTheDocument();
    expect(posts(fetchMock, 'cancel')).toEqual([{ version: 3 }]);
  });

  it('shows Staff no actions on a Done receipt', async () => {
    setup(op({ status: 'DONE' }), {}, staff);
    expect(await screen.findByRole('heading', { name: 'WH1/IN/00012' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Actions' })).not.toBeInTheDocument();
  });
});
