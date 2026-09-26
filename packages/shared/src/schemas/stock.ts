import { z } from 'zod';
import { OPERATION_TYPES } from '../enums';
import { csvOf, pageQuery, queryBool } from './operations';

const id = z.uuid();

/** GET /stock filters. `search` matches SKU or product name. */
export const stockListQuery = z.object({
  productId: id.optional(),
  warehouseId: id.optional(),
  locationId: id.optional(),
  categoryId: id.optional(),
  search: z.string().trim().max(100).optional(),
  /** Also list rows where on hand, incoming and outgoing are all zero. */
  includeZero: queryBool.optional(),
  ...pageQuery,
});
export type StockListQuery = z.infer<typeof stockListQuery>;

/** GET /moves filters. `locationId` and `warehouseId` match either end; `search` matches reference, SKU or name. */
export const moveListQuery = z.object({
  productId: id.optional(),
  locationId: id.optional(),
  warehouseId: id.optional(),
  type: csvOf(OPERATION_TYPES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
  ...pageQuery,
});
export type MoveListQuery = z.infer<typeof moveListQuery>;
