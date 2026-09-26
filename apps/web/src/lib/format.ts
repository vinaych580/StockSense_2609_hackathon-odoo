/** The API's APP_TIMEZONE: "late" and date filters are defined in it, so dates display in it too. */
export const APP_TIMEZONE = 'Asia/Kolkata';

const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' });

/** "26 Sept 2026"; an em dash when there's no date. */
export function formatDate(iso: string | null | undefined) {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}
