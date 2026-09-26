import { Router } from 'express';
import { hash, verify } from '@node-rs/argon2';
import {
  hasPermission,
  loginInput,
  passwordChangeInput,
  passwordForgotInput,
  passwordResetInput,
  passwordVerifyInput,
  PERMISSIONS,
  profileUpdateInput,
  signupInput,
  type LoginInput,
  type MeDto,
  type PasswordChangeInput,
  type PasswordResetInput,
  type Permission,
  type Role,
  type SignupInput,
} from '@stocksense/shared';
import { prisma } from '../lib/db';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { actorOf, requireAuth } from '../middleware/auth';
import type { createLimits } from '../middleware/security';
import { validate } from '../middleware/validate';
import { checkCode, requestReset, resetPassword } from './password-reset';
import { endSession, hashToken, SESSION_COOKIE, startSession } from './sessions';
import { publish } from '../lib/events';

export function toMe(user: { id: string; name: string; email: string; role: Role }): MeDto {
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(user.role, p));
  return { id: user.id, name: user.name, email: user.email, role: user.role, permissions };
}

const BAD_LOGIN = 'Wrong email or password';

/** Verified against when the email is unknown, so a miss takes as long as a wrong password. */
let dummyHash: Promise<string> | undefined;

export function authRouter(limits: ReturnType<typeof createLimits>): Router {
  const r = Router();

  r.post('/signup', limits.signup, validate(signupInput), async (req, res) => {
    const input = req.body as SignupInput;
    if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new AppError('EMAIL_TAKEN', 'That email is already registered. Log in instead.');
    }
    // Sign-up is always Staff; a Manager promotes people from Settings.
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: await hash(input.password), role: 'STAFF' },
    });
    await startSession(req, res, user.id);
    res.status(201).json({ data: toMe(user) });
  });

  r.post('/login', limits.login, validate(loginInput), async (req, res) => {
    const input = req.body as LoginInput;
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const ok = user
      ? await verify(user.passwordHash, input.password).catch(() => false)
      : await verify(await (dummyHash ??= hash('dummy-password-for-timing')), input.password).then(() => false);
    if (!user || !ok || !user.isActive) {
      req.log?.info({ email: input.email }, 'log-in refused');
      throw new AppError('UNAUTHENTICATED', BAD_LOGIN);
    }
    await startSession(req, res, user.id);
    res.json({ data: toMe(user) });
  });

  r.get('/me', requireAuth, async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actorOf(req).id } });
    res.json({ data: toMe(user) });
  });

  /** My Profile: change the display name. Other open tabs of this user refetch /me. */
  r.patch('/me', requireAuth, validate(profileUpdateInput), async (req, res) => {
    const user = await prisma.user.update({ where: { id: actorOf(req).id }, data: { name: (req.body as { name: string }).name } });
    publish({ type: 'session.updated', userId: user.id });
    res.json({ data: toMe(user) });
  });

  /** My Profile: change the password. Every other session of this user is logged out; this one stays. */
  r.post('/me/password', requireAuth, limits.login, validate(passwordChangeInput), async (req, res) => {
    const input = req.body as PasswordChangeInput;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actorOf(req).id } });
    if (!(await verify(user.passwordHash, input.currentPassword).catch(() => false))) {
      throw new AppError('VALIDATION_FAILED', 'Your current password is wrong', [{ path: 'currentPassword', message: 'Wrong password' }]);
    }
    const current = hashToken(String(req.cookies?.[SESSION_COOKIE] ?? ''));
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(input.newPassword) } }),
      prisma.session.deleteMany({ where: { userId: user.id, id: { not: current } } }),
    ]);
    res.status(204).end();
  });

  // Password reset by emailed code. The request answers the same, without waiting on hashing or
  // mail, whether or not the email has an account.
  r.post('/password/forgot', limits.forgotPerIp, limits.forgotPerEmail, validate(passwordForgotInput), (req, res) => {
    const { email } = req.body as { email: string };
    requestReset(email).catch((err: unknown) => logger.error({ err }, 'Password reset request failed'));
    res.status(202).json({ data: { message: 'If that email has an account, a 6-digit code is on its way. It expires in 10 minutes.' } });
  });

  /** Optional step for a two-screen UI: check the code before asking for the new password. */
  r.post('/password/verify', limits.verify, validate(passwordVerifyInput), async (req, res) => {
    const { email, code } = req.body as { email: string; code: string };
    await checkCode(email, code, false);
    res.json({ data: { valid: true } });
  });

  /** Sets the new password, logs out every session, and signs this browser in. */
  r.post('/password/reset', limits.verify, validate(passwordResetInput), async (req, res) => {
    const input = req.body as PasswordResetInput;
    const userId = await resetPassword(input.email, input.code, input.newPassword);
    await startSession(req, res, userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    res.json({ data: toMe(user) });
  });

  r.post('/logout', async (req, res) => {
    await endSession(req, res);
    res.status(204).end();
  });

  return r;
}
