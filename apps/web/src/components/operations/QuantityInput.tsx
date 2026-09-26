import { type Uom, UOM_DECIMALS } from '@stocksense/shared';
import type * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Can `text` still become a valid quantity for this unit? Blocks letters, a second dot, and extra decimals. */
export function acceptsQuantityText(text: string, uom: Uom | undefined) {
  const decimals = uom ? UOM_DECIMALS[uom] : 3;
  if (decimals === 0) return /^\d{0,11}$/.test(text);
  return new RegExp(`^\\d{0,11}(\\.\\d{0,${decimals}})?$`).test(text);
}

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  /** Without a product yet, up to 3 decimals are allowed. */
  uom?: Uom;
};

/** A quantity as a decimal string ("12.500"), never a number, limited to the unit's precision. */
export function QuantityInput({ value, onChange, uom, className, ...props }: Props) {
  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode={uom && UOM_DECIMALS[uom] === 0 ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          if (acceptsQuantityText(e.target.value, uom)) onChange(e.target.value);
        }}
        className={cn('pr-14 text-right font-mono tabular-nums', className)}
      />
      {uom && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
          {uom}
        </span>
      )}
    </div>
  );
}
