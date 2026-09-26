/** HTTP test helpers: a fresh app per test file and signed-in Supertest agents. */
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import type { Role } from '@stocksense/shared';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/db';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct-horse-battery';

export const app = createApp();

let n = 0;
let passwordHash: string | undefined;

/** A user with a real password hash, so it can log in. */
export async function makeLoginUser(role: Role = 'MANAGER', opts: { isActive?: boolean } = {}) {
  passwordHash ??= await hash(PASSWORD);
  n++;
  return prisma.user.create({
    data: { email: `http${n}@stocksense.test`, name: `${role === 'MANAGER' ? 'Manager' : 'Staff'} ${n}`, passwordHash, role, isActive: opts.isActive ?? true },
  });
}

/** A Supertest agent that keeps cookies, logged in as a new user of that role. */
export async function signedIn(role: Role = 'MANAGER') {
  const user = await makeLoginUser(role);
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user };
}
