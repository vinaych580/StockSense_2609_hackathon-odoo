import { z } from 'zod';
import { PARTNER_KINDS, UOMS, type Uom } from '../enums';
import { csvOf, pageQuery, quantityString, queryObject } from './operations';
import { STOCK_STATUSES } from './dashboard';

const id = z.uuid();
const name = z.string().trim().min(1, 'Enter a name').max(120);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

/** A money amount within numeric(12,2), as a string. */
export const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a number with at most 2 decimals');

export const skuInput = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a SKU')
  .max(40)
  .regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, and . _ / -');

export const codeInput = (max: number) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Enter a code')
    .max(max)
    .regex(/^[A-Z0-9_-]+$/, 'Use letters, digits, _ and -');

/** ?active=true (default) / false / all on master-data lists. */
const activeFilter = z.enum(['true', 'false', 'all']).default('true');

// ─── Products ──────────────────────────────────────────────────────────────────────────────

export const productCreateInput = z.object({
  sku: skuInput,
  name,
  categoryId: id.nullish(),
  uom: z.enum(UOMS as [Uom, ...Uom[]]).default('UNIT'),
  unitCost: moneyString.nullish(),
  /** Posted through an inventory adjustment, so it lands in the ledger like any other stock. */
  initialStock: z
    .array(z.object({ locationId: id, quantity: quantityString }))
    .max(50)
    .refine((ls) => new Set(ls.map((l) => l.locationId)).size === ls.length, 'Each location may appear once')
    .optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateInput>;

export const productUpdateInput = z.object({
  sku: skuInput.optional(),
  name: name.optional(),
  categoryId: id.nullish(),
  uom: z.enum(UOMS as [Uom, ...Uom[]]).optional(),
  unitCost: moneyString.nullish(),
});
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;

export const PRODUCT_SORTS = ['sku', '-sku', 'name', '-name', 'onHand', '-onHand'] as const;

/** GET /products. `warehouseId` scopes on hand and stock status; `stockStatus` uses the dashboard's definitions. */
export const productListQuery = queryObject({
  search: z.string().trim().max(100).optional(),
  categoryId: id.optional(),
  warehouseId: id.optional(),
  stockStatus: csvOf(STOCK_STATUSES).optional(),
  active: activeFilter,
  sort: z.enum(PRODUCT_SORTS).default('sku'),
  ...pageQuery,
});
export type ProductListQuery = z.infer<typeof productListQuery>;

/** POST /products/import: the CSV text in a JSON body (every change is JSON; see csrfGuard). */
export const productImportInput = z.object({
  csv: z.string().min(1, 'The file is empty').max(900_000, 'The file is too large; split it into parts under 900 KB'),
  /** Validate and report what would happen, without writing anything. */
  dryRun: z.boolean().default(false),
  /** Existing SKUs: update them (true) or report them as errors (false). */
  updateExisting: z.boolean().default(true),
});
export type ProductImportInput = z.infer<typeof productImportInput>;

// ─── Categories ────────────────────────────────────────────────────────────────────────────

export const categoryInput = z.object({ name });
export type CategoryInput = z.infer<typeof categoryInput>;

// ─── Warehouses and locations ──────────────────────────────────────────────────────────────

export const warehouseCreateInput = z.object({
  code: codeInput(10),
  name,
  address: optionalText(500),
});
export type WarehouseCreateInput = z.infer<typeof warehouseCreateInput>;

export const warehouseUpdateInput = warehouseCreateInput.partial();
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateInput>;

/** Only internal locations are created through the API; type and warehouse never change afterwards. */
export const locationCreateInput = z.object({ warehouseId: id, code: codeInput(20), name });
export type LocationCreateInput = z.infer<typeof locationCreateInput>;

export const locationUpdateInput = z.object({ code: codeInput(20).optional(), name: name.optional() });
export type LocationUpdateInput = z.infer<typeof locationUpdateInput>;

export const locationListQuery = queryObject({
  warehouseId: id.optional(),
  /** Include the three virtual locations (Vendors, Customers, Inventory adjustment). */
  includeVirtual: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  active: activeFilter,
});
export type LocationListQuery = z.infer<typeof locationListQuery>;

// ─── Contacts ──────────────────────────────────────────────────────────────────────────────

export const partnerCreateInput = z.object({
  name,
  kind: z.enum(PARTNER_KINDS),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email')).nullish(),
  phone: optionalText(40),
  address: optionalText(500),
});
export type PartnerCreateInput = z.infer<typeof partnerCreateInput>;

export const partnerUpdateInput = partnerCreateInput.partial();
export type PartnerUpdateInput = z.infer<typeof partnerUpdateInput>;

export const partnerListQuery = queryObject({
  kind: z.enum(PARTNER_KINDS).optional(),
  search: z.string().trim().max(100).optional(),
  active: activeFilter,
  ...pageQuery,
});
export type PartnerListQuery = z.infer<typeof partnerListQuery>;

// ─── Reorder rules ─────────────────────────────────────────────────────────────────────────

/** PUT /reorder-rules: creates or replaces the rule for this product and warehouse. */
export const reorderRuleInput = z
  .object({ productId: id, warehouseId: id, minQty: quantityString, maxQty: quantityString })
  .refine((v) => Number(v.maxQty) >= Number(v.minQty), { path: ['maxQty'], message: 'The maximum must be at least the minimum' });
export type ReorderRuleInput = z.infer<typeof reorderRuleInput>;

export const listActiveQuery = queryObject({ active: activeFilter });
