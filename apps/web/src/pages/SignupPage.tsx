import { zodResolver } from '@hookform/resolvers/zod';
import { signupInput, type MeDto, type SignupInput } from '@stocksense/shared';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { z } from 'zod';

import { useAuth } from '@/auth/AuthProvider';
import { useSignIn } from '@/auth/useSignIn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, isApiError } from '@/lib/api';
import { applyServerError } from '@/lib/forms';
import { safeNext } from '@/lib/next';

import { AuthLayout, FieldError, FormAlert } from './AuthLayout';

export function SignupPage() {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');
  const signIn = useSignIn();
  const form = useForm<z.input<typeof signupInput>, unknown, SignupInput>({
    resolver: zodResolver(signupInput),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (isLoading) return null;
  if (user) return <Navigate to={safeNext(next)} replace />;

  const loginLink = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  const signUp = form.handleSubmit(async (values) => {
    try {
      // No role: the API always creates Staff.
      signIn(await api.post<MeDto>('/auth/signup', values), next);
    } catch (e) {
      if (isApiError(e, 'EMAIL_TAKEN')) form.setError('email', { message: e.error.message });
      else applyServerError(form.setError, e);
    }
  });

  return (
    <AuthLayout eyebrow="Sign up" title="Create your account">
      <form onSubmit={signUp} noValidate className="flex flex-col gap-4">
        <FormAlert message={errors.root?.server?.message} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby="name-error" {...form.register('name')} />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby="email-error"
            {...form.register('email')}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-error password-hint"
            {...form.register('password')}
          />
          {errors.password ? (
            <FieldError id="password-error" message={errors.password.message} />
          ) : (
            <p id="password-hint" className="text-xs text-muted">
              At least 10 characters.
            </p>
          )}
        </div>
        <p className="text-xs text-muted">New accounts start as Staff. A Manager can change your role.</p>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Already have an account? <Link to={loginLink}>Log in</Link>
      </p>
    </AuthLayout>
  );
}
