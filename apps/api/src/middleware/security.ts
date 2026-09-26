import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { AppError } from '../lib/errors';

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * CSRF guard alongside the SameSite=Lax cookie: every change with a body is JSON, and a browser's
 * Origin must be on the allowlist. Browsers always send Origin on cross-site POSTs; curl sends none.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (!CHANGES.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) return next(new AppError('FORBIDDEN', `Requests from ${origin} are not allowed`));
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (hasBody && !req.is('application/json')) return next(new AppError('VALIDATION_FAILED', 'Send the request body as JSON'));
  next();
};

function limiter(windowMs: number, limit: number, key: (req: Request) => string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: key,
    handler: (_req, res, next, options: Options) => {
      res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
      next(new AppError('RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.'));
    },
  });
}

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');
const email = (req: Request) => String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();

/** In-memory limits (one process). Built per app, so each test file starts with clean counters. */
export function createLimits() {
  return {
    login: limiter(15 * 60_000, 10, (req) => `${ip(req)}|${email(req)}`),
    forgotPerEmail: limiter(15 * 60_000, 3, email),
    forgotPerIp: limiter(60 * 60_000, 10, ip),
    verify: limiter(15 * 60_000, 10, ip),
    general: limiter(60_000, 300, (req) => String(req.cookies?.sid ?? ip(req))),
  };
}
