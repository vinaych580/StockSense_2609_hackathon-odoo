/**
 * The sheet frame. The viewport is one drawing: a ruled border with zone marks in the margin,
 * the sheet register across the top (every screen is a numbered sheet), and the work inside.
 */
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { LogOut, Search, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { SHEET_GROUPS, SHEETS, sheetNo } from '@/lib/domain';
import { useQueueCounts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useLiveEvents, type LiveState } from '@/lib/live';
import { ProfilePanel } from '@/pages/TeamPages';
import { CommandPalette } from './CommandPalette';
import { Delta } from './drawing';
import { Kbd } from './ui';

/** The mark: a hatched section with its dimension line. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn('size-7 shrink-0', className)} aria-hidden>
      <defs>
        <pattern id="mark-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink)" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x="3" y="3" width="15" height="15" fill="url(#mark-hatch)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="18" y="3" width="7" height="15" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="2" />
      <line x1="3" x2="25" y1="24" y2="24" stroke="var(--blue)" strokeWidth="1.2" />
      <path d="M3 24l4-1.6v3.2zM25 24l-4-1.6v3.2z" fill="var(--blue)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark />
      <span className="text-lg font-bold leading-none tracking-[-0.01em]">StockSense</span>
    </span>
  );
}

/** Zone references in the margin: numbers along the top and bottom, letters down the sides. */
function ZoneMarks() {
  const cols = Array.from({ length: 12 }, (_, i) => i + 1);
  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const tick = 'letter flex flex-1 items-center justify-center text-[10px] font-semibold text-ink-3';
  return (
    <div className="pointer-events-none absolute inset-0 hidden select-none sm:block" aria-hidden>
      {(['top-0', 'bottom-0'] as const).map((pos) => (
        <div key={pos} className={cn('absolute inset-x-[18px] flex h-[18px]', pos)}>
          {cols.map((c) => (
            <span key={c} className={cn(tick, 'border-l border-ink-3/50 first:border-l-0', c > 8 && 'hidden xl:flex', c > 6 && 'max-lg:hidden')}>{c}</span>
          ))}
        </div>
      ))}
      {(['left-0', 'right-0'] as const).map((pos) => (
        <div key={pos} className={cn('absolute inset-y-[18px] flex w-[18px] flex-col', pos)}>
          {rows.map((r) => (
            <span key={r} className={cn(tick, 'border-t border-ink-3/50 first:border-t-0')}>{r}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The sheet index, drawn down the left margin like a drawing set's register: sheets grouped by
 * discipline, each with its number, its name, and the open and late work it holds.
 */
function SheetIndex({ manager, onProfile }: { manager: boolean; onProfile: () => void }) {
  const counts = useQueueCounts();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r-2 border-ink lg:flex">
      <nav aria-label="Sheets" className="flex-1 overflow-y-auto py-2">
        {SHEET_GROUPS.map((g) => {
          const sheets = SHEETS.filter((s) => s.group === g && (manager || !s.manager));
          return (
            <div key={g} className="pb-2">
              <p className="letter flex items-center gap-2 px-3 pb-1 pt-2 text-2xs font-semibold text-ink-3">
                {g}
                <span className="h-px flex-1 bg-rule" aria-hidden />
              </p>
              <ul>
                {sheets.map((s) => {
                  const c = s.type ? counts.data?.[s.type] : undefined;
                  return (
                    <li key={s.no}>
                      <NavLink
                        to={s.path}
                        end={s.path === '/'}
                        className={({ isActive }) =>
                          cn('flex items-center gap-2.5 border-y border-transparent px-3 py-1.5 transition-colors', isActive ? 'border-ink bg-ink text-sheet' : 'hover:bg-sheet-2')
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span className={cn('letter w-9 shrink-0 text-2xs font-semibold', isActive ? 'text-sheet/60' : 'text-ink-3')}>{sheetNo(s.no)}</span>
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block truncate font-semibold">{s.label}</span>
                              <span className={cn('block truncate text-xs', isActive ? 'text-sheet/70' : 'text-ink-3')}>{s.hint}</span>
                            </span>
                            {c && c.late > 0 && (
                              <span className={cn('flex items-center gap-0.5 text-xs font-bold', isActive ? 'text-yellow' : 'text-red')} title={`${c.late} late`}>
                                <Delta className="h-3 w-3.5" tone={isActive ? 'ink' : 'red'} />
                                {c.late}
                              </span>
                            )}
                            {c && <span className={cn('min-w-4 text-right text-sm font-medium', isActive ? 'text-sheet/80' : 'text-ink-2')} title={`${c.open} open`}>{c.open}</span>}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <Operator onProfile={onProfile} rail />
    </aside>
  );
}

/** The register as a strip of tabs, for screens too narrow for the sheet index. */
function Register({ manager }: { manager: boolean }) {
  const counts = useQueueCounts();
  return (
    <nav aria-label="Sheets" className="flex overflow-x-auto border-b-2 border-ink [scrollbar-width:none] lg:hidden">
      {SHEETS.filter((s) => manager || !s.manager).map((s) => {
        const c = s.type ? counts.data?.[s.type] : undefined;
        return (
          <NavLink
            key={s.no}
            to={s.path}
            end={s.path === '/'}
            className={({ isActive }) =>
              cn(
                'group relative flex min-w-[7.25rem] flex-1 flex-col justify-between border-r border-ink px-2.5 pb-1.5 pt-1 transition-colors last:border-r-0',
                isActive ? 'bg-ink text-sheet' : 'hover:bg-sheet-2',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('letter flex items-center justify-between text-2xs font-semibold', isActive ? 'text-sheet/70' : 'text-ink-3')}>
                  {sheetNo(s.no)}
                  {c && c.late > 0 && (
                    <span className={cn('flex items-center gap-0.5 font-bold', isActive ? 'text-yellow' : 'text-red')} title={`${c.late} late`}>
                      <Delta className="h-3 w-3.5" tone={isActive ? 'ink' : 'red'} />
                      {c.late}
                    </span>
                  )}
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="whitespace-nowrap font-semibold">{s.label}</span>
                  {c && <span className={cn('text-sm font-medium', isActive ? 'text-sheet/80' : 'text-ink-2')}>{c.open}</span>}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** The title block's SCALE field, repurposed: is this sheet live? */
function LiveCell({ state }: { state: LiveState }) {
  return (
    <div className="hidden flex-col justify-center border-l border-ink px-3 sm:flex" title={state === 'live' ? 'Changes by anyone appear here without a reload' : undefined}>
      <span className="letter text-2xs font-semibold text-ink-3">Scale</span>
      <span
        className={cn(
          'letter inline-flex items-center gap-1.5 text-xs font-bold',
          state === 'live' && 'text-ink',
          state === 'connecting' && 'text-ink-3',
          state === 'offline' && 'text-red',
        )}
        role="status"
      >
        <span className={cn('size-2 rounded-full', state === 'live' ? 'bg-ink [animation:pulse_2s_ease-in-out_infinite]' : state === 'offline' ? 'bg-red' : 'border border-ink-3')} aria-hidden />
        {state === 'live' ? '1:1 Live' : state === 'offline' ? 'Offline' : 'Connecting'}
      </span>
    </div>
  );
}

/**
 * The "Drawn by" cell: who is signed in, with My profile and Log out. In the sheet index (rail) it
 * sits at the foot of the left margin; on narrow screens it closes the top bar instead.
 */
function Operator({ onProfile, rail }: { onProfile: () => void; rail?: boolean }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
  return (
    <Dropdown.Root>
      {rail ? (
        <Dropdown.Trigger className="flex w-full items-center gap-2.5 border-t-2 border-ink px-3 py-2.5 text-left hover:bg-sheet-2 data-[state=open]:bg-sheet-2" aria-label={`${user.name}, profile menu`}>
          <span className="letter flex size-8 shrink-0 items-center justify-center border border-ink bg-yellow text-xs font-bold" aria-hidden>{initials}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="letter block text-2xs font-semibold text-ink-3">Drawn by</span>
            <span className="block truncate text-sm font-semibold">{user.name}</span>
          </span>
          <span className="letter text-2xs font-semibold text-ink-3">{user.role === 'MANAGER' ? 'Mgr' : 'Staff'}</span>
        </Dropdown.Trigger>
      ) : (
        <Dropdown.Trigger className="flex h-full min-w-0 flex-col justify-center border-l border-ink px-3 text-left hover:bg-sheet-2 sm:min-w-44 lg:hidden" aria-label={`${user.name}, profile menu`}>
          <span className="letter hidden text-2xs font-semibold text-ink-3 sm:block">Drawn by</span>
          <span className="letter text-sm font-bold sm:hidden" aria-hidden>{initials}</span>
          <span className="hidden truncate text-sm font-semibold leading-tight sm:block">
            {user.name}
            <span className="letter ml-1.5 text-2xs font-semibold text-ink-3">{user.role === 'MANAGER' ? 'Mgr' : 'Staff'}</span>
          </span>
        </Dropdown.Trigger>
      )}
      <Dropdown.Portal>
        <Dropdown.Content
          side={rail ? 'top' : 'bottom'}
          align={rail ? 'start' : 'end'}
          sideOffset={0}
          className={cn('z-50 min-w-56 border-2 border-ink bg-sheet [animation:drop-in_.15s_ease-out]', rail && 'w-[var(--radix-dropdown-menu-trigger-width)]')}
        >
          <div className="border-b border-ink px-3 py-2">
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-ink-2">{user.email}</p>
          </div>
          <Dropdown.Item
            onSelect={onProfile}
            className="letter flex cursor-default items-center gap-2 border-b border-rule-2 px-3 py-2.5 text-sm font-semibold outline-none data-[highlighted]:bg-yellow"
          >
            <UserRound className="size-4" /> My profile
          </Dropdown.Item>
          <Dropdown.Item
            onSelect={() => void logout()}
            className="letter flex cursor-default items-center gap-2 px-3 py-2.5 text-sm font-semibold outline-none data-[highlighted]:bg-yellow"
          >
            <LogOut className="size-4" /> Log out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function Shell() {
  const { user } = useAuth();
  const live = useLiveEvents(!!user);
  const manager = user?.role === 'MANAGER';
  const [profileOpen, setProfileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const pendingG = useRef(0);

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Ctrl/Cmd+K finds anything; g then a digit jumps to that sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'g') {
        pendingG.current = Date.now();
        return;
      }
      if (Date.now() - pendingG.current < 1200 && /^[0-9]$/.test(e.key)) {
        const s = SHEETS.find((x) => x.no === (e.key === '0' ? 10 : Number(e.key)) && (manager || !x.manager));
        if (s) navigate(s.path);
        pendingG.current = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, manager]);

  return (
    <div className="fixed inset-0 p-1.5 sm:p-[18px]">
      <ZoneMarks />
      <div className="flex h-full flex-col border-2 border-ink bg-sheet">
        <div className="flex h-12 shrink-0 items-stretch border-b border-ink">
          <NavLink to="/" className="flex items-center border-r border-ink px-3 hover:bg-sheet-2 sm:px-4" aria-label="StockSense, Floor">
            <Wordmark />
          </NavLink>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex min-w-0 flex-1 items-center gap-3 px-3 text-left text-ink-3 hover:bg-sheet-2 sm:px-4"
          >
            <Search className="size-4 shrink-0 text-ink-2" />
            <span className="truncate text-sm group-hover:text-ink-2">
              <span className="hidden sm:inline">Find a product, document or sheet</span>
              <span className="sm:hidden">Find</span>
            </span>
            <span className="ml-auto hidden items-center gap-1 text-ink-2 md:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
              <span className="letter ml-3 text-2xs font-semibold text-ink-3">Sheets</span>
              <Kbd>G</Kbd>
              <Kbd>{manager ? '0–9' : '1–9'}</Kbd>
            </span>
          </button>
          <LiveCell state={live} />
          <Operator onProfile={() => setProfileOpen(true)} />
        </div>
        <Register manager={manager} />
        <div className="flex min-h-0 flex-1">
          <SheetIndex manager={manager} onProfile={() => setProfileOpen(true)} />
          <main ref={main} className="relative min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1520px] px-3 pb-16 pt-5 sm:px-6 sm:pt-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ProfilePanel open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
