/**
 * Password reset by a 6-digit code sent by email. One live code per user (a new request replaces
 * the old one); it expires after 10 minutes, allows 5 wrong tries, and works once. Only its argon2
 * hash is stored. Every answer about an email is the same whether or not an account exists.
 */
import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { prisma } from '../lib/db';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

let dummyHash: Promise<string> | undefined;

/** Issues a code and emails it. Silent for unknown or deactivated emails. */
export async function requestReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const data = { codeHash: await hash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, consumedAt: null };
  await prisma.passwordResetOtp.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  // Not awaited by the route: a slow mail server must not make known emails answer slower than unknown ones.
  sendMail({
    to: user.email,
    subject: `${code} is your StockSense reset code`,
    text:
      `Hi ${user.name},\n\nYour code to reset your StockSense password is ${code}.\n` +
      `It expires in 10 minutes. If you didn't ask for this, ignore this email; your password is unchanged.\n`,
  }).catch((err: unknown) => logger.error({ err }, 'Could not send the reset code'));
}

/**
 * Checks a code, counting a wrong one against the limit. Returns the user id. `consume` marks the
 * code used (the final reset step); verify-only calls leave it usable.
 */
export async function checkCode(email: string, code: string, consume: boolean): Promise<string> {
  const invalid = () => new AppError('OTP_INVALID', 'That code is wrong. Check the latest email, or request a new code.');
  const user = await prisma.user.findUnique({ where: { email }, include: { passwordResetOtps: true } });
  const otp = user?.passwordResetOtps[0];
  if (!user || !user.isActive || !otp || otp.consumedAt) {
    // Spend the same argon2 time as a real check, so timing doesn't reveal which emails have a live code.
    await verify(await (dummyHash ??= hash('000000')), code).catch(() => false);
    throw invalid();
  }
  if (otp.expiresAt.getTime() < Date.now() || otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('OTP_EXPIRED', 'That code has expired. Request a new one.');
  }
  // Count the try before checking, atomically, so parallel guesses can't exceed the limit.
  const counted = await prisma.passwordResetOtp.updateMany({
    where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw new AppError('OTP_EXPIRED', 'That code has expired. Request a new one.');
  if (!(await verify(otp.codeHash, code).catch(() => false))) throw invalid();
  if (consume) {
    const used = await prisma.passwordResetOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (used.count === 0) throw invalid();
  } else {
    // A correct code shouldn't eat into the tries left for the reset step.
    await prisma.passwordResetOtp.update({ where: { id: otp.id }, data: { attempts: { decrement: 1 } } });
  }
  return user.id;
}

/** Sets the new password and ends every session: whoever knew the old password is logged out. */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<string> {
  const userId = await checkCode(email, code, true);
  const passwordHash = await hash(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return userId;
}
