// Indian festival dates, for the daily social post.
//
// READ THIS BEFORE TRUSTING ANY DATE HERE.
//
// All 16 dates below were reviewed and approved by the site owner on
// 9 October 2026. That approval covers the list as it stands; a date added
// later has not been reviewed and should be treated as provisional until it
// is.
//
// Nothing in this file is calculated. Every date was looked up and is recorded
// with the source it came from, because most Indian festivals follow a lunar
// calendar and move by a week or more each year. A greeting posted on the wrong
// day is worse than no greeting, so a date that cannot be sourced is not added.
//
// Three cautions:
//
//   1. Eid dates depend on local moon sighting and are confirmed only a day or
//      two ahead. The dates below are the widely published expectations, not
//      certainties. `confirm: true` marks these: the post is prepared but held
//      for a human rather than published automatically.
//   2. Lunar festivals shift every year. This list covers to late 2027 and must
//      be reviewed and extended before it runs out, not quietly left to expire.
//   3. Regional festivals differ by state. Onam matters in Kerala, Pongal in
//      Tamil Nadu, Bihu in Assam. The list below is deliberately national; add
//      regional ones only if the audience justifies it.
//
// Sources used, all consulted on 3 October 2026:
//   https://globalholidayscalendar.com/countries/india/2026
//   https://globalholidayscalendar.com/countries/india/2027
//   https://www.timeanddate.com/holidays/india/2027
//   https://publicholidays.in/janmashtami/
//   https://www.drikpanchang.com/calendars/indian/indiancalendar.html?year=2027
//
// These are calendar and holiday publishers, not the Government of India
// gazette. For anything load-bearing, check the DoPT list for the year.

/**
 * @typedef {object} Festival
 * @property {string} date      YYYY-MM-DD, Indian calendar date
 * @property {string} name      as a reader would say it
 * @property {string} greeting  what the post actually says
 * @property {boolean} [confirm] true when the date is not yet certain, so the
 *                               post is prepared but never auto-published
 * @property {boolean} [fixed]  true for solar/civil dates that do not move
 */

/** @type {Festival[]} */
export const FESTIVALS = [
  // ---------------------------------------------------------------- 2026
  { date: '2026-10-20', name: 'Dussehra',        greeting: 'Happy Dussehra' },
  { date: '2026-11-08', name: 'Diwali',          greeting: 'Happy Diwali' },
  { date: '2026-12-25', name: 'Christmas',       greeting: 'Merry Christmas', fixed: true },

  // ---------------------------------------------------------------- 2027
  { date: '2027-01-01', name: 'New Year',        greeting: 'Happy New Year', fixed: true },
  { date: '2027-01-14', name: 'Makar Sankranti', greeting: 'Happy Makar Sankranti' },
  { date: '2027-01-26', name: 'Republic Day',    greeting: 'Happy Republic Day', fixed: true },
  { date: '2027-03-10', name: 'Eid al-Fitr',     greeting: 'Eid Mubarak', confirm: true },
  { date: '2027-03-23', name: 'Holi',            greeting: 'Happy Holi' },
  { date: '2027-04-15', name: 'Ram Navami',      greeting: 'Happy Ram Navami' },
  { date: '2027-05-01', name: 'Labour Day',      greeting: 'Happy Labour Day', fixed: true },
  { date: '2027-08-15', name: 'Independence Day', greeting: 'Happy Independence Day', fixed: true },
  { date: '2027-08-17', name: 'Raksha Bandhan',  greeting: 'Happy Raksha Bandhan' },
  { date: '2027-08-24', name: 'Janmashtami',     greeting: 'Happy Janmashtami' },
  { date: '2027-10-02', name: 'Gandhi Jayanti',  greeting: 'Remembering Gandhiji', fixed: true },
  { date: '2027-10-29', name: 'Diwali',          greeting: 'Happy Diwali' },
  { date: '2027-12-25', name: 'Christmas',       greeting: 'Merry Christmas', fixed: true },
];

/** The festival on this Indian date, or null. */
export function festivalOn(istDate) {
  return FESTIVALS.find((f) => f.date === istDate) ?? null;
}

/**
 * True when the list is running low and needs extending.
 *
 * A festival calendar that quietly runs out is the kind of failure nobody
 * notices until a year of greetings has silently not been posted.
 */
export function needsExtending(istDate, withinDays = 90) {
  const last = FESTIVALS.at(-1)?.date;
  if (!last) return true;
  return (new Date(last) - new Date(istDate)) / 864e5 < withinDays;
}
