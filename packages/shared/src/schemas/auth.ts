import { z } from 'zod';

/** Emails are compared trimmed and lower-case everywhere. */
export const emailInput = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email').max(254));

const newPassword = z.string().min(10, 'Use at least 10 characters').max(128, 'Use at most 128 characters');

/** Sign-up never takes a role: new users are always Staff. */
export const signupInput = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120),
  email: emailInput,
  password: newPassword,
});
export type SignupInput = z.infer<typeof signupInput>;

export const loginInput = z.object({
  email: emailInput,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginInput>;

const otpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const passwordForgotInput = z.object({ email: emailInput });
export const passwordVerifyInput = z.object({ email: emailInput, code: otpCode });
export const passwordResetInput = z.object({ email: emailInput, code: otpCode, newPassword });
export type PasswordResetInput = z.infer<typeof passwordResetInput>;

/** PATCH /auth/me: the signed-in user's own profile. Email is the log-in identity and doesn't change here. */
export const profileUpdateInput = z.object({ name: z.string().trim().min(1, 'Enter your name').max(120) });
export type ProfileUpdateInput = z.infer<typeof profileUpdateInput>;

/** POST /auth/me/password: change the password while logged in. */
export const passwordChangeInput = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password').max(128), newPassword })
  .refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], message: 'Choose a password different from the current one' });
export type PasswordChangeInput = z.infer<typeof passwordChangeInput>;
