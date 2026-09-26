import { afterEach, describe, expect, it } from 'vitest';
import { addDays, businessDay, businessDayStart } from '../src/lib/time';
import { dayAt } from '../src/seed/stock';

const machineTz = process.env.TZ;
afterEach(() => {
  if (machineTz === undefined) delete process.env.TZ;
  else process.env.TZ = machineTz;
});

describe('seed dates', () => {
  it('schedules on business days in APP_TIMEZONE, whatever the machine time zone', () => {
    process.env.TZ = 'America/New_York';
    const d = dayAt(-1, 9);
    expect(businessDay(d)).toBe(addDays(businessDay(new Date()), -1));
    expect(d.getTime() - businessDayStart(businessDay(d)).getTime()).toBe(9 * 3600_000);
  });
});
