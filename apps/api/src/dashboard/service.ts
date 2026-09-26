/**
 * GET /dashboard: the brief's five KPIs (with the mockup's late / waiting sub-counts) and the
 * low- and out-of-stock list. Stock numbers come from stockHealth(), so they always agree with
 * GET /products?stockStatus= and the sidebar badge.
 *
 * Document counts: open means Draft, Waiting or Ready (receipts never wait). Late means scheduled
 * before today in APP_TIMEZONE. The warehouse filter matches a document by its warehouse or
 * either end's warehouse (so a WH1 → WH2 transfer shows under both); the location filter matches
 * either end, and leaves stock figures to the warehouse filter; the category filter matches
 * documents with at least one line in that category.
 */
import type { DashboardDto, DashboardQuery, StockAlertDto } from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { startOfBusinessDay } from '../lib/time';
import { stockHealth } from '../inventory/health';

interface CountRow {
  receipts: number;
  receipts_late: number;
  deliveries: number;
  deliveries_late: number;
  deliveries_waiting: number;
  transfers: number;
  transfers_late: number;
}

export async function getDashboard(q: DashboardQuery): Promise<DashboardDto> {
  const today = startOfBusinessDay();
  const filters: Prisma.Sql[] = [Prisma.sql`o.status IN ('DRAFT', 'WAITING', 'READY')`];
  if (q.warehouseId) {
    filters.push(Prisma.sql`(o.warehouse_id = ${q.warehouseId}::uuid OR EXISTS (
      SELECT 1 FROM location l WHERE l.id IN (o.source_location_id, o.dest_location_id) AND l.warehouse_id = ${q.warehouseId}::uuid))`);
  }
  if (q.locationId) {
    filters.push(Prisma.sql`${q.locationId}::uuid IN (o.source_location_id, o.dest_location_id)`);
  }
  if (q.categoryId) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM operation_line ol JOIN product p ON p.id = ol.product_id
      WHERE ol.operation_id = o.id AND p.category_id = ${q.categoryId}::uuid)`);
  }

  const [health, [counts]] = await Promise.all([
    stockHealth({ warehouseId: q.warehouseId, categoryId: q.categoryId }),
    prisma.$queryRaw<CountRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE o.type = 'RECEIPT')::int AS receipts,
        COUNT(*) FILTER (WHERE o.type = 'RECEIPT' AND o.scheduled_date < ${today})::int AS receipts_late,
        COUNT(*) FILTER (WHERE o.type = 'DELIVERY')::int AS deliveries,
        COUNT(*) FILTER (WHERE o.type = 'DELIVERY' AND o.scheduled_date < ${today})::int AS deliveries_late,
        COUNT(*) FILTER (WHERE o.type = 'DELIVERY' AND o.status = 'WAITING')::int AS deliveries_waiting,
        COUNT(*) FILTER (WHERE o.type = 'TRANSFER')::int AS transfers,
        COUNT(*) FILTER (WHERE o.type = 'TRANSFER' AND o.scheduled_date < ${today})::int AS transfers_late
      FROM operation o
      WHERE ${Prisma.join(filters, ' AND ')}`,
  ]);

  const alerts: StockAlertDto[] = health
    .filter((h) => h.status !== 'ok')
    .sort((a, b) => (a.status === b.status ? a.sku.localeCompare(b.sku) : a.status === 'low' ? -1 : 1))
    .map((h) => ({
      productId: h.productId,
      sku: h.sku,
      name: h.name,
      uom: h.uom,
      category: h.categoryId ? { id: h.categoryId, name: h.categoryName! } : null,
      status: h.status as 'low' | 'out',
      onHand: h.onHand.toFixed(3),
      rules: h.lowRules,
    }));

  const c = counts!;
  return {
    filters: { warehouseId: q.warehouseId ?? null, locationId: q.locationId ?? null, categoryId: q.categoryId ?? null },
    kpis: {
      productsInStock: health.filter((h) => h.status !== 'out').length,
      lowStock: health.filter((h) => h.status === 'low').length,
      outOfStock: health.filter((h) => h.status === 'out').length,
      pendingReceipts: { total: c.receipts, late: c.receipts_late },
      pendingDeliveries: { total: c.deliveries, late: c.deliveries_late, waiting: c.deliveries_waiting },
      scheduledTransfers: { total: c.transfers, late: c.transfers_late },
    },
    alerts,
    generatedAt: new Date().toISOString(),
  };
}
