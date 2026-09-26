import { OPERATION_STATUSES } from '@stocksense/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('gives every status its own label and tone', () => {
    render(
      <>
        {OPERATION_STATUSES.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </>,
    );
    const expected = { Draft: 'draft', Waiting: 'waiting', Ready: 'ready', Done: 'done', Canceled: 'canceled' };
    for (const [label, tone] of Object.entries(expected)) {
      const badge = screen.getByText(label);
      expect(badge).toHaveAttribute('data-tone', tone);
      expect(badge).toHaveClass('rounded-full');
    }
  });

  it('uses the functional colours for waiting, done and canceled', () => {
    render(
      <>
        <StatusBadge status="WAITING" />
        <StatusBadge status="DONE" />
        <StatusBadge status="CANCELED" />
      </>,
    );
    expect(screen.getByText('Waiting')).toHaveClass('text-warning');
    expect(screen.getByText('Done')).toHaveClass('text-success');
    expect(screen.getByText('Canceled')).toHaveClass('text-danger');
  });
});
