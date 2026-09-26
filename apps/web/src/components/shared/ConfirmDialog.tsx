import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api';

export interface ConfirmDialogProps {
  title: string;
  /** What will happen, in plain words: "Stock of 3 products will decrease at WH1/Stock." */
  effect: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** A returned promise keeps the dialog open and busy until it settles; a rejection is shown inline. */
  onConfirm: () => void | Promise<unknown>;
  /** Uncontrolled: the element that opens the dialog. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDialog({
  title,
  effect,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  trigger,
  open: openProp,
  onOpenChange,
}: ConfirmDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const open = openProp ?? openState;

  const setOpen = (next: boolean) => {
    if (pending) return; // no closing mid-request
    if (!next) setError(undefined);
    setOpenState(next);
    onOpenChange?.(next);
  };

  const confirm = async () => {
    setError(undefined);
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      setOpenState(false);
      onOpenChange?.(false);
    } catch (e) {
      setPending(false);
      setError(isApiError(e) || e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent onEscapeKeyDown={(e) => pending && e.preventDefault()}>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription className="rounded-lg border border-hairline bg-elevated px-3 py-2 text-fg">
          {effect}
        </AlertDialogDescription>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={pending}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          {/* Not AlertDialogAction: that closes at once, and this waits for onConfirm. */}
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} disabled={pending} onClick={() => void confirm()}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
