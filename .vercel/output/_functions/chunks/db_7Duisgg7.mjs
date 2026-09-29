import { createClient } from '@supabase/supabase-js';

// Display helpers. Every one of these returns null or an empty string when the
// underlying value is absent — nothing here invents a default.

const CATEGORIES = [
  { slug: 'just-posted',  label: 'Just Posted',  facet: {} },
  { slug: 'freshers',     label: 'Freshers',     facet: { level: 'fresher' } },
  { slug: 'experienced',  label: 'Experienced',  facet: { level: '2-5' } },
  { slug: 'remote',       label: 'Remote',       facet: { remote: true } },
  { slug: 'walk-ins',     label: 'Walk-ins',     facet: { hiringType: 'walk-in' } },
  { slug: 'internships',  label: 'Internships',  facet: { hiringType: 'internship' } },
  { slug: 'off-campus',   label: 'Off-campus',   facet: { hiringType: 'off-campus' } },
];

const citySlug = (c) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function daysLeft(validThrough) {
  if (!validThrough) return null;
  return Math.ceil((new Date(validThrough).getTime() - Date.now()) / 864e5);
}

function experienceLabel(min, max) {
  if (min == null && max == null) return null;
  if (min === 0 && (max === 1 || max === 0)) return 'Fresher';
  if (max == null) return `${min}+ yr`;
  if (min === max) return `${min} yr`;
  return `${min}–${max} yr`;
}

/** Pay only when the employer stated it. Never a range we made up. */
function salaryLabel(job) {
  const { salary_min: lo, salary_max: hi, salary_currency: cur, salary_period: per } = job ?? {};
  if (lo == null && hi == null) return null;
  const sym = cur === 'INR' ? '₹' : (cur ? `${cur} ` : '');
  const unit = per === 'YEAR' ? ' p.a.' : per === 'MONTH' ? ' /mo' : per === 'HOUR' ? ' /hr' : '';
  const n = (v) => (v >= 100000 ? `${(v / 100000).toFixed(v % 100000 ? 1 : 0)}L` : v.toLocaleString('en-IN'));
  if (lo != null && hi != null) return `${sym}${n(lo)}–${n(hi)}${unit}`;
  return `${sym}${n(lo ?? hi)}${unit}`;
}

function locationLabel(job) {
  if (!job) return null;
  if (job.is_remote) return 'Remote, India';
  return job.city_primary ?? null;
}

function walkinLabel(job) {
  if (!job?.walkin_start) return null;
  const d = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (job.walkin_end && job.walkin_end !== job.walkin_start) return `${d(job.walkin_start)} – ${d(job.walkin_end)}`;
  return d(job.walkin_start);
}

const TYPE_LABEL = {
  'regular': 'Full-time', 'walk-in': 'Walk-in',
  'off-campus': 'Off-campus', 'internship': 'Internship',
};

const __vite_import_meta_env__ = {"ASSETS_PREFIX": undefined, "BASE_URL": "/", "DEV": false, "MODE": "production", "PROD": true, "SITE": "https://jobmania.vercel.app", "SSR": true};
const env = (k) => Object.assign(__vite_import_meta_env__, { SUPABASE_URL: "https://bcpzfvcuezgqjaislukq.supabase.co", SUPABASE_ANON_KEY: "", OS: process.env.OS, _: process.env._ })?.[k] ?? process.env?.[k];
let client = null;
function conn() {
  if (client) return client;
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Local: add them to .env.local. Vercel: add them as Environment Variables. Use the ANON key here, never service_role — this one is served to the public site."
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
const sb = new Proxy({}, { get: (_, prop) => conn()[prop] });
const CARD = "short_id, slug, company_name, company_slug, title, city_primary, is_remote, exp_min, exp_max, experience_level, qualification, hiring_type, work_mode, salary_min, salary_max, salary_currency, salary_period, posted_at, valid_through, last_verified_at, apply_url, walkin_start, walkin_end, walkin_time, walkin_venue";
const live = () => sb.from("jobs").select(CARD).eq("status", "live");
async function getLatest(limit = 9) {
  const { data } = await live().order("posted_at", { ascending: false }).limit(limit);
  return data ?? [];
}
async function getClosingSoon(limit = 5) {
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString();
  const { data } = await live().lt("valid_through", in7).gt("valid_through", (/* @__PURE__ */ new Date()).toISOString()).order("valid_through", { ascending: true }).limit(limit);
  return data ?? [];
}
async function getJobBySlug(slug) {
  const { data } = await sb.from("jobs").select("*").eq("slug", slug).eq("status", "live").maybeSingle();
  return data ?? null;
}
async function getSimilar(job, limit = 4) {
  if (!job) return [];
  const { data } = await live().eq("city_primary", job.city_primary).neq("slug", job.slug).order("posted_at", { ascending: false }).limit(limit);
  return data ?? [];
}
async function getByCompany(companySlug, limit = 50) {
  const { data } = await live().eq("company_slug", companySlug).order("posted_at", { ascending: false }).limit(limit);
  return data ?? [];
}
async function getByFacet({ city, hiringType, level, remote } = {}, limit = 60) {
  let q = live();
  if (city) q = q.eq("city_primary", city);
  if (hiringType) q = q.eq("hiring_type", hiringType);
  if (level) q = q.eq("experience_level", level);
  if (remote) q = q.eq("is_remote", true);
  const { data } = await q.order("posted_at", { ascending: false }).limit(limit);
  return data ?? [];
}
async function getFacets() {
  const { data } = await sb.from("jobs").select("city_primary, hiring_type, experience_level, company_name, company_slug, is_remote, first_seen_at, walkin_start").eq("status", "live");
  const rows = data ?? [];
  const tally = (key) => rows.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {});
  const sorted = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const midnight = /* @__PURE__ */ new Date();
  midnight.setHours(0, 0, 0, 0);
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const companies = rows.reduce((a, r) => {
    if (!r.company_slug) return a;
    a[r.company_slug] ??= { slug: r.company_slug, name: r.company_name, n: 0 };
    a[r.company_slug].n++;
    return a;
  }, {});
  return {
    total: rows.length,
    addedToday: rows.filter((r) => new Date(r.first_seen_at) >= midnight).length,
    walkinsThisWeek: rows.filter((r) => r.walkin_start && r.walkin_start <= weekEnd).length,
    remote: rows.filter((r) => r.is_remote).length,
    cities: sorted(tally("city_primary")),
    types: tally("hiring_type"),
    levels: tally("experience_level"),
    companies: Object.values(companies).sort((a, b) => b.n - a.n)
  };
}
async function getAllLive() {
  const { data } = await sb.from("jobs").select("slug, company_slug, city_primary, hiring_type, posted_at, updated_at").eq("status", "live").order("posted_at", { ascending: false }).limit(5e3);
  return data ?? [];
}
async function search(q, limit = 60) {
  if (!q) return [];
  const term = q.trim().replace(/[%,]/g, " ");
  const { data } = await live().or(`title.ilike.%${term}%,company_name.ilike.%${term}%,city_primary.ilike.%${term}%`).order("posted_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export { CATEGORIES as C, TYPE_LABEL as T, getByFacet as a, getFacets as b, citySlug as c, getByCompany as d, getClosingSoon as e, getJobBySlug as f, getLatest as g, getSimilar as h, experienceLabel as i, daysLeft as j, search as k, locationLabel as l, getAllLive as m, salaryLabel as s, timeAgo as t, walkinLabel as w };
