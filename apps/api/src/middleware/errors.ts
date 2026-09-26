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
      logger.error({ err }, 'CHECK constraint fired: the database backstop caught what the service should have');
      return new AppError('INSUFFICIENT_STOCK', 'Not enough stock to complete this');
    }
    if (code === 'P2025') return new AppError('NOT_FOUND', 'Record not found');
  }
  return undefined;
}

/** Every error leaves as { error: { code, message, details?, requestId } }. Stack traces stay in the log. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? logger;
  const known = toAppError(err);
  if (!known) log.error({ err }, 'Unhandled error');
  const e = known ?? new AppError('INTERNAL', 'Something went wrong. Quote the request id if you report it.');
  const body: ErrorBody = { error: { code: e.code, message: e.message, requestId: String(req.id ?? '') } };
  if (e.details !== undefined) body.error.details = e.details;
  res.status(e.status).json(body);
};
