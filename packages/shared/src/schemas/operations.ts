import { z } from 'zod';
import { OPERATION_STATUSES, OPERATION_TYPES, type OperationType } from '../enums';
import { QUANTITY_PATTERN } from '../quantity';

const id = z.uuid();

/** A non-negative decimal string within numeric(14,3). */
export const quantityString = z
  .string()
  .trim()
  .regex(QUANTITY_PATTERN, 'Use a number with at most 3 decimals, up to 99,999,999,999.999');

const positiveQuantity = quantityString.refine((v) => Number(v) > 0, 'Quantity must be more than 0');

export const operationLineInput = z.object({
  productId: id,
  /** Receipts, deliveries and transfers: the quantity to move. */
  quantity: positiveQuantity.optional(),
  /** Adjustments: the counted quantity (0 is a valid count). */
  countedQuantity: quantityString.optional(),
});
export type OperationLineInput = z.infer<typeof operationLineInput>;

const headerFields = {
  sourceLocationId: id,
  destLocationId: id,
  partnerId: id.nullish(),
  responsibleId: id.nullish(),
  scheduledDate: z.coerce.date().nullish(),
  notes: z.string().trim().max(2000).nullish(),
};

const lines = z
  .array(operationLineInput)
  .max(200)
  .refine(
    (ls) => new Set(ls.map((l) => l.productId)).size === ls.length,
    'The same product appears on two lines; merge them',
  );

/** Which quantity field a line needs is decided by the document type. */
export function checkLinesForType(
  type: OperationType,
  ls: OperationLineInput[],
  ctx: z.RefinementCtx,
): void {
  ls.forEach((l, i) => {
    if (type === 'ADJUSTMENT') {
      if (l.countedQuantity === undefined)
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'countedQuantity'], message: 'Enter the counted quantity' });
      if (l.quantity !== undefined)
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: 'Adjustments take a counted quantity, not a quantity' });
    } else {
      if (l.quantity === undefined)
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: 'Enter a quantity' });
      if (l.countedQuantity !== undefined)
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'countedQuantity'], message: 'Only adjustments take a counted quantity' });
    }
  });
}

export const operationCreateInput = z
  .object({ type: z.enum(OPERATION_TYPES), ...headerFields, lines })
  .superRefine((v, ctx) => {
    if (v.sourceLocationId === v.destLocationId)
      ctx.addIssue({ code: 'custom', path: ['destLocationId'], message: 'Source and destination must differ' });
    checkLinesForType(v.type, v.lines, ctx);
  });
export type OperationCreateInput = z.infer<typeof operationCreateInput>;

/** PATCH on a Draft: the full header and line list, plus the version last seen. The type can't change. */
export const operationUpdateInput = z
  .object({ ...headerFields, lines, version: z.int().nonnegative() })
  .superRefine((v, ctx) => {
    if (v.sourceLocationId === v.destLocationId)
      ctx.addIssue({ code: 'custom', path: ['destLocationId'], message: 'Source and destination must differ' });
  });
export type OperationUpdateInput = z.infer<typeof operationUpdateInput>;

export const operationActionInput = z.object({
  version: z.int().nonnegative(),
  /** Adjustments only: post counted − current even though the balance moved since counting. */
  acknowledgeBalanceChange: z.boolean().optional(),
});
export type OperationActionInput = z.infer<typeof operationActionInput>;

/** ?page=&pageSize= on every list. Page size is at most 100. */
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

/** A query value given as "A,B" or repeated (?x=A&x=B), checked against allowed values. */
export function csvOf<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v.join(',') : v).split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));
}

/** ?flag=true / ?flag=false. */
export const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * A date filter, kept as the string given: a calendar day (2026-09-26), which the API reads as
 * that whole day in APP_TIMEZONE, or an ISO instant with Z or an offset, which it reads exactly.
 */
export const dateFilter = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** A query-string object where an empty value (?status=, as forms send it) means "no filter". */
export function queryObject<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess(
    (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')) : v),
    z.object(shape),
  );
}

export const OPERATION_SORTS = ['-createdAt', 'createdAt', '-scheduledDate', 'scheduledDate', '-reference', 'reference'] as const;
export type OperationSort = (typeof OPERATION_SORTS)[number];

/**
 * GET /operations filters. `warehouseId` matches the document's warehouse or either end's (as the
 * dashboard counts it); `locationId` matches either end; `search` matches the reference or the contact's name.
 */
export const operationListQuery = queryObject({
  type: csvOf(OPERATION_TYPES).optional(),
  status: csvOf(OPERATION_STATUSES).optional(),
  warehouseId: id.optional(),
  locationId: id.optional(),
  categoryId: id.optional(),
  search: z.string().trim().max(100).optional(),
  /** Scheduled date range, inclusive at both ends. */
  dateFrom: dateFilter.optional(),
  dateTo: dateFilter.optional(),
  late: queryBool.optional(),
  sort: z.enum(OPERATION_SORTS).default('-createdAt'),
  ...pageQuery,
});
export type OperationListQuery = z.infer<typeof operationListQuery>;
