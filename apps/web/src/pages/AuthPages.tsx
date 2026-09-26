import { loginInput, passwordForgotInput, passwordResetInput, signupInput, type MeDto } from '@stocksense/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { meQueryKey, useAuth } from '@/auth/AuthProvider';
import { Checked, StockDimension } from '@/components/drawing';
import { Wordmark } from '@/components/Shell';
import { Button, Field, FieldGrid, Input, Note } from '@/components/ui';
import { api, isApiError } from '@/lib/api';
import { check, issuesToErrors, type Errors } from '@/lib/forms';
import { safeNext } from '@/lib/utils';

/** The brief's own walkthrough, drawn as the record it produces. */
const SR01 = [
  { doc: 'WH1/IN/00001', what: 'Received from Ironclad Metals', inQ: '100', outQ: '', bal: '100' },
  { doc: 'WH1/INT/00001', what: 'Stock → Production Floor', inQ: 'moved', outQ: '', bal: '100' },
  { doc: 'WH1/OUT/00001', what: 'Delivered to Brightdesk Offices', inQ: '', outQ: '20', bal: '80' },
  { doc: 'WH1/ADJ/00001', what: 'Counted 77 kg, 3 damaged', inQ: '', outQ: '3', bal: '77' },
];

function Specimen() {
  return (
    <figure className="flex flex-col border-2 border-ink bg-sheet">
      <div className="grid grid-cols-[1fr_auto_auto] border-b border-ink">
        <div className="border-r border-ink px-3 py-1.5">
          <div className="letter text-2xs text-ink-3">Title</div>
          <div className="text-lg font-semibold">Steel Rods</div>
        </div>
        <div className="border-r border-ink px-3 py-1.5">
          <div className="letter text-2xs text-ink-3">SKU</div>
          <div className="font-medium">SR-01</div>
        </div>
        <div className="px-3 py-1.5">
          <div className="letter text-2xs text-ink-3">Unit</div>
          <div className="font-medium">kg</div>
        </div>
      </div>
      <div className="border-b border-ink px-2 pt-2">
        <StockDimension onHand={77} outgoing={0} incoming={0} forecast={77} min={50} max={300} uom="KG" />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="letter border-b border-ink text-left text-2xs text-ink-2">
            <th className="w-10 px-3 py-1.5 text-right font-semibold">Rev</th>
            <th className="px-3 py-1.5 font-semibold">Document</th>
            <th className="border-l border-rule-2 px-3 py-1.5 text-right font-semibold">In</th>
            <th className="border-l border-rule-2 px-3 py-1.5 text-right font-semibold">Out</th>
            <th className="border-l border-rule-2 px-3 py-1.5 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody>
          {SR01.map((r, i) => (
            <tr key={r.doc} className="border-b border-rule-2 [animation:ink-in_.4s_ease-out_both]" style={{ animationDelay: `${300 + i * 380}ms` }}>
              <td className="px-3 py-1.5 text-right text-ink-3">{i + 1}</td>
              <td className="px-3 py-1.5">
                <span className="font-semibold text-blue">{r.doc}</span>
                <span className="block text-ink-2">{r.what}</span>
              </td>
              <td className="border-l border-rule-2 px-3 text-right font-semibold">{r.inQ === 'moved' ? <span className="font-normal text-ink-3">moved</span> : r.inQ}</td>
              <td className="border-l border-rule-2 px-3 text-right font-semibold text-red">{r.outQ}</td>
              <td className="border-l border-rule-2 px-3 text-right text-md font-bold">{r.bal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-sm text-ink-2">On hand is the last balance. Nothing else can change it.</span>
        <span className="[animation:ink-in_.3s_ease-out_both] [animation-delay:1.9s]">
          <Checked>Ledger matches</Checked>
        </span>
      </figcaption>
    </figure>
  );
}

function AuthLayout({ sheet, title, sub, children }: { sheet: string; title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-full p-1.5 sm:p-[18px]">
      <div className="grid min-h-[calc(100vh-12px)] border-2 border-ink sm:min-h-[calc(100vh-36px)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="hidden flex-col justify-between gap-10 border-r-2 border-ink bg-sheet-2 p-10 lg:flex xl:p-14">
          <Wordmark />
          <div className="mx-auto w-full max-w-[600px]">
            <Specimen />
          </div>
          <p className="max-w-[26ch] text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.015em]">
            Every number traces back to the documents that moved it.
          </p>
        </section>
        <section className="flex flex-col">
          <div className="flex items-center justify-between border-b border-ink px-5 py-3 lg:hidden">
            <Wordmark />
          </div>
          <div className="flex flex-1 items-center px-5 py-12 sm:px-12">
            <div className="w-full max-w-md">
              <div className="flex border-2 border-ink">
                <div className="flex w-20 shrink-0 flex-col justify-between border-r border-ink px-3 py-2">
                  <span className="letter text-2xs text-ink-3">Sheet</span>
                  <span className="letter text-lg font-bold leading-none">{sheet}</span>
                </div>
                <div className="px-4 py-2.5">
                  <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
                  <p className="mt-0.5 text-ink-2">{sub}</p>
                </div>
              </div>
              <div className="mt-6">{children}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function useAuthSubmit(path: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submit = async (body: unknown, onFieldError: (e: Errors) => void) => {
    setPending(true);
    setFormError(null);
    try {
      const me = await api.post<MeDto>(path, body);
      qc.setQueryData(meQueryKey, me);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (e) {
      if (isApiError(e)) {
        const details = e.error.details;
        if (Array.isArray(details) && details.length) onFieldError(issuesToErrors(details as { path: string; message: string }[]));
        else if (e.error.code === 'EMAIL_TAKEN') onFieldError({ email: e.error.message });
        else if (e.error.code === 'OTP_INVALID' || e.error.code === 'OTP_EXPIRED') onFieldError({ code: e.error.message });
        else setFormError(e.error.message);
      } else setFormError('Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  };
  return { submit, pending, formError };
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Note tone="red" role="alert" title={message} />;
}

export function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const { submit, pending, formError } = useAuthSubmit('/auth/login');
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = check(loginInput, { email, password });
    if (parsed.errors) return setErrors(parsed.errors);
    setErrors({});
    void submit(parsed.data, setErrors);
  };

  return (
    <AuthLayout sheet="S-00" title="Log in" sub="Pick up where the last shift left off.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />
        <FieldGrid className="grid-cols-1">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} autoFocus />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
          </Field>
        </FieldGrid>
        <div className="flex items-center justify-between gap-4">
          <Button type="submit" variant="primary" size="lg" loading={pending}>Log in</Button>
          <Link to={`/reset${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="text-sm text-blue underline">Forgot password?</Link>
        </div>
      </form>
      {import.meta.env.DEV && (
        <div className="mt-8 border-t border-dashed border-ink-3 pt-5">
          <p className="letter text-2xs font-semibold text-ink-3">Demo accounts, development only</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: 'Priya, Manager', email: 'manager@stocksense.test' },
              { label: 'Neha, Staff', email: 'staff@stocksense.test' },
            ].map((u) => (
              <Button key={u.email} size="sm" onClick={() => { setEmail(u.email); if (__DEMO_PASSWORD__) setPassword(__DEMO_PASSWORD__); }}>
                {u.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-8 text-ink-2">
        New to the team? <Link to="/signup" className="font-semibold text-blue underline">Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const { submit, pending, formError } = useAuthSubmit('/auth/signup');
  if (user) return <Navigate to="/" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = check(signupInput, form);
    if (parsed.errors) return setErrors(parsed.errors);
    setErrors({});
    void submit(parsed.data, setErrors);
  };

  return (
    <AuthLayout sheet="S-00" title="Create an account" sub="New accounts start as Staff. A Manager can change your role.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />
        <FieldGrid className="grid-cols-1">
          <Field label="Full name" htmlFor="name" error={errors.name}>
            <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} autoFocus />
          </Field>
          <Field label="Work email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint="At least 10 characters.">
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-invalid={!!errors.password} />
          </Field>
        </FieldGrid>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-fit">Create account</Button>
      </form>
      <p className="mt-8 text-ink-2">
        Already have an account? <Link to="/login" className="font-semibold text-blue underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}

/** Forgot password: a 6-digit code by email, then a new password. Success signs this browser in. */
export function ResetPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { submit, pending, formError } = useAuthSubmit('/auth/password/reset');
  if (user) return <Navigate to="/" replace />;

  const request = async (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = check(passwordForgotInput, { email });
    if (parsed.errors) return setErrors(parsed.errors);
    setErrors({});
    setSending(true);
    try {
      const res = await api.post<{ message: string }>('/auth/password/forgot', parsed.data);
      setSent(res.message);
      setStep('code');
    } catch (err) {
      setErrors({ email: isApiError(err) ? err.error.message : 'Something went wrong. Try again.' });
    } finally {
      setSending(false);
    }
  };

  const reset = (e: FormEvent) => {
    e.preventDefault();
    const parsed = check(passwordResetInput, { email, code, newPassword });
    if (parsed.errors) return setErrors(parsed.errors);
    setErrors({});
    void submit(parsed.data, setErrors);
  };

  return (
    <AuthLayout sheet="S-00" title="Reset your password" sub={step === 'email' ? 'We’ll email you a 6-digit code.' : 'Enter the code from the email and choose a new password.'}>
      {step === 'email' ? (
        <form onSubmit={request} noValidate className="flex flex-col gap-4">
          <FieldGrid className="grid-cols-1">
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
          </FieldGrid>
          <Button type="submit" variant="primary" size="lg" loading={sending} className="w-fit">Send code</Button>
        </form>
      ) : (
        <form onSubmit={reset} noValidate className="flex flex-col gap-4">
          {sent && (
            <Note
              title="Check your email"
              actions={import.meta.env.DEV && (
                <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue underline">
                  Open local inbox
                </a>
              )}
            >
              {sent}
            </Note>
          )}
          <FormError message={formError} />
          <FieldGrid className="grid-cols-[9rem_1fr]">
            <Field label="Code" htmlFor="code" error={errors.code}>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-lg font-semibold tracking-[0.3em]" autoFocus />
            </Field>
            <Field label="New password" htmlFor="newPassword" error={errors.newPassword} hint="At least 10 characters.">
              <Input id="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
          </FieldGrid>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="primary" size="lg" loading={pending}>Set password and log in</Button>
            <Button variant="link" loading={sending} onClick={() => void request()}>Send a new code</Button>
          </div>
        </form>
      )}
      <p className="mt-8 text-ink-2">
        Remembered it? <Link to="/login" className="font-semibold text-blue underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}
