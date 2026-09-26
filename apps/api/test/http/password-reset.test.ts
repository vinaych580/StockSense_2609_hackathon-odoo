import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/db';
import { setMailSender, type Mail } from '../../src/lib/mailer';
import { resetDb } from '../factories';
import { makeLoginUser, ORIGIN, PASSWORD, signedIn } from './helpers';

const NEW_PASSWORD = 'a-brand-new-password';
let outbox: Mail[];
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  await resetDb();
  outbox = [];
  setMailSender(async (m) => void outbox.push(m));
  app = createApp(); // fresh rate-limit counters per test
});
afterEach(() => setMailSender());

const post = (path: string, body: object, agent: ReturnType<typeof request.agent> | ReturnType<typeof request> = request(app)) =>
  agent.post(`/api/v1/auth/password${path}`).set('Origin', ORIGIN).send(body);

/** The code is sent after the response, so wait for it to land. */
async function codeFor(email: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const m = outbox.find((x) => x.to === email);
    if (m) return m.text.match(/\b(\d{6})\b/)![1]!;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('no reset email');
}

describe('password reset', () => {
  it('emails a code, verifies it, resets the password, and ends old sessions', async () => {
    const { agent: oldSession, user } = await signedIn('STAFF');
    const forgot = await post('/forgot', { email: ` ${user.email.toUpperCase()} ` });
    expect(forgot.status).toBe(202);
    const code = await codeFor(user.email);
    expect((await prisma.passwordResetOtp.findUniqueOrThrow({ where: { userId: user.id } })).codeHash).not.toContain(code);

    expect((await post('/verify', { email: user.email, code })).body.data).toEqual({ valid: true });

    const browser = request.agent(app);
    const reset = await post('/reset', { email: user.email, code, newPassword: NEW_PASSWORD }, browser);
    expect(reset.status).toBe(200);
    expect(reset.body.data.email).toBe(user.email);
    expect((await browser.get('/api/v1/auth/me')).status).toBe(200);
    expect((await oldSession.get('/api/v1/auth/me')).body.error.code).toBe('SESSION_EXPIRED');

    const login = (password: string) => request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: user.email, password });
    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login(NEW_PASSWORD)).status).toBe(200);

    // A code works once.
    expect((await post('/reset', { email: user.email, code, newPassword: 'yet-another-password' })).body.error.code).toBe('OTP_INVALID');
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const res = await post('/forgot', { email: 'nobody@stocksense.test' });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 200));
    expect(outbox).toHaveLength(0);
    expect((await post('/verify', { email: 'nobody@stocksense.test', code: '123456' })).body.error.code).toBe('OTP_INVALID');
  });

  it('locks the code after 5 wrong tries, and a new request replaces it', async () => {
    const user = await makeLoginUser('STAFF');
    await post('/forgot', { email: user.email });
    const code = await codeFor(user.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await post('/verify', { email: user.email, code: wrong })).body.error.code).toBe('OTP_INVALID');
    expect((await post('/verify', { email: user.email, code })).body.error.code).toBe('OTP_EXPIRED');

    outbox = [];
    await post('/forgot', { email: user.email });
    const fresh = await codeFor(user.email);
    expect((await post('/verify', { email: user.email, code: fresh })).status).toBe(200);
  });

  it('refuses an expired code and a weak new password', async () => {
    const user = await makeLoginUser('STAFF');
    await post('/forgot', { email: user.email });
    const code = await codeFor(user.email);
    expect((await post('/reset', { email: user.email, code, newPassword: 'short' })).status).toBe(400);
    await prisma.passwordResetOtp.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post('/reset', { email: user.email, code, newPassword: NEW_PASSWORD })).body.error.code).toBe('OTP_EXPIRED');
  });

  it('rate-limits requests per email', async () => {
    const user = await makeLoginUser('STAFF');
    for (let i = 0; i < 3; i++) expect((await post('/forgot', { email: user.email })).status).toBe(202);
    expect((await post('/forgot', { email: user.email })).status).toBe(429);
  });
});
