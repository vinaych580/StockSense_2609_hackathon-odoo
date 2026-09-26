/** Controls in the drawing's grammar: square, ink-ruled, lettered in caps. The next action is highlighted. */
import * as Dialog from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, X } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const button = cva(
  'letter inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,color,border-color,transform] duration-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The checker's highlighter: the one step forward. */
        primary: 'border border-ink bg-yellow text-ink hover:bg-yellow-2',
        secondary: 'border border-ink bg-sheet text-ink hover:bg-sheet-2',
        ghost: 'text-ink-2 hover:text-blue',
        danger: 'border border-red text-red hover:bg-red-wash',
        link: 'normal-case tracking-normal font-medium text-blue underline decoration-1 hover:decoration-2 [font-family:var(--font-sans)]',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} type={asChild ? undefined : type} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

const control =
  'w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3 disabled:text-ink-3 disabled:cursor-not-allowed';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, 'h-7', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'min-h-16 resize-y py-1', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      control,
      'h-7 cursor-pointer appearance-none bg-[length:10px] bg-[right_2px_center] bg-no-repeat pr-5',
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='%2315181a'/%3E%3C/svg%3E\")]",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

/**
 * A form field drawn as a title-block cell: caption in the corner, value written below.
 * Put fields in a <FieldGrid> so neighbouring cells share their rules.
 */
export function Field({ label, htmlFor, error, hint, children, className }: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative -ml-px -mt-px min-w-0 border border-ink px-3 pb-1 pt-1.5 focus-within:z-10 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-blue',
        error && 'z-[5] border-red',
        className,
      )}
    >
      <label htmlFor={htmlFor} className={cn('letter block text-2xs font-semibold', error ? 'text-red' : 'text-ink-3')}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="pb-0.5 text-sm text-red">{error}</p>
      ) : hint ? (
        <p className="pb-0.5 text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid pl-px pt-px', className)}>{children}</div>;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('letter inline-flex h-5 min-w-5 items-center justify-center border border-current px-1 text-2xs leading-none tracking-normal', className)}>
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('hatch animate-pulse opacity-60', className)} aria-hidden />;
}

/** Nothing to show: a lettered note on the sheet, with a way forward. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 border border-dashed border-ink-3 px-5 py-6">
      <p className="letter text-md font-bold">{title}</p>
      {children && <p className="max-w-prose text-ink-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A lettered note in the margin: a problem stated plainly, and what to do about it. */
export function Note({ tone = 'ink', title, children, actions, role = 'status' }: {
  tone?: 'ink' | 'red';
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div role={role} className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border px-4 py-3', tone === 'red' ? 'border-red bg-red-wash' : 'border-ink bg-sheet-2')}>
      <div className="max-w-[75ch]">
        <p className={cn('letter font-bold', tone === 'red' && 'text-red')}>{title}</p>
        {children && <div className="mt-0.5 text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Tabs drawn as a row of ruled cells; the chosen one is inked solid. */
export function Tabs<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: ReactNode; count?: number; alarm?: boolean }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap pl-px pt-px">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={cn(
              'letter relative -ml-px -mt-px flex h-8 items-center gap-2 border border-ink px-3 text-xs font-semibold transition-colors',
              on ? 'z-[1] bg-ink text-sheet' : 'bg-sheet text-ink-2 hover:bg-sheet-2 hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn('tracking-normal', on ? 'text-sheet/70' : o.alarm && o.count > 0 ? 'font-bold text-red' : 'text-ink-3')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A search box lettered like a title-block cell. */
export function SearchCell({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="flex h-8 w-full max-w-72 items-center gap-2 border border-ink bg-sheet px-2.5 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-blue">
      <span className="letter text-2xs font-semibold text-ink-3">Find</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
      />
    </label>
  );
}

export function Pager({ page, pages, onPage, prev = 'Previous', next = 'Next' }: { page: number; pages: number; onPage: (p: number) => void; prev?: string; next?: string }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{prev}</Button>
      <span className="letter px-2 text-xs text-ink-2">Page {page} of {pages}</span>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{next}</Button>
    </div>
  );
}

/**
 * A detail sheet laid over the right edge: edit and create forms live here, so the sheet
 * underneath stays in view. Radix handles focus and Escape.
 */
export function DetailPanel({ open, onOpenChange, detail, title, children, footer, wide }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 [animation:ink-in_.15s_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l-2 border-ink bg-sheet [animation:slide-in_.22s_cubic-bezier(.16,1,.3,1)]',
            wide ? 'max-w-3xl' : 'max-w-xl',
          )}
        >
          <div className="flex border-b-2 border-ink">
            <div className="flex w-24 shrink-0 flex-col justify-between border-r border-ink px-3 py-2">
              <span className="letter text-2xs text-ink-3">Detail</span>
              <span className="letter text-lg font-bold leading-none">{detail}</span>
            </div>
            <Dialog.Title className="flex-1 self-center px-4 py-3 text-xl font-semibold leading-tight">{title}</Dialog.Title>
            <Dialog.Close className="flex w-12 items-center justify-center border-l border-ink text-ink-2 hover:bg-sheet-2 hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center gap-2 border-t-2 border-ink bg-sheet-2 px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirm before an irreversible step. */
export function Confirm({ open, onOpenChange, title, children, confirmLabel, onConfirm, loading, danger }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[18vh] z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 border-2 border-ink bg-sheet [animation:drop-in_.18s_ease-out]"
        >
          <Dialog.Title className="border-b border-ink px-5 py-3 text-lg font-semibold">{title}</Dialog.Title>
          <div className="px-5 py-4 text-ink-2">{children}</div>
          <div className="flex justify-end gap-2 border-t border-ink bg-sheet-2 px-5 py-3">
            <Dialog.Close asChild>
              <Button>Keep it</Button>
            </Dialog.Close>
            <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
