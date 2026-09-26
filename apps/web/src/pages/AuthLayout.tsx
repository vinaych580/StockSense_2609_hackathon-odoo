import { Warehouse } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2">
        <Warehouse className="size-5 text-accent" />
        <span className="font-semibold tracking-tight">StockSense</span>
      </div>
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <section className="flex flex-col gap-6 rounded-lg border border-hairline bg-card p-6">
          <header className="flex flex-col gap-1">
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="text-xl font-semibold">{title}</h1>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-danger">
      {message}
    </p>
  );
}
