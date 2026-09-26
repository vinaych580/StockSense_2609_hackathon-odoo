/** Business time zone for "late": scheduled before today, in APP_TIMEZONE, and not Done or Canceled. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Asia/Kolkata';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD of an instant, in the business time zone. */
export function businessDay(d: Date): string {
  return dayFormat.format(d);
}

export function isLate(scheduledDate: Date | null, status: string, now = new Date()): boolean {
  if (!scheduledDate || status === 'DONE' || status === 'CANCELED') return false;
  return businessDay(scheduledDate) < businessDay(now);
}

/** Midnight today in the business time zone, as an instant. "Late" means scheduled before this. */
export function startOfBusinessDay(now = new Date()): Date {
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = offset.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return new Date(`${businessDay(now)}T00:00:00${m ? `${m[1]}:${m[2] ?? '00'}` : 'Z'}`);
}
