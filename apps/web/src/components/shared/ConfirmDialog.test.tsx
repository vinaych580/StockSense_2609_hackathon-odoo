import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';

import { ConfirmDialog } from './ConfirmDialog';

function setup(onConfirm: () => void | Promise<unknown>) {
  render(
    <ConfirmDialog
      title="Validate WH1/OUT/00004?"
      effect="Stock of 3 products will decrease at WH1/Stock."
      confirmLabel="Validate"
      onConfirm={onConfirm}
      trigger={<Button>Validate…</Button>}
    />,
  );
  return userEvent.setup();
}

describe('ConfirmDialog', () => {
  it('opens from the trigger with the title and effect, and Cancel closes it', async () => {
    const onConfirm = vi.fn();
    const user = setup(onConfirm);

    await user.click(screen.getByRole('button', { name: 'Validate…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Validate WH1/OUT/00004?' });
    expect(dialog).toHaveAccessibleDescription('Stock of 3 products will decrease at WH1/Stock.');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a loading state until onConfirm resolves, then closes', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const user = setup(onConfirm);

    await user.click(screen.getByRole('button', { name: 'Validate…' }));
    await user.click(await screen.findByRole('button', { name: 'Validate' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    resolve();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('stays open and shows the error when onConfirm rejects', async () => {
    const user = setup(() =>
      Promise.reject(new ApiError(409, { code: 'STALE_VERSION', message: 'Someone else changed this. Reload.' })),
    );

    await user.click(screen.getByRole('button', { name: 'Validate…' }));
    await user.click(await screen.findByRole('button', { name: 'Validate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this. Reload.');
    expect(screen.getByRole('button', { name: 'Validate' })).toBeEnabled();
  });
});
