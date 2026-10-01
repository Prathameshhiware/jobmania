// Indian Standard Time, which is the only clock this site has.
//
// Everything here serves people looking for work in India. They travel to
// walk-in drives on specific mornings, so a date that is off by one is not a
// cosmetic bug for them.
//
// The trap this module exists to close: JavaScript derives a calendar date from
// an instant using whatever timezone it happens to be running in, and on Vercel
// that is UTC. Between midnight and 05:30 IST the UTC date is still yesterday,
// so for five and a half hours every night a post gets yesterday's slug, the
// homepage counts yesterday's arrivals as today's, and a listing shows a date
// one day before the employer posted it. All of that is invisible from a desk
// in India during the working day, which is exactly what makes it dangerous.
//
// Absolute instants compared against each other need none of this. An ISO
// timestamp in a `lt()` filter is a moment in time, not a date, and converting
// it would be the opposite mistake.

export const TZ = 'Asia/Kolkata';

/**
 * The calendar date in India, as YYYY-MM-DD.
 * en-CA is the locale that formats that way; it is a formatting trick, not a
 * statement about Canada.
 */
export const istDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d instanceof Date ? d : new Date(d));

/** The instant today began in India, for comparing against timestamps. */
export const istMidnight = (d = new Date()) => new Date(`${istDate(d)}T00:00:00+05:30`);

/** YYYY-MM-DD, `days` from now, in India. */
export const istDatePlus = (days, from = new Date()) =>
  istDate(new Date(from.getTime() + days * 864e5));

/** "2 October 2026" */
export const istLong = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
  });

/** "2 Oct" */
export const istShort = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ });

/** "2 October 2026, 10:00 am" — for anything that needs the time of day too. */
export const istDateTime = (d) =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
