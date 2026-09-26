import { SYSTEM_LOCATION_IDS } from '@stocksense/shared';
import { describe, expect, it } from 'vitest';

import type { ProductOption } from '@/lib/masterDataStub';

import { emptyValues, formPath, trimQuantity, type OperationFormValues, operationFormSchema, toCreateBody, toUpdateBody } from './formSchema';

const products: ProductOption[] = [
  { id: 'p-unit', sku: 'OC-10', name: 'Office Chair', uom: 'UNIT', isActive: true },
  { id: 'p-kg', sku: 'SR-01', name: 'Steel Rods', uom: 'KG', isActive: true },
];

function values(overrides: Partial<OperationFormValues> = {}): OperationFormValues {
  return {
    sourceLocationId: 'loc-a',
    destLocationId: 'loc-b',
    partnerId: '',
    responsibleId: '',
    scheduledDate: '',
    notes: '',
    lines: [{ key: 'k1', productId: 'p-kg', quantity: '1.250' }],
    ...overrides,
  };
}

/** path → message for every issue. */
function issues(type: Parameters<typeof operationFormSchema>[0], v: OperationFormValues) {
  const result = operationFormSchema(type, products).safeParse(v);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('operationFormSchema', () => {
  it('accepts a valid transfer', () => {
    expect(issues('TRANSFER', values())).toEqual({});
  });

  it('rejects the same source and destination', () => {
    expect(issues('TRANSFER', values({ destLocationId: 'loc-a' }))).toEqual({ destLocationId: 'Source and destination must differ' });
  });

  it('rejects a product that is already on an earlier line', () => {
    const lines = [
      { key: 'a', productId: 'p-kg', quantity: '1' },
      { key: 'b', productId: 'p-unit', quantity: '1' },
      { key: 'c', productId: 'p-kg', quantity: '2' },
    ];
    expect(issues('TRANSFER', values({ lines }))).toEqual({ 'lines.2.productId': 'Already on line 1; change that line instead' });
  });

  it.each([
    ['p-unit', '1.5', 'Units are whole numbers'],
    ['p-unit', '3', undefined],
    ['p-kg', '1.250', undefined],
    ['p-kg', '1.2345', 'Use a number with at most 3 decimals'],
    ['p-kg', '12.', 'Use a number with at most 3 decimals'],
    ['p-unit', '2.000', undefined],
  ])('%s with %s → %s', (productId, quantity, message) => {
    expect(issues('RECEIPT', values({ lines: [{ key: 'k', productId, quantity }] }))['lines.0.quantity']).toBe(message);
  });

  it('rejects 0 for a move but accepts a counted 0 for an adjustment', () => {
    const zero = values({ lines: [{ key: 'k', productId: 'p-unit', quantity: '0' }] });
    expect(issues('RECEIPT', zero)['lines.0.quantity']).toBe('Quantity must be more than 0');
    expect(issues('ADJUSTMENT', zero)).toEqual({});
  });

  it('asks for a product and a quantity on every line', () => {
    expect(issues('RECEIPT', values({ lines: [{ key: 'k', productId: '', quantity: '' }] }))).toEqual({
      'lines.0.productId': 'Choose a product',
      'lines.0.quantity': 'Enter a quantity',
    });
    expect(issues('ADJUSTMENT', values({ lines: [{ key: 'k', productId: 'p-kg', quantity: '' }] }))['lines.0.quantity']).toBe('Enter the counted quantity');
  });
});

describe('request bodies', () => {
  it('sends quantity for moves and countedQuantity for adjustments, and null for empty optionals', () => {
    const v = values({ scheduledDate: '2026-09-30', notes: '  ' });
    expect(toCreateBody('RECEIPT', v)).toEqual({
      type: 'RECEIPT',
      sourceLocationId: 'loc-a',
      destLocationId: 'loc-b',
      partnerId: null,
      responsibleId: null,
      scheduledDate: '2026-09-30',
      notes: null,
      lines: [{ productId: 'p-kg', quantity: '1.250' }],
    });
    expect(toUpdateBody('ADJUSTMENT', v, 4)).toMatchObject({ lines: [{ productId: 'p-kg', countedQuantity: '1.250' }], version: 4 });
    expect(toUpdateBody('ADJUSTMENT', v, 4)).not.toHaveProperty('type');
  });

  it('starts virtual ends on their fixed system location', () => {
    expect(emptyValues('RECEIPT')).toMatchObject({ sourceLocationId: SYSTEM_LOCATION_IDS.VENDOR, destLocationId: '' });
    expect(emptyValues('DELIVERY')).toMatchObject({ sourceLocationId: '', destLocationId: SYSTEM_LOCATION_IDS.CUSTOMER });
    expect(emptyValues('ADJUSTMENT')).toMatchObject({ sourceLocationId: SYSTEM_LOCATION_IDS.ADJUSTMENT });
    expect(emptyValues('TRANSFER')).toMatchObject({ sourceLocationId: '', destLocationId: '' });
  });

  it('maps server line paths onto the form field', () => {
    expect(formPath('lines.3.countedQuantity')).toBe('lines.3.quantity');
    expect(formPath('partnerId')).toBe('partnerId');
  });
});

describe('trimQuantity', () => {
  it.each([
    ['4.000', '4'],
    ['12.500', '12.5'],
    ['0.000', '0'],
    ['10', '10'],
    ['100.250', '100.25'],
  ])('%s → %s', (input, output) => expect(trimQuantity(input)).toBe(output));
});
