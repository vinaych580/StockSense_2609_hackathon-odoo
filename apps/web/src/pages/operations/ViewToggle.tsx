import { Kanban, List } from 'lucide-react';

import type { ListView } from '@/lib/listParams';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { view: 'list', label: 'List view', Icon: List },
  { view: 'kanban', label: 'Board view', Icon: Kanban },
] as const;

/** List or board. Tab-like, so pill-shaped, as the design system allows for tabs. */
export function ViewToggle({ view, onChange }: { view: ListView; onChange: (view: ListView) => void }) {
  return (
    <div role="group" aria-label="View" className="flex rounded-full border border-hairline p-0.5">
      {OPTIONS.map(({ view: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-label={label}
          aria-pressed={view === v}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            'flex size-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            view === v ? 'bg-elevated text-accent' : 'text-muted hover:text-fg',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
