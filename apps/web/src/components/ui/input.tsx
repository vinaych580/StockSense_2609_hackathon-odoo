import type * as React from 'react';

import { cn } from '@/lib/utils';

// shadcn new-york input, adapted: 8px radius, hairline border, accent focus ring, no shadow.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-hairline bg-canvas px-3 py-1 text-sm text-foreground transition-colors outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30',
        'aria-invalid:border-danger aria-invalid:ring-danger/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
