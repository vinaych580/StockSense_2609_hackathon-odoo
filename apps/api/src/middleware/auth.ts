import type { RequestHandler } from 'express';
import { hasPermission, type Permission } from '@stocksense/shared';
import { lookupSession } from '../auth/sessions';
import { AppError } from '../lib/errors';

/** Loads the user from the session on every request, so role changes and deactivation apply at once. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const found = await lookupSession(req);
  if (found.status === 'expired') throw new AppError('SESSION_EXPIRED', 'Your session has expired. Log in again.');
  if (found.status === 'none') throw new AppError('UNAUTHENTICATED', 'Log in to continue');
  req.actor = { id: found.user.id, name: found.user.name, role: found.user.role };
  req.sessionId = found.sessionId;
  next();
};

/** For plain endpoints. Operation actions check permission inside the service, on the stored type. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.actor) throw new AppError('UNAUTHENTICATED', 'Log in to continue');
    if (!hasPermission(req.actor.role, permission)) {
      throw new AppError('FORBIDDEN', `${req.actor.role === 'STAFF' ? 'Staff' : 'Managers'} can't do this (needs ${permission})`, { permission });
    }
    next();
  };
}

/** The signed-in actor; only call behind requireAuth. */
export function actorOf(req: Parameters<RequestHandler>[0]) {
  if (!req.actor) throw new AppError('UNAUTHENTICATED', 'Log in to continue');
  return req.actor;
}
