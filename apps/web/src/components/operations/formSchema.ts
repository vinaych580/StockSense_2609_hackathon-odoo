import {
  fitsUom,
  LOCATION_RULES,
  type OperationCreateInput,
  type OperationDto,
  type OperationType,
  type OperationUpdateInput,
  QUANTITY_PATTERN,
  SYSTEM_LOCATION_IDS,
  type Uom,
  UOM_DECIMALS,
} from '@stocksense/shared';
import { z } from 'zod';

import { toDateInput } from '@/lib/format';
import type { ProductOption } from '@/lib/masterDataStub';

/**
 * The form keeps one `quantity` per line for every type; toRequestBody sends it as `countedQuantity`
 * for adjustments. `key` is a stable id for React, never sent.
 */
export interface OperationFormValues {
  sourceLocationId: string;
  destLocationId: string;
  partnerId: string;
  responsibleId: string;
  /** YYYY-MM-DD, as the date input gives it. */
  scheduledDate: string;
  notes: string;
  lines: { key: string; productId: string; quantity: string }[];
}

const UOM_WORD: Record<Uom, string> = { UNIT: 'Units', BOX: 'Boxes', KG: 'Kilograms', L: 'Litres', M: 'Metres' };

export function uomRuleMessage(uom: Uom) {
  return UOM_DECIMALS[uom] === 0 ? `${UOM_WORD[uom]} are whole numbers` : `${UOM_WORD[uom]} take up to ${UOM_DECIMALS[uom]} decimals`;
}

/** A virtual end (Vendors, Customers, Inventory adjustment) is one fixed location; an internal end is a choice. */
export function fixedLocationId(type: OperationType, end: 'source' | 'dest'): string | undefined {
  const locationType = LOCATION_RULES[type][end];
  return locationType === 'INTERNAL' ? undefined : SYSTEM_LOCATION_IDS[locationType];
}

let nextKey = 0;
export const newLineKey = () => `line-${++nextKey}`;

/** Mirrors the server's rules for fast feedback; the server still has the last word. */
export function operationFormSchema(type: OperationType, products: ProductOption[]) {
  const uomOf = new Map(products.map((p) => [p.id, p.uom]));
  const counted = type === 'ADJUSTMENT';

  return z
    .object({
      sourceLocationId: z.string().min(1, 'Choose the source location'),
      destLocationId: z.string().min(1, 'Choose the destination location'),
      partnerId: z.string(),
      responsibleId: z.string(),
      scheduledDate: z.string(),
      notes: z.string().max(2000, 'Keep notes under 2,000 characters'),
      lines: z
        .array(z.object({ key: z.string(), productId: z.string().min(1, 'Choose a product'), quantity: z.string().trim() }))
        .max(200, 'A document takes at most 200 lines'),
    })
    .superRefine((v, ctx) => {
      if (v.sourceLocationId && v.sourceLocationId === v.destLocationId) {
        ctx.addIssue({ code: 'custom', path: ['destLocationId'], message: 'Source and destination must differ' });
      }
      const seen = new Map<string, number>();
      v.lines.forEach((line, i) => {
        if (line.productId) {
          const first = seen.get(line.productId);
          if (first !== undefined) {
            ctx.addIssue({ code: 'custom', path: ['lines', i, 'productId'], message: `Already on line ${first + 1}; change that line instead` });
          } else {
            seen.set(line.productId, i);
          }
        }

        const q = line.quantity;
        const path = ['lines', i, 'quantity'];
        if (q === '') {
          ctx.addIssue({ code: 'custom', path, message: counted ? 'Enter the counted quantity' : 'Enter a quantity' });
        } else if (!QUANTITY_PATTERN.test(q)) {
          ctx.addIssue({ code: 'custom', path, message: 'Use a number with at most 3 decimals' });
        } else if (!counted && Number(q) <= 0) {
          ctx.addIssue({ code: 'custom', path, message: 'Quantity must be more than 0' });
        } else {
          const uom = uomOf.get(line.productId);
          if (uom && !fitsUom(q, uom)) ctx.addIssue({ code: 'custom', path, message: uomRuleMessage(uom) });
        }
      });
    });
}

function header(values: OperationFormValues) {
  return {
    sourceLocationId: values.sourceLocationId,
    destLocationId: values.destLocationId,
    partnerId: values.partnerId || null,
    responsibleId: values.responsibleId || null,
    scheduledDate: values.scheduledDate || null,
    notes: values.notes.trim() || null,
  };
}

function lines(type: OperationType, values: OperationFormValues) {
  return values.lines.map(({ productId, quantity }) =>
    type === 'ADJUSTMENT' ? { productId, countedQuantity: quantity.trim() } : { productId, quantity: quantity.trim() },
  );
}

type Body<T> = Omit<T, 'scheduledDate'> & { scheduledDate: string | null };

export function toCreateBody(type: OperationType, values: OperationFormValues): Body<OperationCreateInput> {
  return { type, ...header(values), lines: lines(type, values) };
}

export function toUpdateBody(type: OperationType, values: OperationFormValues, version: number): Body<OperationUpdateInput> {
  return { ...header(values), lines: lines(type, values), version };
}

export function emptyValues(type: OperationType): OperationFormValues {
  return {
    sourceLocationId: fixedLocationId(type, 'source') ?? '',
    destLocationId: fixedLocationId(type, 'dest') ?? '',
    partnerId: '',
    responsibleId: '',
    scheduledDate: '',
    notes: '',
    lines: [{ key: newLineKey(), productId: '', quantity: '' }],
  };
}

/**
 * The API returns numeric(14,3) padded ("4.000"). Drop zeros that carry no value ("4", "12.5") so a
 * whole-unit quantity can be edited one keystroke at a time within its unit's precision.
 */
export function trimQuantity(value: string) {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

export function fromOperation(op: OperationDto): OperationFormValues {
  return {
    sourceLocationId: op.source.id,
    destLocationId: op.dest.id,
    partnerId: op.partner?.id ?? '',
    responsibleId: op.responsible?.id ?? '',
    scheduledDate: op.scheduledDate ? toDateInput(op.scheduledDate) : '',
    notes: op.notes ?? '',
    lines: op.lines.map((l) => ({ key: l.id, productId: l.productId, quantity: trimQuantity(l.quantity ?? l.countedQuantity ?? '') })),
  };
}

/** Server paths use the API field names; the form has one `quantity` per line. */
export function formPath(serverPath: string) {
  return serverPath.replace(/\.countedQuantity$/, '.quantity');
}
