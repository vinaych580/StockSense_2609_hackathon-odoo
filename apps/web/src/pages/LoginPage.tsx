import { zodResolver } from '@hookform/resolvers/zod';
import { loginInput, type LoginInput, type MeDto } from '@stocksense/shared';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { z } from 'zod';

import { useAuth } from '@/auth/AuthProvider';
import { useSignIn } from '@/auth/useSignIn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { applyServerError } from '@/lib/forms';
import { safeNext } from '@/lib/next';

import { AuthLayout, FieldError, FormAlert } from './AuthLayout';
import { DemoAccounts } from './DemoAccounts';

export function LoginPage() {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');
  const signIn = useSignIn();
  const form = useForm<z.input<typeof loginInput>, unknown, LoginInput>({
    resolver: zodResolver(loginInput),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (isLoading) return null;
  if (user) return <Navigate to={safeNext(next)} replace />;

  const logIn = form.handleSubmit(async (values) => {
    try {
      signIn(await api.post<MeDto>('/auth/login', values), next);
    } catch (e) {
      // A wrong password is UNAUTHENTICATED: shown on the form, never a redirect.
      applyServerError(form.setError, e);
    }
  });

  return (
    <AuthLayout eyebrow="Log in" title="Welcome back">
      <form onSubmit={logIn} noValidate className="flex flex-col gap-4">
        <FormAlert message={errors.root?.server?.message} />
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
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-error"
            {...form.register('password')}
          />
          <FieldError id="password-error" message={errors.password?.message} />
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <p className="text-sm text-muted">
        New here?{' '}
        <Link to={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}>Create an account</Link>
      </p>
      {import.meta.env.DEV && (
        <DemoAccounts
          onFill={(email, password) => {
            form.clearErrors();
            form.setValue('email', email);
            if (password) {
              form.setValue('password', password);
              void logIn();
            } else {
              form.setFocus('password');
            }
          }}
        />
      )}
    </AuthLayout>
  );
}
