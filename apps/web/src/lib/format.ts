/** The API's APP_TIMEZONE: "late" and date filters are defined in it, so dates display in it too. */
export const APP_TIMEZONE = 'Asia/Kolkata';

const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' });

/** "26 Sept 2026"; an em dash when there's no date. */
export function formatDate(iso: string | null | undefined) {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}

const inputFormat = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD in APP_TIMEZONE, for <input type="date"> and the API's date fields. */
export function toDateInput(iso: string) {
  return inputFormat.format(new Date(iso));
}

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: APP_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "26 Sept 2026, 14:05" in APP_TIMEZONE. */
export function formatDateTime(iso: string) {
  return dateTimeFormat.format(new Date(iso));
}
