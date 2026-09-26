import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusStepper } from './StatusStepper';

const steps = () => screen.getAllByRole('listitem');
const states = () => steps().map((li) => `${li.textContent}:${li.dataset.state}`);

describe('StatusStepper', () => {
  it('marks the current step and the ones before it', () => {
    render(<StatusStepper status="READY" type="DELIVERY" />);
    expect(states()).toEqual(['Draft:complete', 'Waiting:complete', '3Ready:current', '4Done:upcoming']);
    expect(screen.getByText('Ready').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('leaves out Waiting for receipts and adjustments', () => {
    render(<StatusStepper status="DRAFT" type="RECEIPT" />);
    expect(steps().map((li) => li.textContent?.replace(/\d/, ''))).toEqual(['Draft', 'Ready', 'Done']);
  });

  it('shows every step complete when Done', () => {
    render(<StatusStepper status="DONE" type="TRANSFER" />);
    expect(steps().every((li) => li.dataset.state === 'complete')).toBe(true);
  });

  it('shows a Canceled marker and mutes the steps', () => {
    render(<StatusStepper status="CANCELED" type="DELIVERY" />);
    expect(screen.getByText('Canceled').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(steps().filter((li) => li.dataset.state === 'muted')).toHaveLength(4);
  });
});
