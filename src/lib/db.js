// Read side. Uses the ANON key: RLS restricts it to status = 'live', so the
// site physically cannot serve an expired or unreviewed listing even if a query
// forgets to filter. The service_role key never touches the website.

import { createClient } from '@supabase/supabase-js';
import { istMidnight, istDatePlus } from './ist.js';

const env = (k) => import.meta.env?.[k] ?? process.env?.[k];

// Created on first query rather than at import, so a missing variable surfaces
// as a clear error on the request instead of failing the build.
let client = null;
function conn() {
  if (client) return client;
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_ANON_KEY. ' +
      'Local: add them to .env.local. Vercel: add them as Environment Variables. ' +
      'Use the ANON key here, never service_role — this one is served to the public site.'
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const sb = new Proxy({}, { get: (_, prop) => conn()[prop] });


/*
 * Everything a visitor may see, named explicitly.
 *
 * Five columns are deliberately absent: dedupe_key, source, source_uid,
 * source_url and description_source. Those record where a listing came from,
 * which is ours and not the reader's business — and once db/012 restricts the
 * anon role to this list at the database level, a select('*') here would fail
 * outright rather than quietly leaking them.
 *
 * Keep this in step with the grant in db/012-hide-sources.sql. A column added
 * to the table and wanted on the page has to be added in both places.
 */
const PUBLIC_COLUMNS = [
  'id', 'short_id', 'slug', 'canonical_url',
  'first_seen_at', 'last_checked_at', 'last_verified_at',
  'company_name', 'company_slug', 'title',
  'locations', 'city_primary', 'is_remote', 'lat', 'lng',
  'exp_min', 'exp_max', 'qualification', 'eligible_batches',
  'salary_min', 'salary_max', 'salary_currency', 'salary_period',
  'hiring_type', 'experience_level', 'work_mode',
  'walkin_start', 'walkin_end', 'walkin_time', 'walkin_venue',
  'description_html', 'posted_at', 'valid_through',
  'status', 'review_reason', 'scam_flags', 'report_count',
  'apply_url', 'created_at', 'updated_at',
].join(', ');

const CARD = 'short_id, slug, company_name, company_slug, title, city_primary, is_remote, ' +
             'exp_min, exp_max, experience_level, qualification, hiring_type, work_mode, ' +
             'salary_min, salary_max, salary_currency, salary_period, ' +
             'posted_at, valid_through, last_verified_at, apply_url, ' +
             'walkin_start, walkin_end, walkin_time, walkin_venue';

const live = () => sb.from('jobs').select(CARD).eq('status', 'live');

export async function getLatest(limit = 9) {
  const { data } = await live().order('posted_at', { ascending: false }).limit(limit);
  return data ?? [];
}

/**
 * Roles with a real deadline inside the next week.
 *
 * Restricted to walk-ins with a parsed drive date, because that is the only
 * date the source actually publishes. Everything else carries our own
 * retirement timer in `valid_through`, and listing those here would announce
 * "closing this week" about a date no employer ever set.
 */
export async function getClosingSoon(limit = 5) {
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString();
  const { data } = await live()
    .eq('hiring_type', 'walk-in')
    .not('walkin_end', 'is', null)
    .lt('valid_through', in7).gt('valid_through', new Date().toISOString())
    .order('valid_through', { ascending: true }).limit(limit);
  return data ?? [];
}

/**
 * One listing by slug, live OR closed. RLS keeps unvetted rows out entirely,
 * so anything this returns is safe to render; the page decides how to present
 * a closed one. Every LIST query still filters to 'live' explicitly.
 */
export async function getJobBySlug(slug) {
  const { data } = await sb.from('jobs').select(PUBLIC_COLUMNS).eq('slug', slug).maybeSingle();
  return data ?? null;
}

/** Live alternatives to offer on a closed listing. */
export async function getAlternatives(job, limit = 3) {
  if (!job) return [];
  let q = live();
  if (job.city_primary) q = q.eq('city_primary', job.city_primary);
  const { data } = await q.order('posted_at', { ascending: false }).limit(limit);
  if (data?.length) return data;
  // nothing in that city any more — fall back to the newest anywhere
  const { data: any } = await live().order('posted_at', { ascending: false }).limit(limit);
  return any ?? [];
}

export async function getSimilar(job, limit = 4) {
  if (!job) return [];
  const { data } = await live()
    .eq('city_primary', job.city_primary)
    .neq('slug', job.slug)
    .order('posted_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getByCompany(companySlug, limit = 50) {
  const { data } = await live().eq('company_slug', companySlug)
    .order('posted_at', { ascending: false }).limit(limit);
  return data ?? [];
}

/**
 * Exact number of live rows matching a facet, without fetching them.
 * Listing queries are capped at a page size, so `rows.length` is the cap, not
 * the total — putting it in a title states a number that is not true.
 */
export async function countByFacet({ city, hiringType, level, remote } = {}) {
  let q = sb.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'live');
  if (city) q = q.eq('city_primary', city);
  if (hiringType) q = q.eq('hiring_type', hiringType);
  if (level) q = q.eq('experience_level', level);
  if (remote) q = q.eq('is_remote', true);
  const { count } = await q;
  return count ?? 0;
}

export async function getByFacet({ city, hiringType, level, remote } = {}, limit = 60) {
  let q = live();
  if (city) q = q.eq('city_primary', city);
  if (hiringType) q = q.eq('hiring_type', hiringType);
  if (level) q = q.eq('experience_level', level);
  if (remote) q = q.eq('is_remote', true);
  const { data } = await q.order('posted_at', { ascending: false }).limit(limit);
  return data ?? [];
}

/** One pass over the live set: counts for every facet the nav and home need. */
export async function getFacets() {
  const { data } = await sb.from('jobs')
    .select('city_primary, hiring_type, experience_level, company_name, company_slug, is_remote, first_seen_at, walkin_start')
    .eq('status', 'live');

  const rows = data ?? [];
  const tally = (key) => rows.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {});
  const sorted = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  // Midnight in India. setHours() would use the server's timezone, which on
  // Vercel is UTC, so "added today" on the homepage silently meant "added since
  // 05:30 this morning" and read zero for the first hours of every Indian day.
  const midnight = istMidnight();
  const weekEnd = istDatePlus(7);

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
    cities: sorted(tally('city_primary')),
    types: tally('hiring_type'),
    levels: tally('experience_level'),
    companies: Object.values(companies).sort((a, b) => b.n - a.n),
  };
}

/**
 * Roles that have closed, most recently first. This is the evidence behind the
 * freshness claim: anyone can say they remove dead listings, and this is the
 * page that shows it happening. Carries `status` and `review_reason` so a card
 * can say *why* each one went — finished drive, passed deadline, or an apply
 * link that stopped responding.
 */
export async function getRecentlyClosed(limit = 40, offset = 0) {
  const { data } = await sb
    .from('jobs')
    .select(`${CARD}, status, review_reason, last_checked_at`)
    .in('status', ['expired', 'dead_link'])
    .order('valid_through', { ascending: false })
    .range(offset, offset + limit - 1);
  return data ?? [];
}

/**
 * Real totals across every closed row, not a tally of whichever page happens
 * to be on screen. A figure beside the word "total" has to be one.
 */
export async function closedBreakdown() {
  const n = async (f) => {
    let q = sb.from('jobs').select('id', { count: 'exact', head: true });
    const { count } = await f(q);
    return count ?? 0;
  };
  const [total, deadLinks, finishedDrives] = await Promise.all([
    n((q) => q.in('status', ['expired', 'dead_link'])),
    n((q) => q.eq('status', 'dead_link')),
    n((q) => q.eq('status', 'expired').eq('hiring_type', 'walk-in')),
  ]);
  return { total, deadLinks, finishedDrives, deadlinePassed: total - deadLinks - finishedDrives };
}

/** Every live slug, for the sitemap. */
export async function getAllLive() {
  const { data } = await sb.from('jobs')
    .select('slug, company_slug, city_primary, hiring_type, posted_at, updated_at')
    .eq('status', 'live').order('posted_at', { ascending: false }).limit(5000);
  return data ?? [];
}

/**
 * PostgREST builds `.or()` from a filter STRING, so raw user input landing in
 * it is an injection vector: `(`, `)`, `,` and `.` are all syntax there, and a
 * crafted query could append conditions of its own. RLS would still confine the
 * result to publishable rows, but a filter must never be assembled from
 * unvalidated input.
 *
 * So the term is reduced to an allowlist — letters, digits, spaces and the few
 * punctuation marks that appear in real company and role names — and capped in
 * length. Every PostgREST metacharacter is outside that set.
 */
export function sanitizeSearchTerm(q) {
  return String(q ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} '&+/-]/gu, ' ')   // allowlist, not blocklist
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export async function search(q, limit = 60) {
  const term = sanitizeSearchTerm(q);
  if (term.length < 2) return [];
  const { data } = await live()
    .or(`title.ilike.%${term}%,company_name.ilike.%${term}%,city_primary.ilike.%${term}%`)
    .order('posted_at', { ascending: false }).limit(limit);
  return data ?? [];
}
