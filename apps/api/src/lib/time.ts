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
