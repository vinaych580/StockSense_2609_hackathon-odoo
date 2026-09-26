import type { OperationDto } from '@stocksense/shared';
import { describe, expect, it } from 'vitest';

import { actionEffect, availableActions, shortMessage } from './actions';

function op(overrides: Partial<OperationDto>): OperationDto {
  return {
    id: 'op',
    reference: 'WH1/IN/00012',
    type: 'RECEIPT',
    status: 'DRAFT',
    version: 1,
    warehouseId: 'wh1',
    source: { id: 'v', label: 'Vendors', type: 'VENDOR' },
    dest: { id: 's', label: 'WH1/Stock', type: 'INTERNAL' },
    partner: null,
    responsible: null,
    scheduledDate: null,
    isLate: false,
    pickedAt: null,
    packedAt: null,
    notes: null,
    createdBy: { id: 'u', name: 'Priya' },
    validatedBy: null,
    validatedAt: null,
    canceledBy: null,
    canceledAt: null,
    createdAt: '2026-09-26T00:00:00.000Z',
    lines: [{} as OperationDto['lines'][number], {} as OperationDto['lines'][number]],
    ...overrides,
  };
}

describe('availableActions', () => {
  it.each([
    ['Draft receipt, Manager', op({}), 'MANAGER', ['confirm', 'validate', 'cancel']],
    ['Draft receipt, Staff', op({}), 'STAFF', ['validate']],
    ['Ready receipt, Staff', op({ status: 'READY' }), 'STAFF', ['validate']],
    ['Draft delivery, Manager', op({ type: 'DELIVERY' }), 'MANAGER', ['confirm', 'cancel']],
    ['Ready delivery, Staff', op({ type: 'DELIVERY', status: 'READY' }), 'STAFF', ['pick']],
    ['Ready delivery, picked, Manager', op({ type: 'DELIVERY', status: 'READY', pickedAt: 'x' }), 'MANAGER', ['check-availability', 'pack', 'validate', 'reset-to-draft', 'cancel']],
    ['Ready delivery, packed, Staff', op({ type: 'DELIVERY', status: 'READY', pickedAt: 'x', packedAt: 'x' }), 'STAFF', []],
    ['Waiting transfer, Staff', op({ type: 'TRANSFER', status: 'WAITING' }), 'STAFF', ['check-availability', 'reset-to-draft', 'cancel']],
    ['Draft adjustment, Staff', op({ type: 'ADJUSTMENT' }), 'STAFF', ['confirm', 'cancel']],
    ['Draft adjustment, Manager', op({ type: 'ADJUSTMENT' }), 'MANAGER', ['confirm', 'validate', 'cancel']],
    ['Done receipt, Manager', op({ status: 'DONE' }), 'MANAGER', []],
    ['Canceled delivery, Manager', op({ type: 'DELIVERY', status: 'CANCELED' }), 'MANAGER', []],
  ] as const)('%s', (_, operation, role, expected) => {
    expect(availableActions(operation, role)).toEqual(expected);
  });
});

describe('actionEffect', () => {
  it('says where stock changes', () => {
    expect(actionEffect(op({}), 'validate')).toBe('Stock of 2 products will increase at WH1/Stock.');
    expect(actionEffect(op({ type: 'DELIVERY', source: { id: 's', label: 'WH1/Rack A', type: 'INTERNAL' } }), 'validate')).toBe(
      'Stock of 2 products will decrease at WH1/Rack A.',
    );
    expect(actionEffect(op({ type: 'TRANSFER', source: { id: 'a', label: 'WH1/Stock', type: 'INTERNAL' }, dest: { id: 'b', label: 'WH2/Stock', type: 'INTERNAL' } }), 'validate')).toBe(
      '2 products move from WH1/Stock to WH2/Stock.',
    );
    expect(actionEffect(op({ type: 'ADJUSTMENT', lines: [{} as OperationDto['lines'][number]] }), 'validate')).toBe(
      'Stock at WH1/Stock is set to the counted quantities (1 product).',
    );
    expect(actionEffect(op({}), 'cancel')).toBe('WH1/IN/00012 is canceled. No stock changes.');
  });
});

describe('shortMessage', () => {
  it('trims padded numbers and names the location', () => {
    expect(shortMessage('10.000', '4.000', 'WH1/Stock', 'UNIT')).toBe('needs 10, 4 at WH1/Stock');
    expect(shortMessage('12.500', '0.250', 'WH1/Rack B', 'KG')).toBe('needs 12.5 kg, 0.25 at WH1/Rack B');
  });
});
