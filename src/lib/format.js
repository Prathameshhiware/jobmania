// Display helpers. Every one of these returns null or an empty string when the
// underlying value is absent — nothing here invents a default.

export const CATEGORIES = [
  { slug: 'just-posted',  label: 'Just Posted',  facet: {} },
  { slug: 'freshers',     label: 'Freshers',     facet: { level: 'fresher' } },
  { slug: 'experienced',  label: 'Experienced',  facet: { level: '2-5' } },
  { slug: 'remote',       label: 'Remote',       facet: { remote: true } },
  { slug: 'walk-ins',     label: 'Walk-ins',     facet: { hiringType: 'walk-in' } },
  { slug: 'internships',  label: 'Internships',  facet: { hiringType: 'internship' } },
  { slug: 'off-campus',   label: 'Off-campus',   facet: { hiringType: 'off-campus' } },
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
