/**
 * Where and what: the warehouse, location and product-category filters shared by the Floor and the
 * document lists. They live in the URL (?wh=&loc=&cat=), so a filtered sheet can be bookmarked or sent.
 * Picking a location also pins its warehouse; picking another warehouse drops a location outside it.
 */
import { useSearchParams } from 'react-router';
import { useCategories, useLocations, useWarehouses } from '@/lib/queries';
import { Select } from './ui';

// A type alias, not an interface, so it passes as an API Query.
export type Scope = {
  warehouseId?: string;
  locationId?: string;
  categoryId?: string;
};

export function useScope() {
  const [params, setParams] = useSearchParams();
  const scope: Scope = {
    warehouseId: params.get('wh') || undefined,
    locationId: params.get('loc') || undefined,
    categoryId: params.get('cat') || undefined,
  };
  // Built from the live URL, not this render's params, so two quick changes (or a status tab and a
  // filter on the same page) don't overwrite each other.
  const update = (patch: Record<string, string | null>) =>
    setParams(
      () => {
        const next = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  const active = !!(scope.warehouseId || scope.locationId || scope.categoryId);
  return { scope, update, active, clear: () => update({ wh: null, loc: null, cat: null }) };
}

function Cell({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <label className="flex h-8 items-center gap-2 border border-ink bg-sheet px-2.5">
      <span className="letter text-2xs font-semibold text-ink-3">{caption}</span>
      {children}
    </label>
  );
}

export function ScopeFilters() {
  const { scope, update, active, clear } = useScope();
  const warehouses = useWarehouses();
  const locations = useLocations();
  const categories = useCategories();
  const internal = (locations.data ?? []).filter((l) => l.type === 'INTERNAL' && l.isActive && (!scope.warehouseId || l.warehouseId === scope.warehouseId));

  return (
    <>
      <Cell caption="Warehouse">
        <Select
          value={scope.warehouseId ?? ''}
          aria-label="Filter by warehouse"
          className="h-full w-36 text-sm"
          onChange={(e) => {
            const wh = e.target.value || null;
            const loc = locations.data?.find((l) => l.id === scope.locationId);
            update({ wh, loc: wh && loc?.warehouseId !== wh ? null : scope.locationId ?? null });
          }}
        >
          <option value="">All</option>
          {warehouses.data?.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </Select>
      </Cell>
      <Cell caption="Location">
        <Select
          value={scope.locationId ?? ''}
          aria-label="Filter by location"
          className="h-full w-40 text-sm"
          onChange={(e) => {
            const loc = locations.data?.find((l) => l.id === e.target.value);
            update({ loc: loc?.id ?? null, wh: loc?.warehouseId ?? scope.warehouseId ?? null });
          }}
        >
          <option value="">All</option>
          {internal.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </Select>
      </Cell>
      <Cell caption="Category">
        <Select value={scope.categoryId ?? ''} aria-label="Filter by product category" className="h-full w-36 text-sm" onChange={(e) => update({ cat: e.target.value || null })}>
          <option value="">All</option>
          {categories.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Cell>
      {active && (
        <button type="button" onClick={clear} className="letter h-8 px-1 text-xs font-semibold text-blue hover:underline">
          Clear filters
        </button>
      )}
    </>
  );
}
