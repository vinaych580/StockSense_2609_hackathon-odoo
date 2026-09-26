/** Business time zone for "late": scheduled before today, in APP_TIMEZONE, and not Done or Canceled. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Asia/Kolkata';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, timeZoneName: 'longOffset' });

/** YYYY-MM-DD of an instant, in the business time zone. */
export function businessDay(d: Date): string {
  return dayFormat.format(d);
}

export function isLate(scheduledDate: Date | null, status: string, now = new Date()): boolean {
  if (!scheduledDate || status === 'DONE' || status === 'CANCELED') return false;
  return businessDay(scheduledDate) < businessDay(now);
}

/** YYYY-MM-DD plus n calendar days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Midnight at the start of a business day (YYYY-MM-DD), as an instant. */
export function businessDayStart(day: string): Date {
  // The zone's offset on that day (read at noon UTC, well clear of any midnight DST change).
  const name = offsetFormat.formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return new Date(`${day}T00:00:00${m ? `${m[1]}:${m[2] ?? '00'}` : 'Z'}`);
}

/** Midnight today in the business time zone, as an instant. "Late" means scheduled before this. */
export function startOfBusinessDay(now = new Date()): Date {
  return businessDayStart(businessDay(now));
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive lower bound of a dateFrom filter: a calendar day starts at its business midnight; an ISO instant is exact. */
export function filterStart(value: string): Date {
  return CALENDAR_DAY.test(value) ? businessDayStart(value) : new Date(value);
}

/**
 * Exclusive upper bound of a dateTo filter: a calendar day runs to the next business midnight;
 * an ISO instant includes itself (timestamps are stored to the millisecond).
 */
export function filterEnd(value: string): Date {
  return CALENDAR_DAY.test(value) ? businessDayStart(addDays(value, 1)) : new Date(new Date(value).getTime() + 1);
}
