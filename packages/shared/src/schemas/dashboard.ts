import { z } from 'zod';
import { ROLES } from '../enums';
import { pageQuery, queryBool, queryObject } from './operations';

const id = z.uuid();

/**
 * GET /dashboard: the warehouse filter scopes on-hand quantities; the location filter narrows
 * documents to those touching it at either end; the category filter narrows products and documents.
 */
export const dashboardQuery = queryObject({
  warehouseId: id.optional(),
  locationId: id.optional(),
  categoryId: id.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export const STOCK_STATUSES = ['ok', 'low', 'out'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

// ─── Users (Settings → Users) ──────────────────────────────────────────────────────────────

export const userListQuery = queryObject({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  isActive: queryBool.optional(),
  ...pageQuery,
});
export type UserListQuery = z.infer<typeof userListQuery>;

export const userUpdateInput = z
  .object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, 'Send role, isActive or both');
export type UserUpdateInput = z.infer<typeof userUpdateInput>;
