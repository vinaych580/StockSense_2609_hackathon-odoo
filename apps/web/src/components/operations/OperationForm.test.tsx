import { type MeDto, type OperationDto, SYSTEM_LOCATION_IDS } from '@stocksense/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders, sentBody, staff } from '@/test/render';

// Seed ids (masterDataStub).
const WH1_STOCK = 'b03e4479-2673-51ba-8663-56be4c76f423';
const WH1_RACKA = '59c0ae35-6400-5211-9245-97efd658be4e';
const VOLT = 'partner-volt';

type User = ReturnType<typeof userEvent.setup>;

function draft(overrides: Partial<OperationDto> = {}): OperationDto {
  return {
    id: 'op-new',
    reference: 'WH1/IN/00013',
    type: 'RECEIPT',
    status: 'DRAFT',
    version: 3,
    warehouseId: 'wh1',
    source: { id: SYSTEM_LOCATION_IDS.VENDOR, label: 'Vendors', type: 'VENDOR' },
    dest: { id: WH1_STOCK, label: 'WH1/Stock', type: 'INTERNAL' },
    partner: null,
    responsible: null,
    scheduledDate: '2026-09-29T18:30:00.000Z', // 30 Sept in Asia/Kolkata
    isLate: false,
    pickedAt: null,
    packedAt: null,
    notes: 'C6 check',
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

async function pickProduct(user: User, line: number, search: string) {
  const box = screen.getByRole('combobox', { name: `Line ${line} product` });
  await user.click(box);
  await user.type(box, search);
  await user.keyboard('{Enter}');
}

function productId(sku: string) {
  // Read the real seed id from the stub, so tests don't hardcode 24 UUIDs.
  return import('@/lib/masterDataStub').then((m) => m.useProductOptions().find((p) => p.sku === sku)!.id);
}

function setup(path: string, me: MeDto, routes: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({ 'GET /auth/me': [200, { data: me }], 'GET /operations': [200, { data: [], page: { page: 1, pageSize: 25, total: 0 } }], ...routes });
  renderWithProviders(<App />, path);
  return { fetchMock, user: userEvent.setup() };
}

describe('OperationForm: create', () => {
  it('creates a receipt with the fixed Vendors source, then opens the new Draft', async () => {
    const { fetchMock, user } = setup('/operations/receipts/new', manager, {
      'POST /operations': [201, { data: draft() }],
      'GET /operations/op-new': [200, { data: draft() }],
    });

    expect(await screen.findByRole('textbox', { name: 'From' })).toHaveTextContent('Vendors');
    await user.selectOptions(screen.getByRole('combobox', { name: 'To' }), WH1_STOCK);
    await user.selectOptions(screen.getByLabelText('Supplier'), 'Volt Electronics');
    await user.type(screen.getByLabelText('Scheduled'), '2026-09-30');
    await user.type(screen.getByLabelText('Notes'), 'C6 check');
    await pickProduct(user, 1, 'OC-10');
    await user.type(screen.getByLabelText('Line 1 quantity'), '4');
    await user.click(screen.getByRole('button', { name: 'Add line' }));
    await pickProduct(user, 2, 'steel');
    await user.type(screen.getByLabelText('Line 2 quantity'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/operations/receipts/op-new'));
    expect(sentBody(fetchMock, 'POST /operations')).toEqual({
      type: 'RECEIPT',
      sourceLocationId: SYSTEM_LOCATION_IDS.VENDOR,
      destLocationId: WH1_STOCK,
      partnerId: expect.any(String),
      responsibleId: null,
      scheduledDate: '2026-09-30',
      notes: 'C6 check',
      lines: [
        { productId: await productId('OC-10'), quantity: '4' },
        { productId: await productId('SR-01'), quantity: '12.5' },
      ],
    });
    expect(await screen.findByText('WH1/IN/00013 created as a Draft.')).toBeInTheDocument();
  });

  it('sends countedQuantity for an adjustment, and accepts a count of 0', async () => {
    const { fetchMock, user } = setup('/operations/adjustments/new', manager, {
      'POST /operations': [201, { data: draft({ id: 'adj-1', type: 'ADJUSTMENT' }) }],
      'GET /operations/adj-1': [200, { data: draft({ id: 'adj-1', type: 'ADJUSTMENT' }) }],
    });

    expect(await screen.findByRole('textbox', { name: 'From' })).toHaveTextContent('Inventory adjustment');
    expect(screen.queryByLabelText(/Supplier|Customer/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'To' }), WH1_RACKA);
    await pickProduct(user, 1, 'TP-31');
    await user.type(screen.getByLabelText('Line 1 counted'), '0');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(sentBody(fetchMock, 'POST /operations')).toBeDefined());
    expect(sentBody(fetchMock, 'POST /operations')).toMatchObject({
      type: 'ADJUSTMENT',
      sourceLocationId: SYSTEM_LOCATION_IDS.ADJUSTMENT,
      partnerId: null,
      lines: [{ productId: await productId('TP-31'), countedQuantity: '0' }],
    });
  });

  it('stops a transfer to the same location before calling the API', async () => {
    const { fetchMock, user } = setup('/operations/transfers/new', manager);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'From' }), WH1_STOCK);
    await user.selectOptions(screen.getByRole('combobox', { name: 'To' }), WH1_STOCK);
    await pickProduct(user, 1, 'MS-22');
    await user.type(screen.getByLabelText('Line 1 quantity'), '2');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('Source and destination must differ')).toBeInTheDocument();
    expect(sentBody(fetchMock, 'POST /operations')).toBeUndefined();
  });

  it('flags a whole-unit product given decimals, and a duplicate product', async () => {
    const { fetchMock, user } = setup('/operations/transfers/new', manager);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'From' }), WH1_STOCK);
    await user.selectOptions(screen.getByRole('combobox', { name: 'To' }), WH1_RACKA);
    // Type the quantity first (no product yet allows decimals), then choose a whole-unit product.
    await user.type(screen.getByLabelText('Line 1 quantity'), '1.5');
    await pickProduct(user, 1, 'DK-11');
    await user.click(screen.getByRole('button', { name: 'Add line' }));
    const box = screen.getByRole('combobox', { name: 'Line 2 product' });
    await user.click(box);
    await user.type(box, 'DK-11');
    expect(screen.getByRole('option', { name: /Desk/ })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('Units are whole numbers')).toBeInTheDocument();
    expect(screen.getByText('Choose a product')).toBeInTheDocument();
    expect(sentBody(fetchMock, 'POST /operations')).toBeUndefined();
  });

  it('shows a server line error on the right line', async () => {
    const { user } = setup('/operations/adjustments/new', manager, {
      'POST /operations': [400, { error: { code: 'VALIDATION_FAILED', message: 'Invalid', details: [{ path: 'lines.0.countedQuantity', message: 'Too large' }] } }],
    });

    await user.selectOptions(await screen.findByRole('combobox', { name: 'To' }), WH1_RACKA);
    await pickProduct(user, 1, 'TP-31');
    await user.type(screen.getByLabelText('Line 1 counted'), '5');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('Too large')).toBeInTheDocument();
    expect(screen.getByLabelText('Line 1 counted')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends Staff away from New receipt', async () => {
    setup('/operations/receipts/new', staff);
    expect(await screen.findByRole('heading', { name: "You don't have access" })).toBeInTheDocument();
  });
});

describe('OperationForm: edit', () => {
  it('prefills a Draft and PATCHes with the version it read, then the new one', async () => {
    const chair = await productId('OC-10');
    const loaded = draft({
      partner: { id: VOLT, name: 'Volt Electronics' },
      lines: [{ id: 'l1', productId: chair, sku: 'OC-10', productName: 'Office Chair', uom: 'UNIT', productActive: true, quantity: '4', countedQuantity: null, balanceAtCount: null, postedQuantity: null, onHand: null, shortBy: null }],
    });
    let version = 3;
    const { fetchMock, user } = setup('/operations/receipts/op-new', manager, {
      'GET /operations/op-new': [200, { data: loaded }],
      'PATCH /operations/op-new': (body) => [200, { data: { ...loaded, version: ++version, lines: loaded.lines.map((l) => ({ ...l, quantity: (body as { lines: { quantity: string }[] }).lines[0]!.quantity })) } }],
    });

    expect(await screen.findByRole('heading', { name: 'WH1/IN/00013' })).toBeInTheDocument();
    expect(screen.getByLabelText('Scheduled')).toHaveValue('2026-09-30');
    expect(screen.getByLabelText('Line 1 quantity')).toHaveValue('4');
    expect(screen.getByRole('combobox', { name: 'Line 1 product' })).toHaveValue('OC-10 · Office Chair');

    await user.clear(screen.getByLabelText('Line 1 quantity'));
    await user.type(screen.getByLabelText('Line 1 quantity'), '6');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init!.body)));
    expect(patches[0]).toMatchObject({ version: 3, partnerId: VOLT, lines: [{ productId: chair, quantity: '6' }] });
    expect(patches[0]).not.toHaveProperty('type');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(2));
    const second = JSON.parse(String(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')[1]![1]!.body));
    expect(second.version).toBe(4);
  });

  it('shows a stale-version error inline without losing the edits', async () => {
    const { user } = setup('/operations/transfers/op-new', manager, {
      'GET /operations/op-new': [200, { data: draft({ type: 'TRANSFER', reference: 'WH1/INT/00007', source: { id: WH1_STOCK, label: 'WH1/Stock', type: 'INTERNAL' }, dest: { id: WH1_RACKA, label: 'WH1/Rack A', type: 'INTERNAL' } }) }],
      'PATCH /operations/op-new': [409, { error: { code: 'STALE_VERSION', message: 'WH1/INT/00007 was changed by someone else. Reload to see their changes.' } }],
    });

    await user.type(await screen.findByLabelText('Notes'), ' more');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else');
    expect(screen.getByLabelText('Notes')).toHaveValue('C6 check more');
  });

  it('shows Staff a Draft receipt read-only', async () => {
    setup('/operations/receipts/op-new', staff, { 'GET /operations/op-new': [200, { data: draft() }] });
    expect(await screen.findByText('Your role can view this Draft but not edit it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });

  it('lets Staff edit a Draft transfer', async () => {
    setup('/operations/transfers/op-t', staff, {
      'GET /operations/op-t': [200, { data: draft({ id: 'op-t', type: 'TRANSFER', source: { id: WH1_STOCK, label: 'WH1/Stock', type: 'INTERNAL' } }) }],
    });
    expect(await screen.findByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  });

  it('shows the placeholder for a document past Draft', async () => {
    setup('/operations/receipts/op-r', manager, { 'GET /operations/op-r': [200, { data: draft({ id: 'op-r', status: 'READY' }) }] });
    const header = await screen.findByText(/Receipt detail/);
    expect(header).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Ready')).toBeInTheDocument();
  });

  it('moves a link with the wrong type to the right one', async () => {
    setup('/operations/deliveries/op-new', manager, { 'GET /operations/op-new': [200, { data: draft() }] });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/operations/receipts/op-new'));
  });

  it('shows 404 for a document that does not exist', async () => {
    setup('/operations/receipts/nope', manager, { 'GET /operations/nope': [404, { error: { code: 'NOT_FOUND', message: 'No such operation' } }] });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
