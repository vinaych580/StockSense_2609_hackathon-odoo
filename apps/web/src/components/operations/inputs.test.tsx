import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ProductOption } from '@/lib/masterDataStub';

import { LocationSelect } from './LocationSelect';
import { ProductCombobox } from './ProductCombobox';
import { acceptsQuantityText, QuantityInput } from './QuantityInput';

describe('QuantityInput', () => {
  function Harness({ uom, onValue }: { uom?: 'UNIT' | 'KG'; onValue: (v: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <QuantityInput
        aria-label="Quantity"
        uom={uom}
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
    );
  }

  it('keeps whole units whole', async () => {
    const onValue = vi.fn();
    render(<Harness uom="UNIT" onValue={onValue} />);
    await userEvent.setup().type(screen.getByLabelText('Quantity'), '12.5');
    expect(screen.getByLabelText('Quantity')).toHaveValue('125');
    expect(screen.getByText('UNIT')).toBeInTheDocument();
  });

  it('stops kilograms at 3 decimals and emits a string', async () => {
    const onValue = vi.fn();
    render(<Harness uom="KG" onValue={onValue} />);
    await userEvent.setup().type(screen.getByLabelText('Quantity'), '1.23456');
    expect(screen.getByLabelText('Quantity')).toHaveValue('1.234');
    expect(onValue).toHaveBeenLastCalledWith('1.234');
    expect(typeof onValue.mock.lastCall?.[0]).toBe('string');
  });

  it('rejects letters, signs and a second dot', () => {
    expect(acceptsQuantityText('1a', 'KG')).toBe(false);
    expect(acceptsQuantityText('-1', 'KG')).toBe(false);
    expect(acceptsQuantityText('1.2.3', 'KG')).toBe(false);
    expect(acceptsQuantityText('1.', 'KG')).toBe(true);
    expect(acceptsQuantityText('', 'UNIT')).toBe(true);
  });
});

const products: ProductOption[] = [
  { id: 'sr', sku: 'SR-01', name: 'Steel Rods', uom: 'KG', isActive: true },
  { id: 'oc', sku: 'OC-10', name: 'Office Chair', uom: 'UNIT', isActive: true },
  { id: 'dk', sku: 'DK-11', name: 'Desk', uom: 'UNIT', isActive: true },
  { id: 'old', sku: 'XX-99', name: 'Old Stool', uom: 'UNIT', isActive: false },
];

describe('ProductCombobox', () => {
  function Harness({ takenBy, onPick }: { takenBy?: Map<string, number>; onPick?: (id: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <ProductCombobox
        aria-label="Product"
        products={products}
        value={value}
        takenBy={takenBy}
        onChange={(id) => {
          setValue(id);
          onPick?.(id);
        }}
      />
    );
  }

  it('searches by SKU or name and hides archived products', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const box = screen.getByRole('combobox', { name: 'Product' });

    await user.type(box, 'oc-1');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['OC-10Office ChairUNIT']);

    await user.clear(box);
    await user.type(box, 'desk');
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await user.clear(box);
    await user.type(box, 'stool');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No products match "stool".')).toBeInTheDocument();
  });

  it('picks with the keyboard and shows the choice', async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const user = userEvent.setup();
    const box = screen.getByRole('combobox', { name: 'Product' });

    await user.type(box, 'o');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith('oc');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    await user.tab();
    expect(box).toHaveValue('OC-10 · Office Chair');
  });

  it("disables a product that's already on another line", async () => {
    const onPick = vi.fn();
    render(<Harness takenBy={new Map([['sr', 2]])} onPick={onPick} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Product' }));
    const steel = screen.getByRole('option', { name: /Steel Rods/ });
    expect(steel).toHaveAttribute('aria-disabled', 'true');
    expect(steel).toHaveTextContent('On line 2');
    await user.pointer({ keys: '[MouseLeft>]', target: steel });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('skips a taken product when highlighting, so Enter picks the next one', async () => {
    const onPick = vi.fn();
    render(<Harness takenBy={new Map([['sr', 1]])} onPick={onPick} />);
    const user = userEvent.setup();

    // "d" matches Steel Rods (taken, listed first) and Desk.
    await user.type(screen.getByRole('combobox', { name: 'Product' }), 'd');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['SR-01Steel RodsOn line 1', 'DK-11DeskUNIT']);
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('dk');
  });
});

describe('LocationSelect', () => {
  const noop = () => {};

  it.each([
    ['RECEIPT', 'source', 'Vendors'],
    ['DELIVERY', 'dest', 'Customers'],
    ['ADJUSTMENT', 'source', 'Inventory adjustment'],
  ] as const)('%s %s is fixed to %s', (type, end, label) => {
    render(<LocationSelect aria-label="Loc" type={type} end={end} value="" onChange={noop} />);
    expect(screen.getByRole('textbox', { name: 'Loc' })).toHaveTextContent(label);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('offers internal locations grouped by warehouse for a transfer', () => {
    render(<LocationSelect aria-label="Loc" type="TRANSFER" end="source" value="" onChange={noop} />);
    const select = screen.getByRole('combobox', { name: 'Loc' });
    expect(select.querySelectorAll('optgroup')).toHaveLength(2);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a location',
      'WH1/Stock',
      'WH1/Rack A',
      'WH1/Rack B',
      'WH1/Production Floor',
      'WH2/Stock',
      'WH2/Cold Room',
    ]);
  });
});
