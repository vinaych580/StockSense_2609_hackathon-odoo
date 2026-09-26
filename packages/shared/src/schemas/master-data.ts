import { z } from 'zod';
import { LOCATION_TYPES, PARTNER_KINDS, ROLES, UOMS } from '../enums';
import { emailInput } from './auth';
import { csvOf, pageQuery, quantityString, queryBool, queryObject } from './operations';

const id = z.uuid();
const uom = z.enum(UOMS as [string, ...string[]]);
const role = z.enum(ROLES);
const partnerKind = z.enum(PARTNER_KINDS);

/* ---------------------------------------------------------------------- */
/* Categories                                                              */
/* ---------------------------------------------------------------------- */

export const categoryCreateInput = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters'),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateInput>;

export const categoryUpdateInput = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters').optional(),
  isActive: z.boolean().optional(),
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInput>;

export const CATEGORY_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type CategorySort = (typeof CATEGORY_SORTS)[number];

/** GET /categories filters. `search` matches the name. */
export const categoryListQuery = queryObject({
  search: z.string().trim().max(100).optional(),
  isActive: queryBool.optional(),
  sort: z.enum(CATEGORY_SORTS).default('name'),
  ...pageQuery,
});
export type CategoryListQuery = z.infer<typeof categoryListQuery>;

/* ---------------------------------------------------------------------- */
/* Warehouses                                                              */
/* ---------------------------------------------------------------------- */

const warehouseCode = z.string().trim().min(1, 'Enter a code').max(10, 'Use at most 10 characters');
const warehouseName = z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters');
const warehouseAddress = z.string().trim().max(500, 'Use at most 500 characters');

export const warehouseCreateInput = z.object({
  code: warehouseCode,
  name: warehouseName,
  address: warehouseAddress.nullish(),
});
export type WarehouseCreateInput = z.infer<typeof warehouseCreateInput>;

export const warehouseUpdateInput = z.object({
  code: warehouseCode.optional(),
  name: warehouseName.optional(),
  address: warehouseAddress.nullish(),
  isActive: z.boolean().optional(),
});
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateInput>;

export const WAREHOUSE_SORTS = ['name', '-name', 'code', '-code', 'createdAt', '-createdAt'] as const;
export type WarehouseSort = (typeof WAREHOUSE_SORTS)[number];

/** GET /warehouses filters. `search` matches the code or name. */
export const warehouseListQuery = queryObject({
  search: z.string().trim().max(100).optional(),
  isActive: queryBool.optional(),
  sort: z.enum(WAREHOUSE_SORTS).default('name'),
  ...pageQuery,
});
export type WarehouseListQuery = z.infer<typeof warehouseListQuery>;

/* ---------------------------------------------------------------------- */
/* Locations                                                               */
/* ---------------------------------------------------------------------- */

const locationCode = z.string().trim().min(1, 'Enter a code').max(20, 'Use at most 20 characters');
const locationName = z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters');

/**
 * Locations are created inside a warehouse. The three virtual locations (Vendor, Customer,
 * Adjustment) are system-seeded with fixed ids (see SYSTEM_LOCATION_IDS) and are not created
 * through this contract, so `type` isn't user-supplied here — the API defaults it to INTERNAL.
 */
export const locationCreateInput = z.object({
  warehouseId: id,
  code: locationCode,
  name: locationName,
});
export type LocationCreateInput = z.infer<typeof locationCreateInput>;

/** warehouseId and type are immutable once a location exists. */
export const locationUpdateInput = z.object({
  code: locationCode.optional(),
  name: locationName.optional(),
  isActive: z.boolean().optional(),
});
export type LocationUpdateInput = z.infer<typeof locationUpdateInput>;

export const LOCATION_SORTS = ['name', '-name', 'code', '-code', 'createdAt', '-createdAt'] as const;
export type LocationSort = (typeof LOCATION_SORTS)[number];

/** GET /locations filters. `search` matches the code or name. */
export const locationListQuery = queryObject({
  warehouseId: id.optional(),
  type: csvOf(LOCATION_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
  isActive: queryBool.optional(),
  sort: z.enum(LOCATION_SORTS).default('name'),
  ...pageQuery,
});
export type LocationListQuery = z.infer<typeof locationListQuery>;

/* ---------------------------------------------------------------------- */
/* Partners                                                                */
/* ---------------------------------------------------------------------- */

const partnerName = z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters');
const partnerPhone = z.string().trim().max(40, 'Use at most 40 characters');
const partnerAddress = z.string().trim().max(500, 'Use at most 500 characters');

export const partnerCreateInput = z.object({
  name: partnerName,
  kind: partnerKind,
  email: emailInput.nullish(),
  phone: partnerPhone.nullish(),
  address: partnerAddress.nullish(),
});
export type PartnerCreateInput = z.infer<typeof partnerCreateInput>;

export const partnerUpdateInput = z.object({
  name: partnerName.optional(),
  kind: partnerKind.optional(),
  email: emailInput.nullish(),
  phone: partnerPhone.nullish(),
  address: partnerAddress.nullish(),
  isActive: z.boolean().optional(),
});
export type PartnerUpdateInput = z.infer<typeof partnerUpdateInput>;

export const PARTNER_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type PartnerSort = (typeof PARTNER_SORTS)[number];

/** GET /partners filters. `search` matches the name. */
export const partnerListQuery = queryObject({
  kind: csvOf(PARTNER_KINDS).optional(),
  search: z.string().trim().max(100).optional(),
  isActive: queryBool.optional(),
  sort: z.enum(PARTNER_SORTS).default('name'),
  ...pageQuery,
});
export type PartnerListQuery = z.infer<typeof partnerListQuery>;

/* ---------------------------------------------------------------------- */
/* Products                                                                */
/* ---------------------------------------------------------------------- */

/** Stored trimmed and upper-case. */
const skuInput = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().min(1, 'Enter a SKU').max(40, 'Use at most 40 characters'));

const productName = z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters');

/** A non-negative decimal string within numeric(12,2), same style as quantityString. */
const UNIT_COST_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const unitCostInput = z
  .string()
  .trim()
  .regex(UNIT_COST_PATTERN, 'Use a number with at most 2 decimals, up to 9,999,999,999.99');

/**
 * Optional initial stock at creation, per the D1 guide: { locationId, quantity }. This is a
 * shared input contract ONLY — quantity reuses quantityString (decimal(14,3), same as stock_quant
 * and stock_move). Actually writing the resulting stock_move/stock_quant rows is out of scope
 * for D1: per the Prisma schema, only src/inventory/posting.ts may write those tables, and D1
 * explicitly excludes implementing API routes/services. Whatever endpoint consumes this field is
 * responsible for routing it through that posting path (e.g. as an implicit RECEIPT/ADJUSTMENT),
 * not for writing stock directly.
 */
const initialStockInput = z.object({
  locationId: id,
  quantity: quantityString,
});

export const productCreateInput = z.object({
  sku: skuInput,
  name: productName,
  categoryId: id.nullish(),
  uom,
  unitCost: unitCostInput.nullish(),
  initialStock: initialStockInput.nullish(),
});
export type ProductCreateInput = z.infer<typeof productCreateInput>;

export const productUpdateInput = z.object({
  sku: skuInput.optional(),
  name: productName.optional(),
  categoryId: id.nullish(),
  uom: uom.optional(),
  unitCost: unitCostInput.nullish(),
  isActive: z.boolean().optional(),
});
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;

export const PRODUCT_SORTS = ['name', '-name', 'sku', '-sku', 'createdAt', '-createdAt'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** GET /products filters. `search` matches SKU or name. */
export const productListQuery = queryObject({
  categoryId: id.optional(),
  uom: csvOf(UOMS as [string, ...string[]]).optional(),
  search: z.string().trim().max(100).optional(),
  isActive: queryBool.optional(),
  sort: z.enum(PRODUCT_SORTS).default('name'),
  ...pageQuery,
});
export type ProductListQuery = z.infer<typeof productListQuery>;

/* ---------------------------------------------------------------------- */
/* Reorder rules                                                           */
/* ---------------------------------------------------------------------- */

/**
 * minQty/maxQty are decimal(14,3) strings, the same precision as stock quantities, so this
 * reuses quantityString from schemas/operations.ts rather than redefining the pattern.
 */
export const reorderRuleInput = z
  .object({
    productId: id,
    warehouseId: id,
    minQty: quantityString,
    maxQty: quantityString,
  })
  .refine((v) => Number(v.minQty) <= Number(v.maxQty), {
    message: 'Minimum must be at most the maximum',
    path: ['maxQty'],
  });
export type ReorderRuleInput = z.infer<typeof reorderRuleInput>;

/** productId and warehouseId identify the rule (see the unique constraint) and don't change on update. */
export const reorderRuleUpdateInput = z
  .object({
    minQty: quantityString,
    maxQty: quantityString,
  })
  .refine((v) => Number(v.minQty) <= Number(v.maxQty), {
    message: 'Minimum must be at most the maximum',
    path: ['maxQty'],
  });
export type ReorderRuleUpdateInput = z.infer<typeof reorderRuleUpdateInput>;

/** GET /reorder-rules filters. */
export const reorderRuleListQuery = queryObject({
  productId: id.optional(),
  warehouseId: id.optional(),
  ...pageQuery,
});
export type ReorderRuleListQuery = z.infer<typeof reorderRuleListQuery>;

/* ---------------------------------------------------------------------- */
/* Admin users                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Role and active status only. Creating a user and changing name/email are intentionally left
 * out of this contract — see the D1 write-up for why.
 */
export const userUpdateInput = z.object({
  role: role.optional(),
  isActive: z.boolean().optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateInput>;

export const USER_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type UserSort = (typeof USER_SORTS)[number];

/** GET /users filters. `search` matches name or email. */
export const userListQuery = queryObject({
  role: csvOf(ROLES).optional(),
  isActive: queryBool.optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(USER_SORTS).default('name'),
  ...pageQuery,
});
export type UserListQuery = z.infer<typeof userListQuery>;
