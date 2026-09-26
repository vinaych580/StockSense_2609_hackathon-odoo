import { ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import type { ProductOption } from '@/lib/masterDataStub';
import { cn } from '@/lib/utils';

interface Props {
  products: ProductOption[];
  value: string;
  onChange: (productId: string) => void;
  /** productId → line number, for products already used on other lines. */
  takenBy?: Map<string, number>;
  /** Archived products are hidden unless this is set (e.g. to show an existing line's product). */
  includeArchived?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const label = (p: ProductOption) => `${p.sku} · ${p.name}`;

/** Search products by SKU or name. A small ARIA combobox: type, arrow keys, Enter, Escape. */
export function ProductCombobox({ products, value, onChange, takenBy, includeArchived = false, id, ...aria }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = products.find((p) => p.id === value);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const q = text.trim().toLowerCase();
    return products.filter(
      (p) => (includeArchived || p.isActive || p.id === value) && (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)),
    );
  }, [products, text, includeArchived, value]);

  const isTaken = (p: ProductOption) => p.id !== value && !!takenBy?.has(p.id);
  // The highlight skips products that are already on another line.
  const firstEnabled = (list: ProductOption[]) => Math.max(0, list.findIndex((p) => !isTaken(p)));

  const choose = (p: ProductOption | undefined) => {
    if (!p || isTaken(p)) return;
    onChange(p.id);
    setOpen(false);
    setText('');
  };

  const move = (delta: number) => {
    setOpen(true);
    setActive((i) => {
      for (let step = 1; step <= options.length; step++) {
        const next = (i + delta * step + options.length * step) % options.length;
        if (!isTaken(options[next]!)) return next;
      }
      return i;
    });
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
        {...aria}
        autoComplete="off"
        placeholder="Search SKU or name"
        value={open ? text : selected ? label(selected) : ''}
        onFocus={() => {
          setOpen(true);
          setActive(firstEnabled(options));
        }}
        onBlur={() => {
          setOpen(false);
          setText('');
        }}
        onChange={(e) => {
          const q = e.target.value.trim().toLowerCase();
          setText(e.target.value);
          setActive(firstEnabled(products.filter((p) => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))));
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setText('');
          }
        }}
        className={cn(
          'h-9 w-full min-w-0 rounded-lg border border-hairline bg-canvas pr-8 pl-3 text-sm text-foreground outline-none placeholder:text-muted',
          'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-danger',
        )}
      />
      <ChevronsUpDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Products"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-[18rem] overflow-y-auto rounded-lg border border-hairline bg-card p-1"
        >
          {options.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No products match "{text}".</li>}
          {options.map((p, i) => {
            const taken = isTaken(p);
            return (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={p.id === value}
                aria-disabled={taken || undefined}
                // mousedown, not click: it runs before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  i === active && !taken && 'bg-elevated',
                  taken && 'opacity-50',
                )}
              >
                <span className="ref w-14 shrink-0 text-xs text-muted">{p.sku}</span>
                <span className="flex-1 truncate">{p.name}</span>
                {taken ? (
                  <span className="text-xs text-muted">On line {takenBy!.get(p.id)}</span>
                ) : (
                  <span className="rounded-full border border-hairline px-1.5 font-mono text-[10px] text-muted">{p.uom}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
