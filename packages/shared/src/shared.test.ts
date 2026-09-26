import { describe, expect, it } from 'vitest';
import {
  canOperate,
  canTransition,
  fitsUom,
  moveListQuery,
  operationCreateInput,
  operationListQuery,
  significantDecimals,
  stockListQuery,
} from './index';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('transition table', () => {
  it('validates receipts and adjustments from Draft, never deliveries or transfers', () => {
    expect(canTransition('validate', 'RECEIPT', 'DRAFT')).toBe(true);
    expect(canTransition('validate', 'ADJUSTMENT', 'DRAFT')).toBe(true);
    expect(canTransition('validate', 'DELIVERY', 'DRAFT')).toBe(false);
    expect(canTransition('validate', 'TRANSFER', 'DRAFT')).toBe(false);
  });

  it('treats Done and Canceled as final', () => {
    for (const status of ['DONE', 'CANCELED'] as const) {
      for (const action of ['validate', 'cancel', 'confirm', 'edit', 'reset-to-draft'] as const) {
        expect(canTransition(action, 'DELIVERY', status)).toBe(false);
      }
    }
  });

  it('limits pick and pack to Ready deliveries', () => {
    expect(canTransition('pick', 'DELIVERY', 'READY')).toBe(true);
    expect(canTransition('pick', 'TRANSFER', 'READY')).toBe(false);
    expect(canTransition('pack', 'DELIVERY', 'WAITING')).toBe(false);
  });

  it('offers check availability only on outgoing documents', () => {
    expect(canTransition('check-availability', 'DELIVERY', 'WAITING')).toBe(true);
    expect(canTransition('check-availability', 'RECEIPT', 'READY')).toBe(false);
  });
});

describe('permission map', () => {
  it('lets Staff validate receipts but not create them', () => {
    expect(canOperate('STAFF', 'validate', 'RECEIPT')).toBe(true);
    expect(canOperate('STAFF', 'create', 'RECEIPT')).toBe(false);
  });
  it('keeps adjustment validation with Managers', () => {
    expect(canOperate('STAFF', 'validate', 'ADJUSTMENT')).toBe(false);
    expect(canOperate('STAFF', 'confirm', 'ADJUSTMENT')).toBe(true);
    expect(canOperate('MANAGER', 'validate', 'ADJUSTMENT')).toBe(true);
  });
  it('lets Staff pick and pack but not ship deliveries', () => {
    expect(canOperate('STAFF', 'pick', 'DELIVERY')).toBe(true);
    expect(canOperate('STAFF', 'validate', 'DELIVERY')).toBe(false);
  });
});

describe('unit of measure precision', () => {
  it('counts only significant decimals', () => {
    expect(significantDecimals('12.500')).toBe(1);
    expect(significantDecimals('12')).toBe(0);
    expect(significantDecimals('0.125')).toBe(3);
  });
  it('rejects fractional units but allows kilograms', () => {
    expect(fitsUom('2.5', 'UNIT')).toBe(false);
    expect(fitsUom('2.000', 'UNIT')).toBe(true);
    expect(fitsUom('2.125', 'KG')).toBe(true);
  });
});

describe('operation create schema', () => {
  const base = { sourceLocationId: u(1), destLocationId: u(2) };

  it('requires quantity > 0 on receipts', () => {
    const r = operationCreateInput.safeParse({ ...base, type: 'RECEIPT', lines: [{ productId: u(9), quantity: '0' }] });
    expect(r.success).toBe(false);
  });
  it('requires a counted quantity on adjustments and accepts 0', () => {
    expect(
      operationCreateInput.safeParse({ ...base, type: 'ADJUSTMENT', lines: [{ productId: u(9) }] }).success,
    ).toBe(false);
    expect(
      operationCreateInput.safeParse({ ...base, type: 'ADJUSTMENT', lines: [{ productId: u(9), countedQuantity: '0' }] })
        .success,
    ).toBe(true);
  });
  it('rejects duplicate products, the same source and destination, and 4 decimals', () => {
    expect(
      operationCreateInput.safeParse({
        ...base,
        type: 'RECEIPT',
        lines: [{ productId: u(9), quantity: '1' }, { productId: u(9), quantity: '2' }],
      }).success,
    ).toBe(false);
    expect(
      operationCreateInput.safeParse({ type: 'TRANSFER', sourceLocationId: u(1), destLocationId: u(1), lines: [] }).success,
    ).toBe(false);
    expect(
      operationCreateInput.safeParse({ ...base, type: 'RECEIPT', lines: [{ productId: u(9), quantity: '1.0001' }] }).success,
    ).toBe(false);
  });
});

describe('list query strings', () => {
  it('treats an empty value as no filter, as HTML forms send them', () => {
    const q = operationListQuery.parse({ type: '', status: '', dateFrom: '', late: '', search: '', page: '' });
    expect(q).toMatchObject({ page: 1, pageSize: 25, sort: '-createdAt' });
    expect([q.type, q.status, q.dateFrom, q.late]).toEqual([undefined, undefined, undefined, undefined]);
    expect(stockListQuery.parse({ includeZero: '', warehouseId: '' }).warehouseId).toBeUndefined();
    expect(moveListQuery.parse({ type: '', dateTo: '' }).type).toBeUndefined();
  });

  it('keeps a date filter as given: a calendar day, or an ISO instant with its offset', () => {
    expect(operationListQuery.parse({ dateFrom: '2026-09-26' }).dateFrom).toBe('2026-09-26');
    expect(moveListQuery.parse({ dateTo: '2026-09-26T10:00:00+05:30' }).dateTo).toBe('2026-09-26T10:00:00+05:30');
    expect(operationListQuery.safeParse({ dateFrom: '2026-02-30' }).success).toBe(false);
    expect(operationListQuery.safeParse({ dateTo: 'yesterday' }).success).toBe(false);
  });
});
