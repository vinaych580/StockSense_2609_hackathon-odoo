import { Search, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FilterBarContextValue {
  register: (names: string[]) => () => void;
  get: (name: string) => string;
  set: (changes: Record<string, string | undefined>) => void;
}

const FilterBarContext = createContext<FilterBarContextValue | null>(null);

function useFilterBar(names: string[]) {
  const ctx = useContext(FilterBarContext);
  if (!ctx) throw new Error('Filter fields must be inside <FilterBar>');
  const key = names.join('|');
  // `key` stands in for `names`, so a new array with the same names doesn't re-register.
  useEffect(() => ctx.register(key.split('|')), [ctx, key]);
  return ctx;
}

/**
 * Filters kept in the URL, so a reload or a shared link keeps them. Compose it from the field
 * components below; Clear removes exactly the params those fields own, plus `page`.
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  const [params, setParams] = useSearchParams();
  const [names, setNames] = useState<string[]>([]);

  const register = useCallback((added: string[]) => {
    setNames((prev) => [...prev, ...added]);
    return () =>
      setNames((prev) => {
        const next = [...prev];
        for (const name of added) next.splice(next.indexOf(name), 1);
        return next;
      });
  }, []);

  const set = useCallback(
    (changes: Record<string, string | undefined>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [name, value] of Object.entries(changes)) {
            if (value) next.set(name, value);
            else next.delete(name);
          }
          // A filtered list starts again at page 1.
          next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const get = useCallback((name: string) => params.get(name) ?? '', [params]);
  const active = names.some((name) => params.get(name));
  const clear = () => set(Object.fromEntries(names.map((name) => [name, undefined])));

  const value = useMemo(() => ({ register, get, set }), [register, get, set]);

  return (
    <FilterBarContext.Provider value={value}>
      <div role="search" className={cn('flex flex-wrap items-end gap-3', className)}>
        {children}
        <Button variant="ghost" size="sm" className="text-muted" disabled={!active} onClick={clear}>
          <X />
          Clear
        </Button>
      </div>
    </FilterBarContext.Provider>
  );
}

const fieldLabel = 'eyebrow';
const controlClass =
  'h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30';

/** Free-text search, written to the URL 300ms after typing stops. */
export function FilterSearch({ name = 'search', label = 'Search', placeholder = 'Search…' }: { name?: string; label?: string; placeholder?: string }) {
  const { get, set } = useFilterBar([name]);
  const urlValue = get(name);
  const [text, setText] = useState(urlValue);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Follow the URL when it changes from outside (Clear, back button).
  useEffect(() => setText(urlValue), [urlValue]);
  useEffect(() => () => clearTimeout(pending.current), []);

  return (
    <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
      <span className={fieldLabel}>{label}</span>
      <span className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={text}
          placeholder={placeholder}
          className="pl-9"
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            clearTimeout(pending.current);
            pending.current = setTimeout(() => set({ [name]: value.trim() || undefined }), 300);
          }}
        />
      </span>
    </label>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** One choice from a list; "All" removes the param. Options come from the caller (statuses, warehouses…). */
export function FilterSelect({ name, label, options, allLabel = 'All' }: { name: string; label: string; options: FilterOption[]; allLabel?: string }) {
  const { get, set } = useFilterBar([name]);
  return (
    <label className="flex flex-col gap-1.5">
      <span className={fieldLabel}>{label}</span>
      <select value={get(name)} onChange={(e) => set({ [name]: e.target.value || undefined })} className={cn(controlClass, 'pr-8')}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A calendar-day range. The API reads YYYY-MM-DD as that whole day in APP_TIMEZONE, both ends inclusive. */
export function FilterDateRange({ from = 'dateFrom', to = 'dateTo', label = 'Date' }: { from?: string; to?: string; label?: string }) {
  const { get, set } = useFilterBar([from, to]);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={cn(fieldLabel, 'mb-1.5')}>{label}</legend>
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label={`${label} from`}
          value={get(from)}
          max={get(to) || undefined}
          onChange={(e) => set({ [from]: e.target.value || undefined })}
          className={controlClass}
        />
        <span className="text-muted">–</span>
        <input
          type="date"
          aria-label={`${label} to`}
          value={get(to)}
          min={get(from) || undefined}
          onChange={(e) => set({ [to]: e.target.value || undefined })}
          className={controlClass}
        />
      </div>
    </fieldset>
  );
}

/** An on/off filter such as Late: `?late=true` when on, no param when off. */
export function FilterToggle({ name, label }: { name: string; label: string }) {
  const { get, set } = useFilterBar([name]);
  const on = get(name) === 'true';
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={on}
      onClick={() => set({ [name]: on ? undefined : 'true' })}
      className={cn(on && 'border-accent text-accent')}
    >
      {label}
    </Button>
  );
}
