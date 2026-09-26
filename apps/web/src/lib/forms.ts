import type { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { isApiError } from './api';

export type Errors = Partial<Record<string, string>>;

/** First message per field path ("sku", "lines.0.quantity"). */
export function issuesToErrors(issues: { path: PropertyKey[] | string; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const key = Array.isArray(i.path) ? i.path.map(String).join('.') : String(i.path);
    out[key] ??= i.message;
  }
  return out;
}

/** Client-side check with a shared zod schema; returns the parsed value or field errors. */
export function check<S extends z.ZodType>(schema: S, value: unknown): { data: z.output<S>; errors: null } | { data: null; errors: Errors } {
  const r = schema.safeParse(value);
  return r.success ? { data: r.data, errors: null } : { data: null, errors: issuesToErrors(r.error.issues) };
}

/**
 * Turn a failed write into field errors where the API names a field, otherwise a toast.
 * Returns the field errors (empty when the error was toasted).
 */
export function apiErrors(e: unknown, fieldFor: Partial<Record<string, string>> = {}): Errors {
  if (isApiError(e)) {
    const details = e.error.details;
    if (Array.isArray(details) && details.length) return issuesToErrors(details as { path: string; message: string }[]);
    const field = fieldFor[e.error.code];
    if (field) return { [field]: e.error.message };
    toast.error(e.error.message);
    return {};
  }
  toast.error('Something went wrong. Try again.');
  return {};
}

export function useCan() {
  const { user } = useAuth();
  return {
    user,
    editMaster: !!user?.permissions.includes('masterdata.edit'),
    manager: user?.role === 'MANAGER',
  };
}
