import { LOCATION_RULES, type OperationType } from '@stocksense/shared';
import { Lock } from 'lucide-react';
import type * as React from 'react';

import { useInternalLocationGroups } from '@/lib/masterDataStub';
import { cn } from '@/lib/utils';

const FIXED_LABEL = { VENDOR: 'Vendors', CUSTOMER: 'Customers', ADJUSTMENT: 'Inventory adjustment' } as const;

type Props = Omit<React.ComponentProps<'select'>, 'value' | 'onChange'> & {
  type: OperationType;
  end: 'source' | 'dest';
  value: string;
  onChange: (locationId: string) => void;
};

/**
 * The location types LOCATION_RULES allows at this end. A virtual end is one fixed location, shown read-only
 * (its id is already in the form); an internal end is a choice of warehouse locations.
 */
export function LocationSelect({ type, end, value, onChange, className, ...props }: Props) {
  const groups = useInternalLocationGroups();
  const locationType = LOCATION_RULES[type][end];

  if (locationType !== 'INTERNAL') {
    return (
      <div
        id={props.id}
        role="textbox"
        aria-readonly="true"
        aria-label={props['aria-label']}
        className="flex h-9 items-center gap-2 rounded-lg border border-hairline bg-elevated px-3 text-sm text-muted"
      >
        <Lock aria-hidden className="size-3.5" />
        {FIXED_LABEL[locationType]}
      </div>
    );
  }

  return (
    <select
      {...props}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-foreground outline-none',
        'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-danger',
        !value && 'text-muted',
        className,
      )}
    >
      <option value="">Choose a location</option>
      {groups.map(({ warehouse, locations }) => (
        <optgroup key={warehouse.value} label={warehouse.label}>
          {locations.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
