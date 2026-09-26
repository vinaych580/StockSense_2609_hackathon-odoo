import { z } from 'zod';
import { OPERATION_TYPES } from '../enums';
import { csvOf, dateFilter, pageQuery, queryBool, queryObject } from './operations';

const id = z.uuid();

/** GET /stock filters. `search` matches SKU or product name. */
export const stockListQuery = queryObject({
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
export const moveListQuery = queryObject({
  productId: id.optional(),
  locationId: id.optional(),
  warehouseId: id.optional(),
  type: csvOf(OPERATION_TYPES).optional(),
  /** Done date range, inclusive at both ends. */
  dateFrom: dateFilter.optional(),
  dateTo: dateFilter.optional(),
  search: z.string().trim().max(100).optional(),
  ...pageQuery,
});
export type MoveListQuery = z.infer<typeof moveListQuery>;
