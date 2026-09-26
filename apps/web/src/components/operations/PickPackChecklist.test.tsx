import type { MeDto, OperationDto } from '@stocksense/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { manager, mockApi, renderWithProviders, staff } from '@/test/render';

const T = '2026-09-26T08:35:00.000Z'; // 14:05 in Asia/Kolkata

function delivery(overrides: Partial<OperationDto> = {}): OperationDto {
  return {
    id: 'd1',
    reference: 'WH1/OUT/00017',
    type: 'DELIVERY',
    status: 'READY',
    version: 1,
    warehouseId: 'wh1',
    source: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
    dest: { id: 'c', label: 'Customers', type: 'CUSTOMER' },
    partner: null,
    responsible: null,
    scheduledDate: null,
    isLate: false,
    pickedAt: null,
    packedAt: null,
    notes: null,
    createdBy: { id: 'u1', name: 'Priya Sharma' },
    validatedBy: null,
    validatedAt: null,
    canceledBy: null,
    canceledAt: null,
    createdAt: T,
    lines: [],
    ...overrides,
  };
}

/**
 * A small stateful server for one delivery: each action applies the same rules as service.ts and bumps the version.
 * Returns the fetch mock and the list of { action, version } bodies it received.
 */
function server(initial: OperationDto, me: MeDto = manager) {
  let doc = initial;
  const sent: { action: string; version: number }[] = [];
  const act = (action: string, change: (d: OperationDto) => Partial<OperationDto>) => (body: unknown) => {
    sent.push({ action, version: (body as { version: number }).version });
    doc = { ...doc, ...change(doc), version: doc.version + 1 };
    return [200, { data: { operation: doc } }] as [number, unknown];
  };
  const fetchMock = mockApi({
    'GET /auth/me': [200, { data: me }],
    [`GET /operations/${initial.id}`]: () => [200, { data: doc }],
    'GET /operations': [200, { data: [], page: { page: 1, pageSize: 25, total: 0 } }],
    [`POST /operations/${initial.id}/pick`]: act('pick', () => ({ pickedAt: T })),
    [`POST /operations/${initial.id}/unpick`]: act('unpick', () => ({ pickedAt: null, packedAt: null })),
    [`POST /operations/${initial.id}/pack`]: act('pack', () => ({ packedAt: T })),
    [`POST /operations/${initial.id}/unpack`]: act('unpack', () => ({ packedAt: null })),
    [`POST /operations/${initial.id}/check-availability`]: act('check-availability', () => ({ status: 'WAITING', pickedAt: null, packedAt: null })),
    [`POST /operations/${initial.id}/validate`]: act('validate', () => ({ status: 'DONE' })),
  });
  const slug = initial.type === 'DELIVERY' ? 'deliveries' : 'transfers';
  renderWithProviders(<App />, `/operations/${slug}/${initial.id}`);
  return { fetchMock, sent, user: userEvent.setup() };
}

const checklist = () => within(screen.getByRole('region', { name: 'Pick and pack' }));
const step = (title: 'Pick' | 'Pack') => checklist().getByText(title, { selector: 'span.font-medium' }).closest('li')!;

describe('PickPackChecklist', () => {
  it('holds Pack until Pick, and Validate until both, in order', async () => {
    const { sent, user } = server(delivery());

    await screen.findByRole('region', { name: 'Pick and pack' });
    expect(within(step('Pick')).getByText('Not picked yet')).toBeInTheDocument();
    expect(within(step('Pack')).getByRole('button', { name: 'Pack' })).toBeDisabled();
    expect(within(step('Pack')).getByText('Pick first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(screen.getByText('Pick and pack first.')).toBeInTheDocument();

    await user.click(within(step('Pick')).getByRole('button', { name: 'Pick' }));
    expect(await within(step('Pick')).findByText('Picked 26 Sept 2026, 14:05')).toBeInTheDocument();
    expect(step('Pick')).toHaveAttribute('data-done', 'true');
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(screen.getByText('Pack first.')).toBeInTheDocument();

    await user.click(within(step('Pack')).getByRole('button', { name: 'Pack' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validate' })).toBeEnabled());
    expect(within(step('Pack')).getByText('Packed 26 Sept 2026, 14:05')).toBeInTheDocument();

    // Each action sent the version the previous one returned.
    expect(sent).toEqual([
      { action: 'pick', version: 1 },
      { action: 'pack', version: 2 },
    ]);
  });

  it('Undo pick clears both steps', async () => {
    const { sent, user } = server(delivery({ pickedAt: T, packedAt: T }));

    await screen.findByRole('region', { name: 'Pick and pack' });
    expect(within(step('Pick')).getByText('Also clears Pack.')).toBeInTheDocument();
    await user.click(within(step('Pick')).getByRole('button', { name: 'Undo pick' }));

    expect(await screen.findByText('Pick undone. Pack cleared too.')).toBeInTheDocument();
    expect(within(step('Pick')).getByText('Not picked yet')).toBeInTheDocument();
    expect(within(step('Pack')).getByText('Not packed yet')).toBeInTheDocument();
    expect(within(step('Pack')).getByRole('button', { name: 'Pack' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(sent).toEqual([{ action: 'unpick', version: 1 }]);
  });

  it('Undo pack clears only the pack', async () => {
    const { user } = server(delivery({ pickedAt: T, packedAt: T }));

    await user.click(within(await screen.findByRole('region', { name: 'Pick and pack' })).getByRole('button', { name: 'Undo pack' }));

    expect(await screen.findByText('Pack undone.')).toBeInTheDocument();
    expect(step('Pick')).toHaveAttribute('data-done', 'true');
    expect(step('Pack')).toHaveAttribute('data-done', 'false');
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(screen.getByText('Pack first.')).toBeInTheDocument();
  });

  it('validates once both are done', async () => {
    const { sent, user } = server(delivery({ pickedAt: T, packedAt: T }));

    await user.click(await screen.findByRole('button', { name: 'Validate' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Done', { selector: 'span[data-tone]' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pick and pack' })).not.toBeInTheDocument();
    expect(sent.at(-1)).toEqual({ action: 'validate', version: 1 });
  });

  it('lets Staff pick and pack, but not validate a delivery', async () => {
    const { user } = server(delivery(), staff);

    await user.click(within(await screen.findByRole('region', { name: 'Pick and pack' })).getByRole('button', { name: 'Pick' }));
    await user.click(await within(step('Pack')).findByRole('button', { name: 'Pack' }));

    await waitFor(() => expect(step('Pack')).toHaveAttribute('data-done', 'true'));
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument();
  });

  it('resets when Check availability sends the delivery back to Waiting', async () => {
    const { user } = server(delivery({ pickedAt: T, packedAt: T }));

    await user.click(await screen.findByRole('button', { name: 'Check availability' }));

    expect(await screen.findByText('Waiting for stock.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pick and pack' })).not.toBeInTheDocument();
  });

  it('shows no checklist on a Ready transfer, whose Validate is not held', async () => {
    server(delivery({ type: 'TRANSFER', reference: 'WH1/INT/00007', dest: { id: 'r', label: 'WH1/Rack A', type: 'INTERNAL' } }));

    expect(await screen.findByRole('button', { name: 'Validate' })).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'Pick and pack' })).not.toBeInTheDocument();
    expect(screen.queryByText(/first\./)).not.toBeInTheDocument();
  });
});
