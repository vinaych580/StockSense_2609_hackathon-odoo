/** A warehouse drawn in plan: outer walls, one room per internal location, a door swing on each. */
import type { WarehouseDto } from '@stocksense/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export interface RoomStat {
  products: number;
  alarm: number;
}

function Door({ className }: { className?: string }) {
  return (
    <span className={cn('pointer-events-none absolute -top-px right-4 block h-[18px] w-[18px]', className)} aria-hidden>
      <span className="absolute left-0 top-0 h-[3px] w-[18px] bg-sheet" />
      <svg viewBox="0 0 18 18" className="absolute left-0 top-0 size-[18px] overflow-visible">
        <line x1="17.5" y1="0" x2="17.5" y2="18" stroke="var(--ink)" strokeWidth="1" />
        <path d="M17.5 18 A17.5 17.5 0 0 1 0 0" fill="none" stroke="var(--ink-3)" strokeWidth="0.75" strokeDasharray="2 2" />
      </svg>
    </span>
  );
}

export function WarehousePlan({ warehouse, stats, roomHref, roomAction, compact }: {
  warehouse: WarehouseDto;
  stats?: Record<string, RoomStat>;
  roomHref?: (locationId: string) => string;
  roomAction?: (locationId: string) => ReactNode;
  compact?: boolean;
}) {
  const rooms = warehouse.locations.filter((l) => l.type === 'INTERNAL');
  return (
    <figure className={cn('relative border-[3px] border-ink p-2', !warehouse.isActive && 'hatch')}>
      <figcaption className="absolute -top-[11px] left-3 bg-sheet px-1.5 leading-none">
        <span className="letter text-xs font-bold">{warehouse.code}</span>
        <span className="ml-1.5 text-sm text-ink-2">{warehouse.name}</span>
      </figcaption>
      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]')}>
        {rooms.map((l) => {
          const s = stats?.[l.id];
          const body = (
            <>
              <span className="letter block text-2xs font-semibold text-ink-3">{l.code}</span>
              <span className="block truncate font-semibold leading-tight">{l.name}</span>
              <span className="mt-auto flex items-baseline justify-between gap-2 pt-2 text-sm">
                {s ? (
                  <span className="text-ink-2">{s.products} product{s.products === 1 ? '' : 's'}</span>
                ) : (
                  <span className="text-ink-3">{l.isActive ? 'Empty' : 'Archived'}</span>
                )}
                {roomAction?.(l.id)}
              </span>
              <Door />
            </>
          );
          const cls = cn(
            'relative flex min-h-[5.5rem] flex-col border border-ink px-2.5 pb-2 pt-1.5',
            !l.isActive && 'hatch text-ink-3',
            roomHref && 'transition-colors hover:bg-blue-wash',
          );
          return roomHref ? (
            <Link key={l.id} to={roomHref(l.id)} className={cls}>{body}</Link>
          ) : (
            <div key={l.id} className={cls}>{body}</div>
          );
        })}
        {rooms.length === 0 && <p className="col-span-full px-2 py-4 text-ink-3">No locations drawn yet.</p>}
      </div>
    </figure>
  );
}
