import type { ListResponse, OperationDto, OperationListQuery } from '@stocksense/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { startOfBusinessDay } from '../lib/time';
import { getOperation } from './dto';

const OPEN: Prisma.OperationWhereInput = { status: { notIn: ['DONE', 'CANCELED'] } };

/** Filters for GET /operations; the dashboard's operations panel reuses them. */
export function operationWhere(q: Omit<OperationListQuery, 'sort' | 'page' | 'pageSize'>): Prisma.OperationWhereInput {
  const and: Prisma.OperationWhereInput[] = [];
  if (q.locationId) and.push({ OR: [{ sourceLocationId: q.locationId }, { destLocationId: q.locationId }] });
  if (q.categoryId) and.push({ lines: { some: { product: { categoryId: q.categoryId } } } });
  if (q.search) {
    and.push({
      OR: [
        { reference: { contains: q.search, mode: 'insensitive' } },
        { partner: { name: { contains: q.search, mode: 'insensitive' } } },
      ],
    });
  }
  if (q.dateFrom || q.dateTo) and.push({ scheduledDate: { gte: q.dateFrom, lte: q.dateTo } });
  if (q.late !== undefined) {
    const late: Prisma.OperationWhereInput = { AND: [OPEN, { scheduledDate: { lt: startOfBusinessDay() } }] };
    and.push(q.late ? late : { NOT: late });
  }
  return {
    type: q.type ? { in: q.type } : undefined,
    status: q.status ? { in: q.status } : undefined,
    warehouseId: q.warehouseId,
    AND: and,
  };
}

export async function listOperations(q: OperationListQuery): Promise<ListResponse<OperationDto>> {
  const where = operationWhere(q);
  const desc = q.sort.startsWith('-');
  const field = q.sort.replace(/^-/, '') as 'createdAt' | 'scheduledDate' | 'reference';
  const dir = desc ? 'desc' : 'asc';
  const orderBy: Prisma.OperationOrderByWithRelationInput[] = [
    field === 'scheduledDate' ? { scheduledDate: { sort: dir, nulls: 'last' } } : { [field]: dir },
    { reference: dir },
  ];

  const [total, rows] = await Promise.all([
    prisma.operation.count({ where }),
    prisma.operation.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true } }),
  ]);
  // Full documents, so list rows can show the red short-line marker too. At most 100 per page.
  const data = await Promise.all(rows.map((r) => getOperation(r.id)));
  return { data, page: { page: q.page, pageSize: q.pageSize, total } };
}
