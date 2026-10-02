// Greenhouse: jobs straight from the employer's own board.
//
// This is a different kind of source from foundthejob, and the difference is
// the point. An aggregator republishes someone else's posting, so we have to
// work out who the employer is, guess the experience band out of prose, and
// test whether the link still resolves. A Greenhouse board is the employer's
// own system of record: the company is the board, the date is the date they
// published, the description is theirs, and the apply URL is on infrastructure
// they pay for. None of it can be a listing somebody invented.
//
// The whole board comes back in one request with ?content=true, which also
// gives the liveness test this project could not previously have. foundthejob
// can only be asked "does this link still 404"; a board answers the stronger
// question directly, by returning every role that is currently open. Anything
// of ours from that board which is no longer in the answer has been filled or
// withdrawn, and `missingSourceUids` is what the ingest pass uses to retire it.
//
// Fields we do not get are left empty rather than estimated. Greenhouse boards
// almost never state a salary and, measured across 1,962 postings, never state
// an application deadline — so neither is ever written. The internal
// valid_through below is an expiry backstop, not a deadline, and the site will
// not display it: hasStatedDeadline() shows a closing date only for a walk-in
// with a real drive date.

import {
  slugify, shortId, dedupeKey, stripTags, decodeEntities,
  parseLocations, isRemote, parseExperience, experienceLevel, parseBatches,
} from '../lib/normalize.js';
import { GREENHOUSE } from './boards.js';

export const SOURCE_ID = 'greenhouse';

/*
 * How old a posting may be and still be carried.
 *
 * A board lists what the company has not closed, which is not the same as what
 * the company is actively hiring for. Measured across all 25 boards: a third of
 * the India roles were published more than 90 days ago, 8% more than a year
 * ago, and the oldest was from January 2023. Those are evergreen requisitions
 * left open indefinitely, and sending someone to apply to one wastes their
 * afternoon.
 *
 * 90 days keeps about two thirds of the inventory and every posting a person
 * could reasonably expect a reply from. Raise it to carry more volume at the
 * cost of the freshness claim the rest of this site is built on.
 */
export const MAX_AGE_DAYS = 90;

const UA = 'Mozilla/5.0 (compatible; JoBmaniaBot/0.1; +https://jobmania.dpdns.org)';
const API = 'https://boards-api.greenhouse.io/v1/boards';

/*
 * India, as an employer writes it. Boards are inconsistent — "Bengaluru",
 * "Bangalore", "Remote - India", "Bengaluru, India; Pune, India" all appear in
 * real data — so the city list carries the weight rather than the word "India".
 */
const INDIA = /\b(india|bangalore|bengaluru|hyderabad|mumbai|delhi|ncr|pune|chennai|gurgaon|gurugram|noida|kolkata|ahmedabad|jaipur|indore|coimbatore|kochi|cochin|trivandrum|thiruvananthapuram|chandigarh|vadodara|nagpur|bhubaneswar|mysore|mysuru|visakhapatnam|surat|lucknow)\b/i;

/*
 * A role open in several countries lists them all in one string. Keeping the
 * whole thing would put "Dublin" on an Indian listing, so only the Indian parts
 * are kept and the rest is dropped.
 */
const indianPart = (location) =>
  String(location ?? '')
    .split(/[;|]|\s+or\s+/i)
    .map((s) => s.trim())
    .filter((s) => s && INDIA.test(s))
    .join('; ') || String(location ?? '').trim();

/**
 * Nine or ten words of a job title carry the seniority. Greenhouse has no
 * experience field, so this reads the title and nothing else — and when the
 * title says nothing, the band is left unknown rather than assumed.
 */
function experienceFromTitle(title) {
  const t = String(title ?? '');
  if (/\b(intern|internship|apprentice|trainee|graduate|new grad|campus|fresher)\b/i.test(t)) return [0, 1];
  if (/\b(junior|jr\.?|entry[- ]level|associate engineer|analyst i)\b/i.test(t)) return [0, 2];
  if (/\b(principal|distinguished|fellow|head of|director|vp|vice president|chief)\b/i.test(t)) return [10, null];
  if (/\b(staff|senior staff|lead|architect)\b/i.test(t)) return [8, null];
  if (/\b(senior|sr\.?)\b/i.test(t)) return [5, null];
  if (/\b(manager|mgr)\b/i.test(t)) return [6, null];
  return [null, null];
}

async function board(token) {
  try {
    const res = await fetch(`${API}/${token}/jobs?content=true`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body?.jobs) ? body.jobs : null;
  } catch {
    // A board that is down costs us that employer for this run, nothing more.
    return null;
  }
}

/**
 * One Greenhouse posting as a row the ingest pipeline understands.
 * Returns null for anything outside India or missing what a listing needs.
 */
export function toRow(job, company) {
  const title = decodeEntities(String(job?.title ?? '')).trim();
  const rawLocation = job?.location?.name ?? '';
  if (!title || !INDIA.test(rawLocation)) return null;

  const applyUrl = job?.absolute_url;
  if (!applyUrl) return null;

  // Stale requisitions, dropped before anything else is done with them.
  const published = new Date(job.first_published ?? job.updated_at ?? Date.now());
  if (Number.isFinite(+published) && Date.now() - +published > MAX_AGE_DAYS * 864e5) return null;

  const locationText = indianPart(rawLocation);
  /*
   * "India" and "Remote, India" name no city, and parseLocations is built to
   * find cities. Rather than show a listing with no location at all, the
   * employer's own wording is kept as the label while city_primary stays null —
   * so the role is findable without a city being invented for it.
   */
  const parsed = parseLocations(locationText);
  const locations = parsed.length ? parsed : (locationText ? [locationText] : []);
  const city = parsed[0] ?? null;
  const remote = isRemote(`${locationText} ${title}`);

  const sourceUid = String(job.id);
  const sid = shortId(SOURCE_ID, sourceUid);

  // The employer's own publication date. Never the date we found it, and never
  // refreshed when a board re-lists something: this is what goes into
  // datePosted, and Google's job guidelines are explicit that it must be real.
  const postedAt = new Date(job.first_published ?? job.updated_at ?? Date.now()).toISOString();

  const html = String(job.content ?? '');
  const text = stripTags(decodeEntities(html));

  // The title is the better signal, but a description that states years of
  // experience outright is better still.
  const fromText = parseExperience(text.slice(0, 4000));
  const [tMin, tMax] = experienceFromTitle(title);
  const min = fromText.min ?? tMin;
  const max = fromText.max ?? tMax;

  return {
    short_id: sid,
    slug: `${slugify(`${company}-${title}`, 60)}-${sid}`,
    dedupe_key: dedupeKey(company, title, city),

    source: SOURCE_ID,
    source_uid: sourceUid,
    source_url: applyUrl,
    canonical_url: applyUrl,

    company_name: company,
    company_slug: slugify(company),
    title,

    locations,
    city_primary: city,
    is_remote: remote,

    exp_min: min,
    exp_max: max,
    qualification: null,
    eligible_batches: parseBatches(`${title} ${text.slice(0, 1200)}`),

    // Greenhouse boards do not publish pay. Nothing is estimated.
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null,

    // Not a walk-in by definition: these are online applications.
    hiring_type: remote ? 'work-from-home' : 'full-time',
    experience_level: experienceLevel(min, max),
    work_mode: remote ? 'remote' : 'onsite',

    walkin_start: null, walkin_end: null, walkin_time: null, walkin_venue: null,

    // The employer's own write-up. Sanitised by ingest.js before storage.
    description_html: html || null,
    description_source: html ? 'greenhouse' : null,

    posted_at: postedAt,
    /*
     * A backstop, not a deadline, and never shown to a reader. Liveness here
     * comes from the board: a role still listed is open, a role that has gone
     * is closed, checked every poll. This only matters if polling itself stops,
     * in which case listings age out instead of sitting here forever.
     */
    valid_through: new Date(Date.now() + 60 * 864e5).toISOString(),

    status: 'needs_review',
    review_reason: 'unresolved-apply-url',
    scam_flags: null,

    apply_url: applyUrl,
    first_seen_at: new Date().toISOString(),
  };
}

/**
 * Every India role currently open across the boards we carry.
 *
 * `sinceIso` filters on the employer's publication date, so a normal poll only
 * carries what is new. The returned `openUids` is every India posting seen this
 * run regardless of date — the ingest pass needs the complete set to work out
 * what has disappeared.
 */
export async function fetchOpenRoles(sinceIso = null, { boards = GREENHOUSE, log = () => {} } = {}) {
  const since = sinceIso ? new Date(sinceIso) : null;
  const rows = [];
  const openUids = new Set();
  let reached = 0;

  for (const b of boards) {
    const jobs = await board(b.token);
    if (!jobs) { log(`  ${b.name}: board did not answer`); continue; }
    reached++;

    let mine = 0;
    for (const job of jobs) {
      const row = toRow(job, b.name);
      if (!row) continue;
      mine++;
      openUids.add(row.source_uid);
      if (!since || new Date(row.posted_at) > since) rows.push(row);
    }
    log(`  ${b.name}: ${mine} in India, ${jobs.length} total`);
  }

  rows.sort((a, b) => a.posted_at.localeCompare(b.posted_at));
  return { rows, openUids, boardsReached: reached, boardsTotal: boards.length };
}
