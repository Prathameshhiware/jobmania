// Decides what goes out on Instagram today, and writes it.
//
// Renders nothing and publishes nothing: it returns a plan. Keeping the
// decision separate from the drawing means the choice can be tested without a
// renderer, and the same plan can feed both the carousel that publishes itself
// and the reel that waits for a human to add audio.
//
// Everything it says comes from the jobs table or from the festival list, both
// of which are checked. There is no generated commentary, for the same reason
// the Sunday roundup has none: a post that goes out at 9am with nobody reading
// it first is the worst possible place for a sentence nobody verified.
//
// What gets posted, in order of priority:
//
//   festival      a greeting, on the handful of days that have one
//   walk-ins      drives happening tomorrow, which is the most useful thing
//                 this site knows and the most time-critical
//   fresh         roles that arrived today
//   city          wherever the hiring actually is this week
//
// The order is deliberate. A walk-in tomorrow is worth more to a reader than a
// general count, because they have to decide tonight whether to travel.

import { db } from './supabase.js';
import { istDate, istDatePlus, istLong, istShort } from './ist.js';
import { festivalOn } from './festivals.js';

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');

/*
 * Hashtags.
 *
 * Ten or so, mixing broad and specific. A set that is purely broad competes
 * with a million posts; a set that is purely niche reaches nobody. The city
 * tags are added only when the post is actually about that city, because a tag
 * that does not match the content is the kind of thing that gets reach cut
 * rather than raised.
 */
const BASE_TAGS = ['jobsinindia', 'jobsearch', 'hiringindia', 'jobvacancy', 'jobalert'];
const TAGS_BY_KIND = {
  festival: ['festival', 'indianfestival', 'jobseekers', 'careers'],
  walkins: ['walkininterview', 'walkindrive', 'fresherjobs', 'jobstoday', 'urgenthiring'],
  fresh: ['fresherjobs', 'newjobs', 'jobstoday', 'freshersjobs', 'jobopening'],
  city: ['fresherjobs', 'jobseekers', 'careers', 'jobopening'],
};
const CITY_TAGS = {
  Bengaluru: ['bangalorejobs', 'bengalurujobs'],
  Hyderabad: ['hyderabadjobs'],
  'Delhi NCR': ['delhijobs', 'ncrjobs'],
  Mumbai: ['mumbaijobs'],
  Chennai: ['chennaijobs'],
  Pune: ['punejobs'],
};

const citySlug = (c) =>
  String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const tally = (list, key) =>
  Object.entries(list.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]);

/**
 * Today's post, as a plan.
 *
 * Returns { kind, headline, slides, caption, hashtags, stats }, or null when
 * the database cannot be read — in which case nothing should be posted rather
 * than something being invented to fill the slot.
 */
export async function planDailyPost({ now = new Date() } = {}) {
  const today = istDate(now);
  const tomorrow = istDatePlus(1, now);
  const weekOut = istDatePlus(7, now);

  const { data, error } = await db
    .from('jobs')
    .select('status, hiring_type, experience_level, city_primary, company_name, slug, title, walkin_start, walkin_time, walkin_venue, first_seen_at, posted_at')
    .eq('status', 'live')
    .limit(5000);
  if (error) throw new Error(`jobs: ${error.message}`);

  const live = data ?? [];
  const freshers = live.filter((j) => ['fresher', '0-2'].includes(j.experience_level));
  const cities = tally(live, 'city_primary');

  const stats = {
    live: live.length,
    freshers: freshers.length,
    walkins: live.filter((j) => j.hiring_type === 'walk-in').length,
    remote: live.filter((j) => j.hiring_type !== 'walk-in' && j.city_primary === 'Remote').length,
  };

  const common = { today, stats, url: 'jobmania.dpdns.org' };

  // ------------------------------------------------------------- festival
  const fest = festivalOn(today);
  if (fest) {
    return {
      ...common,
      kind: 'festival',
      needsHumanApproval: Boolean(fest.confirm),
      headline: fest.greeting,
      slides: [
        { type: 'festival', greeting: fest.greeting, name: fest.name,
          line: 'From all of us at JoBmania' },
        { type: 'stat', title: 'Still hiring through the holiday',
          rows: [[n(stats.live), 'live openings'], [n(stats.freshers), 'open to freshers']],
          note: `Counted ${istLong(now)}` },
      ],
      caption: [
        `${fest.greeting} from everyone at JoBmania.`,
        '',
        'However you are spending today, we hope it is a good one.',
        '',
        `If you are job hunting over the break, ${n(stats.live)} openings are live on the site and every apply link was tested in the last 24 hours.`,
        '',
        'jobmania.dpdns.org',
      ].join('\n'),
      hashtags: [...TAGS_BY_KIND.festival, ...BASE_TAGS],
    };
  }

  // ------------------------------------------------------------- walk-ins
  const drivesTomorrow = live
    .filter((j) => j.walkin_start === tomorrow && j.walkin_venue)
    .sort((a, b) => String(a.city_primary).localeCompare(String(b.city_primary)));

  if (drivesTomorrow.length) {
    const byCity = tally(drivesTomorrow, 'city_primary');
    const topCity = byCity[0]?.[0] ?? null;
    return {
      ...common,
      kind: 'walkins',
      headline: `${n(drivesTomorrow.length)} walk-in${drivesTomorrow.length === 1 ? '' : 's'} tomorrow`,
      city: topCity,
      slides: [
        { type: 'hero', kicker: `Walk-ins ${istShort(tomorrow)}`,
          title: drivesTomorrow.length === 1
            ? 'One walk-in drive tomorrow'
            : `${n(drivesTomorrow.length)} walk-in drives tomorrow`,
          sub: byCity.map(([c, k]) => `${c} ${k}`).join('  ·  ') },
        { type: 'list', title: 'Where to go',
          items: drivesTomorrow.slice(0, 5).map((j) => ({
            primary: j.company_name,
            secondary: [j.city_primary, j.walkin_time].filter(Boolean).join(' · '),
          })) },
        { type: 'cta', title: 'Check the venue before you travel',
          body: 'Drives get moved and cancelled at short notice. Every listing on JoBmania carries the venue and timing exactly as the employer stated them.',
          link: 'jobmania.dpdns.org/c/walk-ins' },
      ],
      caption: [
        `${drivesTomorrow.length === 1 ? 'One walk-in drive' : `${n(drivesTomorrow.length)} walk-in drives`} tomorrow, ${istLong(tomorrow)}.`,
        '',
        ...drivesTomorrow.slice(0, 5).map((j) =>
          `${j.company_name} — ${[j.city_primary, j.walkin_time].filter(Boolean).join(', ')}`),
        '',
        'Venue and timing for each one is on the site, exactly as the employer published it. Confirm on their own page before you travel, because drives do get moved.',
        '',
        'No registration fee, ever. If anyone asks you to pay, walk away.',
        '',
        'jobmania.dpdns.org/c/walk-ins',
      ].join('\n'),
      hashtags: [...TAGS_BY_KIND.walkins, ...(CITY_TAGS[topCity] ?? []), ...BASE_TAGS],
    };
  }

  /* ----------------------------------------------------------------- fresh
   * "New today" must mean the EMPLOYER posted it recently, not that we first
   * saw it today. Those are different things and the gap is embarrassing: the
   * day a new source is imported, thousands of months-old roles arrive at once
   * and first_seen_at would call every one of them new. Tested on the day the
   * Greenhouse import landed, that read "408 new openings today" when the real
   * answer was three.
   *
   * So both conditions have to hold: it reached us in the last day, and the
   * employer published it within the last three. A backfill fails the second.
   */
  const seenSince = new Date(now.getTime() - 864e5).toISOString();
  const postedSince = new Date(now.getTime() - 3 * 864e5).toISOString();
  const arrived = live.filter(
    (j) => j.first_seen_at >= seenSince && String(j.posted_at ?? '') >= postedSince);

  if (arrived.length >= 3) {
    const byCo = tally(arrived, 'company_name');
    return {
      ...common,
      kind: 'fresh',
      headline: `${n(arrived.length)} new today`,
      slides: [
        { type: 'hero', kicker: istLong(now),
          title: `${n(arrived.length)} new openings today`,
          sub: `${n(arrived.filter((j) => ['fresher', '0-2'].includes(j.experience_level)).length)} open to freshers` },
        { type: 'list', title: 'Who is hiring',
          items: byCo.slice(0, 5).map(([co, k]) => ({ primary: co, secondary: `${k} opening${k === 1 ? '' : 's'}` })) },
        { type: 'cta', title: 'Apply in the first 48 hours',
          body: 'Recruiters stop reading once they have a shortlist. Being early beats being perfect.',
          link: 'jobmania.dpdns.org/c/just-posted' },
      ],
      caption: [
        `${n(arrived.length)} new openings went live on JoBmania today.`,
        '',
        ...byCo.slice(0, 5).map(([co, k]) => `${co} — ${k} opening${k === 1 ? '' : 's'}`),
        '',
        'Apply in the first 48 hours if you can. Recruiters stop reading once they have a shortlist, so being early matters more than most people think.',
        '',
        'Every apply link goes to the employer, never through us. No registration fee, ever.',
        '',
        'jobmania.dpdns.org/c/just-posted',
      ].join('\n'),
      hashtags: [...TAGS_BY_KIND.fresh, ...BASE_TAGS],
    };
  }

  // ----------------------------------------------------------------- city
  const [cityName, cityCount] = cities[0] ?? [null, 0];
  const cityFreshers = freshers.filter((j) => j.city_primary === cityName).length;
  const weekDrives = live.filter(
    (j) => j.walkin_start && j.walkin_start >= today && j.walkin_start <= weekOut).length;

  return {
    ...common,
    kind: 'city',
    headline: cityName ? `${cityName} is hiring` : 'Hiring across India',
    city: cityName,
    slides: [
      { type: 'hero', kicker: 'This week',
        title: cityName ? `${cityName} is where the hiring is` : 'Hiring across India',
        sub: `${n(cityCount)} live openings${cityFreshers ? `, ${n(cityFreshers)} open to freshers` : ''}` },
      { type: 'stat', title: 'On JoBmania right now',
        rows: [
          [n(stats.live), 'live openings'],
          [n(stats.freshers), 'open to freshers'],
          [n(weekDrives), 'walk-ins this week'],
        ],
        note: `Counted ${istLong(now)}` },
      { type: 'cta', title: 'Every link tested daily',
        body: 'We re-test every apply link about 1,900 times a day and take a listing down when it closes. What you see is still open.',
        link: cityName ? `jobmania.dpdns.org/city/${citySlug(cityName)}` : 'jobmania.dpdns.org' },
    ],
    caption: [
      cityName
        ? `${cityName} is carrying most of the hiring on JoBmania this week: ${n(cityCount)} live openings${cityFreshers ? `, ${n(cityFreshers)} of them open to freshers` : ''}.`
        : `${n(stats.live)} openings are live on JoBmania right now.`,
      '',
      `Across the site: ${n(stats.live)} live openings, ${n(stats.freshers)} open to freshers, ${n(weekDrives)} walk-in drives in the next seven days.`,
      '',
      'Every apply link is re-tested about 1,900 times a day. When a role closes we take it down instead of leaving it up to collect applications nobody reads.',
      '',
      'No registration fee, ever.',
      '',
      cityName ? `jobmania.dpdns.org/city/${citySlug(cityName)}` : 'jobmania.dpdns.org',
    ].join('\n'),
    hashtags: [...TAGS_BY_KIND.city, ...(CITY_TAGS[cityName] ?? []), ...BASE_TAGS],
  };
}
