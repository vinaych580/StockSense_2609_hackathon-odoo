import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import type { ErrorBody } from '@stocksense/shared';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

type PrismaError = Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError;

/** Postgres error code carried by a Prisma error: in meta for raw queries, else in the message. */
function pgCode(err: PrismaError): string | undefined {
  const meta = 'meta' in err ? (err.meta as { code?: string } | undefined) : undefined;
  return meta?.code ?? err.message.match(/\b(23505|23503|23514)\b/)?.[1];
}

/** The CHECK constraint a Prisma error names, from its message or (raw queries) its meta. */
function checkName(err: PrismaError): string | undefined {
  const text = `${err.message} ${'meta' in err ? JSON.stringify(err.meta ?? {}) : ''}`;
  return text.match(/check constraint \\?"(\w+)\\?"/)?.[1];
}

/**
 * The named CHECKs from the migrations that guard a request field. zod normally catches these
 * first; this keeps the answer right if it doesn't. The stock backstop is handled separately, and a
 * CHECK not listed here (stock_move_*, versions) means a bug, so it stays a 500.
 */
const FIELD_CHECKS: Record<string, { code: 'VALIDATION_FAILED' | 'SAME_LOCATION'; path: string; message: string }> = {
  reorder_rule_min_nonneg: { code: 'VALIDATION_FAILED', path: 'minQty', message: "The minimum quantity can't be negative" },
  reorder_rule_max_ge_min: { code: 'VALIDATION_FAILED', path: 'maxQty', message: 'The maximum quantity must be at least the minimum' },
  product_unit_cost_nonneg: { code: 'VALIDATION_FAILED', path: 'unitCost', message: "The unit cost can't be negative" },
  operation_line_quantity_pos: { code: 'VALIDATION_FAILED', path: 'quantity', message: 'Quantity must be more than 0' },
  operation_line_counted_nonneg: { code: 'VALIDATION_FAILED', path: 'countedQuantity', message: "A counted quantity can't be negative" },
  operation_distinct_ends: { code: 'SAME_LOCATION', path: 'destLocationId', message: 'Source and destination must differ' },
  location_warehouse_matches_type: {
    code: 'VALIDATION_FAILED',
    path: 'warehouseId',
    message: 'Internal locations belong to a warehouse; virtual ones have none',
  },
};

/** Converts anything thrown into an AppError, or undefined for a bug. Nothing raw from Prisma leaks out. */
export function toAppError(err: unknown): AppError | undefined {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return new AppError('VALIDATION_FAILED', err.issues[0]?.message ?? 'Invalid request', details);
  }
  const bodyError = err as { type?: string } | null;
  if (bodyError?.type === 'entity.parse.failed') return new AppError('VALIDATION_FAILED', 'The request body is not valid JSON');
  if (bodyError?.type === 'entity.too.large') return new AppError('VALIDATION_FAILED', 'The request body is too large');

  if (err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientUnknownRequestError) {
    const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
    const pg = pgCode(err);
    if (code === 'P2002' || pg === '23505') {
      const target = err instanceof Prisma.PrismaClientKnownRequestError ? err.meta?.target : undefined;
      const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
      if (fields.includes('sku')) return new AppError('SKU_TAKEN', 'That SKU is already used by another product');
      if (fields.includes('email')) return new AppError('EMAIL_TAKEN', 'That email is already registered');
      return new AppError('ALREADY_EXISTS', `Another record already has this ${fields.join(', ') || 'value'}`, { fields });
    }
    if (code === 'P2003' || pg === '23503') return new AppError('INACTIVE_REFERENCE', 'A referenced record does not exist');
    if (pg === '23514') {
      const name = checkName(err);
      if (name === 'stock_quant_quantity_nonneg') {
        logger.error({ err }, 'Negative-stock CHECK fired: the database backstop caught what posting.ts should have');
        return new AppError('INSUFFICIENT_STOCK', 'Not enough stock to complete this');
      }
      const field = name ? FIELD_CHECKS[name] : undefined;
      if (field) return new AppError(field.code, field.message, [{ path: field.path, message: field.message }]);
    }
    if (code === 'P2025') return new AppError('NOT_FOUND', 'Record not found');
  }
  return undefined;
}

/** Every error leaves as { error: { code, message, details?, requestId } }. Stack traces stay in the log. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? logger;
  // A stream (SSE) that already sent its headers can't take an error body: log it and end the stream.
  if (res.headersSent) {
    log.error({ err }, 'Error after the response started');
    res.end();
    return;
  }
  const known = toAppError(err);
  if (!known) log.error({ err }, 'Unhandled error');
  const e = known ?? new AppError('INTERNAL', 'Something went wrong. Quote the request id if you report it.');
  const body: ErrorBody = { error: { code: e.code, message: e.message, requestId: String(req.id ?? '') } };
  if (e.details !== undefined) body.error.details = e.details;
  res.status(e.status).json(body);
};
