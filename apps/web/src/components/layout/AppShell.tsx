import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

/** Signed-in layout: sidebar, top bar with the user menu, and the page. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      {/* Below md the sidebar is an overlay opened from the top bar. */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-canvas/70 md:hidden" aria-hidden onClick={() => setMenuOpen(false)} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 border-r border-hairline bg-card md:sticky md:top-0 md:h-screen md:w-auto',
          menuOpen ? 'block' : 'hidden md:block',
        )}
      >
        <Sidebar onNavigate={() => setMenuOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-hairline bg-canvas px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
