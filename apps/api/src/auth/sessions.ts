/**
 * Server-side sessions. The cookie holds a random 32-byte token; the database stores only its
 * SHA-256, so a leaked session table can't be replayed. Idle for 24 hours or 7 days old → expired.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { prisma } from '../lib/db';

export const SESSION_COOKIE = 'sid';
export const SESSION_IDLE_MS = 24 * 3600_000;
export const SESSION_MAX_MS = 7 * 24 * 3600_000;
/** lastSeenAt is written at most once a minute per session, not on every request. */
const TOUCH_EVERY_MS = 60_000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_MAX_MS),
      ip: req.ip?.slice(0, 64) ?? null,
      userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    },
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_MS });
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

export type SessionLookup =
  | { status: 'none' }
  | { status: 'expired' }
  | { status: 'ok'; sessionId: string; user: { id: string; name: string; email: string; role: 'MANAGER' | 'STAFF' } };

/** Finds the session for this request's cookie; deletes it if expired or its user is deactivated. */
export async function lookupSession(req: Request): Promise<SessionLookup> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return { status: 'none' };
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return { status: 'none' };

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() <= now - SESSION_IDLE_MS) {
    await prisma.session.deleteMany({ where: { id } });
    return { status: 'expired' };
  }
  if (!session.user.isActive) {
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    return { status: 'none' };
  }
  if (session.lastSeenAt.getTime() < now - TOUCH_EVERY_MS) {
    await prisma.session.updateMany({ where: { id }, data: { lastSeenAt: new Date(now) } });
  }
  const { user } = session;
  return { status: 'ok', sessionId: id, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}
