import { UOM_DECIMALS, type Uom } from './enums';

/** numeric(14,3): at most 11 integer digits and 3 decimals. Quantities travel as decimal strings. */
export const QUANTITY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;

/** Decimal places that carry value: "12.500" → 1, "12" → 0. */
export function significantDecimals(value: string): number {
  const frac = value.split('.')[1] ?? '';
  return frac.replace(/0+$/, '').length;
}

export function fitsUom(value: string, uom: Uom): boolean {
  return significantDecimals(value) <= UOM_DECIMALS[uom];
}
