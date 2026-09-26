/** Business-day helpers. The expectations assume APP_TIMEZONE=Asia/Kolkata (UTC+05:30), as in .env.example. */
import { describe, expect, it } from 'vitest';
import { addDays, businessDayStart, filterEnd, filterStart, startOfBusinessDay } from '../src/lib/time';

describe('business time', () => {
  it('starts a business day at midnight in APP_TIMEZONE', () => {
    expect(businessDayStart('2026-09-26').toISOString()).toBe('2026-09-25T18:30:00.000Z');
    expect(startOfBusinessDay(new Date('2026-09-26T20:00:00Z')).toISOString()).toBe('2026-09-26T18:30:00.000Z');
  });

  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('reads a calendar-day filter as the whole business day, and an instant as itself', () => {
    expect(filterStart('2026-09-26').toISOString()).toBe('2026-09-25T18:30:00.000Z');
    expect(filterEnd('2026-09-26').toISOString()).toBe('2026-09-26T18:30:00.000Z');
    expect(filterStart('2026-09-26T10:00:00Z').toISOString()).toBe('2026-09-26T10:00:00.000Z');
    // Upper bounds are exclusive; an instant includes itself (timestamps have millisecond precision).
    expect(filterEnd('2026-09-26T10:00:00Z').toISOString()).toBe('2026-09-26T10:00:00.001Z');
  });
});
