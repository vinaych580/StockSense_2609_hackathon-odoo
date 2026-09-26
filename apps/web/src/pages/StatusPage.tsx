import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

function StatusPage({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="eyebrow text-accent">{code}</span>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted">{body}</p>
        <Button asChild className="mt-3">
          <Link to="/dashboard">Back to the dashboard</Link>
        </Button>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return <StatusPage code="404" title="Page not found" body="That page doesn't exist. Check the address, or head back." />;
}

export function ForbiddenPage() {
  return (
    <StatusPage
      code="403"
      title="You don't have access"
      body="Your role can't open this page. Ask a Manager if you need it."
    />
  );
}
