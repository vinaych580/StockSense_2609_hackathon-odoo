/** Read-only views of stock: balances with free-to-use and forecast, and the move ledger. */
import type { ListResponse, LocationType, MoveDto, MoveListQuery, OperationType, StockListQuery, StockRowDto, Uom } from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { filterEnd, filterStart } from '../lib/time';

const q3 = (d: Prisma.Decimal | string | number) => new Prisma.Decimal(d).toFixed(3);
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const and = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty);

interface StockRow {
  product_id: string; sku: string; product_name: string; uom: Uom; is_active: boolean;
  category_id: string | null; category_name: string | null;
  location_id: string; label: string; warehouse_id: string;
  on_hand: Prisma.Decimal; outgoing: Prisma.Decimal; incoming: Prisma.Decimal;
}

export async function listStock(q: StockListQuery): Promise<ListResponse<StockRowDto>> {
  const filters: Prisma.Sql[] = [];
  if (q.productId) filters.push(Prisma.sql`p.id = ${q.productId}::uuid`);
  if (q.warehouseId) filters.push(Prisma.sql`l.warehouse_id = ${q.warehouseId}::uuid`);
  if (q.locationId) filters.push(Prisma.sql`l.id = ${q.locationId}::uuid`);
  if (q.categoryId) filters.push(Prisma.sql`p.category_id = ${q.categoryId}::uuid`);
  if (q.search) filters.push(Prisma.sql`(p.sku ILIKE ${like(q.search)} OR p.name ILIKE ${like(q.search)})`);
  if (!q.includeZero) filters.push(Prisma.sql`(COALESCE(sq.quantity, 0) <> 0 OR COALESCE(o.q, 0) <> 0 OR COALESCE(i.q, 0) <> 0)`);

  // Waiting or Ready documents only: a Draft is a plan, not a promise.
  const ctes = Prisma.sql`
    WITH open_lines AS (
      SELECT op.type, op.source_location_id AS src, op.dest_location_id AS dst, ol.product_id, ol.quantity
      FROM operation_line ol JOIN operation op ON op.id = ol.operation_id
      WHERE op.status IN ('WAITING', 'READY') AND ol.quantity IS NOT NULL
    ), o AS (
      SELECT product_id, src AS location_id, SUM(quantity) AS q FROM open_lines
      WHERE type IN ('DELIVERY', 'TRANSFER') GROUP BY 1, 2
    ), i AS (
      SELECT product_id, dst AS location_id, SUM(quantity) AS q FROM open_lines
      WHERE type IN ('RECEIPT', 'TRANSFER') GROUP BY 1, 2
    ), k AS (
      SELECT product_id, location_id FROM stock_quant
      UNION SELECT product_id, location_id FROM o
      UNION SELECT product_id, location_id FROM i
    )`;
  const rest = Prisma.sql`
    FROM k
    JOIN product p ON p.id = k.product_id
    JOIN location l ON l.id = k.location_id AND l.type = 'INTERNAL'
    JOIN warehouse w ON w.id = l.warehouse_id
    LEFT JOIN category c ON c.id = p.category_id
    LEFT JOIN stock_quant sq ON sq.product_id = k.product_id AND sq.location_id = k.location_id
    LEFT JOIN o ON o.product_id = k.product_id AND o.location_id = k.location_id
    LEFT JOIN i ON i.product_id = k.product_id AND i.location_id = k.location_id
    WHERE TRUE ${and(filters)}`;

  const [countRow] = await prisma.$queryRaw<Array<{ total: number }>>`${ctes} SELECT COUNT(*)::int AS total ${rest}`;
  const rows = await prisma.$queryRaw<StockRow[]>`
    ${ctes}
    SELECT p.id::text AS product_id, p.sku, p.name AS product_name, p.uom::text AS uom, p.is_active,
           c.id::text AS category_id, c.name AS category_name,
           l.id::text AS location_id, w.code || '/' || l.name AS label, l.warehouse_id::text AS warehouse_id,
           COALESCE(sq.quantity, 0) AS on_hand, COALESCE(o.q, 0) AS outgoing, COALESCE(i.q, 0) AS incoming
    ${rest}
    ORDER BY p.sku, w.code, l.name
    LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;

  const data = rows.map((r): StockRowDto => {
    const onHand = new Prisma.Decimal(r.on_hand);
    const free = onHand.minus(r.outgoing);
    return {
      product: {
        id: r.product_id, sku: r.sku, name: r.product_name, uom: r.uom, isActive: r.is_active,
        category: r.category_id ? { id: r.category_id, name: r.category_name! } : null,
      },
      location: { id: r.location_id, label: r.label, warehouseId: r.warehouse_id },
      onHand: q3(onHand),
      outgoing: q3(r.outgoing),
      incoming: q3(r.incoming),
      freeToUse: q3(free),
      forecast: q3(free.plus(r.incoming)),
    };
  });
  return { data, page: { page: q.page, pageSize: q.pageSize, total: countRow?.total ?? 0 } };
}

interface MoveRow {
  id: string; done_at: Date; quantity: Prisma.Decimal;
  operation_id: string; reference: string; operation_type: OperationType;
  product_id: string; sku: string; product_name: string; uom: Uom;
  from_id: string; from_label: string; from_type: LocationType;
  to_id: string; to_label: string; to_type: LocationType;
  user_id: string; user_name: string;
}

export async function listMoves(q: MoveListQuery): Promise<ListResponse<MoveDto>> {
  const filters: Prisma.Sql[] = [];
  if (q.productId) filters.push(Prisma.sql`m.product_id = ${q.productId}::uuid`);
  if (q.locationId) filters.push(Prisma.sql`(m.from_location_id = ${q.locationId}::uuid OR m.to_location_id = ${q.locationId}::uuid)`);
  if (q.warehouseId) filters.push(Prisma.sql`(fl.warehouse_id = ${q.warehouseId}::uuid OR tl.warehouse_id = ${q.warehouseId}::uuid)`);
  if (q.type) filters.push(Prisma.sql`o.type::text IN (${Prisma.join(q.type)})`);
  if (q.dateFrom) filters.push(Prisma.sql`m.done_at >= ${filterStart(q.dateFrom)}`);
  if (q.dateTo) filters.push(Prisma.sql`m.done_at < ${filterEnd(q.dateTo)}`);
  if (q.search) {
    const s = like(q.search);
    filters.push(Prisma.sql`(o.reference ILIKE ${s} OR p.sku ILIKE ${s} OR p.name ILIKE ${s})`);
  }
  const from = Prisma.sql`
    FROM stock_move m
    JOIN operation o ON o.id = m.operation_id
    JOIN product p ON p.id = m.product_id
    JOIN location fl ON fl.id = m.from_location_id LEFT JOIN warehouse fw ON fw.id = fl.warehouse_id
    JOIN location tl ON tl.id = m.to_location_id LEFT JOIN warehouse tw ON tw.id = tl.warehouse_id
    JOIN "user" u ON u.id = m.done_by
    WHERE TRUE ${and(filters)}`;

  const [countRow] = await prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total ${from}`;
  const rows = await prisma.$queryRaw<MoveRow[]>`
    SELECT m.id::text, m.done_at, m.quantity, o.id::text AS operation_id, o.reference, o.type::text AS operation_type,
           p.id::text AS product_id, p.sku, p.name AS product_name, p.uom::text AS uom,
           fl.id::text AS from_id, CASE WHEN fw.code IS NULL THEN fl.name ELSE fw.code || '/' || fl.name END AS from_label, fl.type::text AS from_type,
           tl.id::text AS to_id, CASE WHEN tw.code IS NULL THEN tl.name ELSE tw.code || '/' || tl.name END AS to_label, tl.type::text AS to_type,
           u.id::text AS user_id, u.name AS user_name
    ${from}
    ORDER BY m.done_at DESC, m.id DESC
    LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;

  const data = rows.map((r): MoveDto => ({
    id: r.id,
    doneAt: r.done_at.toISOString(),
    operationId: r.operation_id,
    reference: r.reference,
    operationType: r.operation_type,
    product: { id: r.product_id, sku: r.sku, name: r.product_name, uom: r.uom },
    from: { id: r.from_id, label: r.from_label, type: r.from_type },
    to: { id: r.to_id, label: r.to_label, type: r.to_type },
    quantity: q3(r.quantity),
    direction: r.from_type === 'INTERNAL' ? (r.to_type === 'INTERNAL' ? 'INTERNAL' : 'OUT') : 'IN',
    doneBy: { id: r.user_id, name: r.user_name },
  }));
  return { data, page: { page: q.page, pageSize: q.pageSize, total: countRow?.total ?? 0 } };
}
