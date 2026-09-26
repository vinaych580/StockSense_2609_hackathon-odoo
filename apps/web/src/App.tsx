import { OPERATION_TYPES } from '@stocksense/shared';
import { Route, Routes } from 'react-router';

import { Button } from '@/components/ui/button';

// Placeholder until the app shell (C3) lands: shows the theme and proves the shared package resolves.
function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">StockSense</span>
        <h1 className="text-3xl font-semibold">Inventory, kept honest.</h1>
        <p className="text-muted">The web app is running. Operations, stock and moves come next.</p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-card p-6">
        <span className="eyebrow">Operation types</span>
        <ul className="flex flex-wrap gap-2">
          {OPERATION_TYPES.map((type) => (
            <li key={type} className="rounded-full border border-hairline px-3 py-1 text-xs text-muted">
              {type}
            </li>
          ))}
        </ul>
        <p className="ref text-sm">WH1/IN/00012</p>
        <ul className="flex flex-col gap-1 text-sm">
          <li className="text-success">+12 received</li>
          <li className="text-danger">−4 delivered, 2 short</li>
          <li className="text-warning">3 products low on stock</li>
        </ul>
        <div className="flex gap-3">
          <Button>Validate</Button>
          <Button variant="outline">Cancel</Button>
        </div>
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
