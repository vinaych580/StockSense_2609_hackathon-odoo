import { Router } from 'express';
import { hash, verify } from '@node-rs/argon2';
import {
  hasPermission,
  loginInput,
  PERMISSIONS,
  signupInput,
  type LoginInput,
  type MeDto,
  type Permission,
  type Role,
  type SignupInput,
} from '@stocksense/shared';
import { prisma } from '../lib/db';
import { AppError } from '../lib/errors';
import { actorOf, requireAuth } from '../middleware/auth';
import type { createLimits } from '../middleware/security';
import { validate } from '../middleware/validate';
import { endSession, startSession } from './sessions';

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

  r.post('/logout', async (req, res) => {
    await endSession(req, res);
    res.status(204).end();
  });

  return r;
}
