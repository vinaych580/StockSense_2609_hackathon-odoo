import { ChevronDown, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';

import { cn } from '@/lib/utils';

import { NAV, type NavItem } from './nav';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-elevated hover:text-foreground',
    isActive ? 'bg-elevated text-accent' : 'text-muted',
  );

function NavGroup({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const inGroup = pathname.startsWith(item.path);
  const [open, setOpen] = useState(inGroup);
  const Icon = item.icon;
  const id = `nav-${item.path.slice(1)}`;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(itemClass({ isActive: false }), 'w-full', inGroup && 'text-foreground')}
      >
        <Icon className={cn('size-4', inGroup && 'text-accent')} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul id={id} className="mt-1 ml-5 flex flex-col gap-1 border-l border-hairline pl-3">
          {item.children?.map((child) => (
            <li key={child.path}>
              <NavLink to={child.path} className={itemClass} onClick={onNavigate}>
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="flex h-9 items-center gap-2 px-3">
        <Warehouse className="size-5 text-accent" />
        <span className="font-semibold tracking-tight">StockSense</span>
      </div>
      <ul className="flex flex-col gap-1">
        {NAV.map((item) => {
          if (item.children) return <NavGroup key={item.path} item={item} onNavigate={onNavigate} />;
          const Icon = item.icon;
          return (
            <li key={item.path}>
              <NavLink to={item.path} className={itemClass} onClick={onNavigate}>
                {({ isActive }) => (
                  <>
                    <Icon className={cn('size-4', isActive && 'text-accent')} />
                    <span className="flex-1">{item.label}</span>
                    {/* D9: the low-stock badge renders here for Products. */}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
