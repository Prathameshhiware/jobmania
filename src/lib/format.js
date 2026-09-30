// Display helpers. Every one of these returns null or an empty string when the
// underlying value is absent — nothing here invents a default.

// `label` is the UI word. `phrase` is the SEO one — written the way this market
// actually types the query, which is rarely the way a nav label reads. Nobody
// searches "walk-ins jobs in hyderabad"; they search "walk in interview in
// hyderabad". The phrase drives the <title> and meta description.
// `label`  — the UI word, used in nav and headings.
// `phrase` — the SEO noun phrase, written the way this market types the query.
//            Already a complete noun phrase, so nothing is appended to it.
// `detail` — one clause that makes each meta description specific to the
//            category rather than boilerplate shared across all of them.
export const CATEGORIES = [
  { slug: 'just-posted', label: 'Just Posted', phrase: 'Latest Jobs',         facet: {},
    detail: 'Newest first, so the top of the page is what arrived in the last few hours.' },
  { slug: 'freshers',    label: 'Freshers',    phrase: 'Fresher Jobs',        facet: { level: 'fresher' },
    detail: 'Open to candidates with no prior experience, including trainee and graduate roles.' },
  { slug: 'experienced', label: 'Experienced', phrase: 'Experienced Jobs',    facet: { level: '2-5' },
    detail: 'For candidates with a few years behind them rather than a clean slate.' },
  { slug: 'remote',      label: 'Remote',      phrase: 'Work From Home Jobs', facet: { remote: true },
    detail: 'Fully remote roles hiring from anywhere in India.' },
  { slug: 'walk-ins',    label: 'Walk-ins',    phrase: 'Walk In Interviews',  facet: { hiringType: 'walk-in' },
    detail: 'Venue, date and timing are shown where the employer published them. Confirm before you travel.' },
  { slug: 'internships', label: 'Internships', phrase: 'Internships',         facet: { hiringType: 'internship' },
    detail: 'Internships and apprenticeships, including pre-placement opportunities.' },
  { slug: 'off-campus',  label: 'Off-campus',  phrase: 'Off Campus Drives',   facet: { hiringType: 'off-campus' },
    detail: 'Open to graduates applying outside a college placement process.' },
];

export const citySlug = (c) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function cityFromSlug(slug, known) {
  return known.find((c) => citySlug(c) === slug) ?? null;
}

export function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function daysLeft(validThrough) {
  if (!validThrough) return null;
  return Math.ceil((new Date(validThrough).getTime() - Date.now()) / 864e5);
}

/**
 * Did the employer actually state a closing date, or is `valid_through` just
 * our own retirement timer?
 *
 * The column holds both, which is how 192 of 209 live listings ended up
 * rendering "Applications close 7 October" for a date nobody published. For a
 * walk-in it is the drive's end date, which the source does state. For
 * everything else it is posted_at + 45 days, invented so the freshness
 * constraint had something to check.
 *
 * Checked before writing this: across 40 recent source posts, none contain
 * "last date", "apply before", "closing date" or "apply by". The source does
 * not publish deadlines for online roles, so there is no real date to show and
 * the honest move is to show none — the same rule as salary, which appears
 * only when the employer stated a figure.
 *
 * Derived rather than stored: it is exactly "walk-in with a parsed drive date",
 * both of which are already on the row.
 */
export function hasStatedDeadline(job) {
  return job?.hiring_type === 'walk-in' && Boolean(job?.walkin_end);
}

export function experienceLabel(min, max) {
  if (min == null && max == null) return null;
  if (min === 0 && (max === 1 || max === 0)) return 'Fresher';
  if (max == null) return `${min}+ yr`;
  if (min === max) return `${min} yr`;
  return `${min}–${max} yr`;
}

/** Pay only when the employer stated it. Never a range we made up. */
export function salaryLabel(job) {
  const { salary_min: lo, salary_max: hi, salary_currency: cur, salary_period: per } = job ?? {};
  if (lo == null && hi == null) return null;
  const sym = cur === 'INR' ? '₹' : (cur ? `${cur} ` : '');
  const unit = per === 'YEAR' ? ' p.a.' : per === 'MONTH' ? ' /mo' : per === 'HOUR' ? ' /hr' : '';
  const n = (v) => (v >= 100000 ? `${(v / 100000).toFixed(v % 100000 ? 1 : 0)}L` : v.toLocaleString('en-IN'));
  if (lo != null && hi != null) return `${sym}${n(lo)}–${n(hi)}${unit}`;
  return `${sym}${n(lo ?? hi)}${unit}`;
}

export function locationLabel(job) {
  if (!job) return null;
  if (job.is_remote) return 'Remote, India';
  return job.city_primary ?? null;
}

export function walkinLabel(job) {
  if (!job?.walkin_start) return null;
  const d = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (job.walkin_end && job.walkin_end !== job.walkin_start) return `${d(job.walkin_start)} – ${d(job.walkin_end)}`;
  return d(job.walkin_start);
}

export const TYPE_LABEL = {
  'regular': 'Full-time', 'walk-in': 'Walk-in',
  'off-campus': 'Off-campus', 'internship': 'Internship',
};

export const LEVEL_LABEL = {
  fresher: 'Fresher', '0-2': '0–2 yr', '2-5': '2–5 yr', '5-10': '5–10 yr', '10+': '10+ yr',
};

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
