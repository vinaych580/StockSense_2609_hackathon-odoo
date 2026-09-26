import { Button } from '@/components/ui/button';

const DEMO_USERS = [
  { label: 'Manager', name: 'Priya', email: 'manager@stocksense.test' },
  { label: 'Staff', name: 'Neha', email: 'staff@stocksense.test' },
] as const;

/**
 * Dev-only (LoginPage renders it behind import.meta.env.DEV). The password is SEED_PASSWORD from
 * apps/api/.env, injected by vite.config.ts during `vite serve` only. Without it, the buttons fill the email.
 */
export function DemoAccounts({ onFill }: { onFill: (email: string, password: string | null) => void }) {
  return (
    <section aria-label="Demo accounts" className="flex flex-col gap-3 border-t border-hairline pt-4">
      <span className="eyebrow">Demo accounts · dev only</span>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_USERS.map((u) => (
          <Button key={u.email} type="button" variant="outline" onClick={() => onFill(u.email, __DEMO_PASSWORD__)}>
            {u.label}, {u.name}
          </Button>
        ))}
      </div>
    </section>
  );
}
