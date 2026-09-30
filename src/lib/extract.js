// Turns one aggregator post into a structured record.
//
// INTEGRITY RULE — read before changing anything here.
// This extractor only ever copies values that are literally present in the
// source, and returns null when they are not. It must never infer, estimate or
// fill in a field. If you are tempted to add "sensible defaults" for salary,
// interview rounds, documents to carry or anything else, don't: an empty field
// renders as "not stated", which is the truth. Nothing generated belongs here.
//
// We take FACTS and the apply URL. We never copy the aggregator's own prose —
// their article text is theirs, and a copy of it could not rank anyway.

import {
  slugify, shortId, dedupeKey, stripTags, decodeEntities,
  parseLocations, isRemote, parseExperience, experienceLevel,
  parseBatches, hiringType, ttl, scamFlags,
} from './normalize.js';

const OUR_HOSTS = /foundthejob\.com|sarkariwallahjob\.com|preparra\.com|stck\.me/i;
const SOCIAL = /whatsapp|telegram|t\.me|instagram|youtube|facebook|twitter|x\.com|linkedin\.com\/(?:sharing|share)|addtoany|pinterest/i;

/** Pull `label -> value` pairs out of every two-column table row. */
export function parseDetailTable(html) {
  const out = {};
  for (const row of String(html ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1]));
    if (cells.length < 2) continue;
    const label = cells[0].toLowerCase().replace(/[^a-z ]/g, '').trim();
    const value = cells.slice(1).join(' ').trim();
    if (label && value && !out[label]) out[label] = value;
  }
  return out;
}

/** Outbound links that are plausibly the employer's application route. */
export function parseApplyLinks(html) {
  const urls = [];
  for (const m of String(html ?? '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(m[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    if (OUR_HOSTS.test(href) || SOCIAL.test(href)) continue;
    if (!urls.includes(href)) urls.push(href);
  }
  return urls;
}

/** Company name from the post title, used only when the table omits it. */
export function companyFromTitle(title) {
  const t = decodeEntities(title ?? '');
  const cut = t.split(/\b(?:walk[\s-]?in|off[\s-]?campus|recruitment|hiring|careers?|jobs?|vacancy|internship|drive|work\s*from\s*home)\b/i)[0];
  const name = cut.replace(/\s*\d{4}\s*$/, '').replace(/[|:–—-]\s*$/, '').trim();
  return name.length >= 2 && name.length <= 60 ? name : null;
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

/** Walk-in date range and timing, only when the post states them. */
/**
 * Walk-in date, time and venue out of the post body.
 *
 * Three things went wrong in the first version of this, and all three are worth
 * naming because they produced listings that were expired before anyone saw
 * them:
 *
 *   1. It took the first date anywhere in the article. A job post is full of
 *      dates — eligible batch years, an unrelated drive mentioned further down,
 *      the date the article itself was written — so the first one is rarely the
 *      drive. We now look for a date NEAR a label that means the drive date,
 *      and only fall back to a loose scan when there is no labelled one.
 *   2. A date with no year got the current year. A post published in September
 *      quoting "3rd January" became January of THIS year, ten months in the
 *      past, rather than next year. The year now rolls forward when that is the
 *      only reading that puts the drive after the announcement.
 *   3. Nothing checked the result against the post date. A drive cannot happen
 *      before it is announced, but 58 rows said it did, one of them by 141
 *      days. Anything still in the past after step 2 is a misparse, and a
 *      misparsed date is worse than no date: it publishes a listing that the
 *      expiry pass kills within the hour. We return null and let the row wait
 *      for review instead.
 *
 * @param text     the post body, tags stripped
 * @param postedAt when the post was published, as the sanity floor
 */
export function parseWalkin(text, postedAt = null) {
  const out = { start: null, end: null, time: null, venue: null };
  if (!text) return out;

  const floor = postedAt ? new Date(postedAt) : null;

  // A drive is days away, not months. Anything further out than this is more
  // likely a different date that happens to sit near the label.
  const MAX_LEAD_DAYS = 120;

  const withinWindow = (iso) => {
    if (!iso) return false;
    if (!floor) return true;
    const days = (new Date(`${iso}T23:59:59Z`) - floor) / 864e5;
    return days >= -1 && days <= MAX_LEAD_DAYS;
  };

  // Try the year as written, then the next one. A bare "3rd January" on a post
  // from 30 December means the January five days away, not the one last winter.
  const resolve = (day, mon, year) => {
    if (year) {
      const exact = toISODate(day, mon, year);
      return withinWindow(exact) ? exact : null;
    }
    const thisYear = floor ? floor.getUTCFullYear() : new Date().getUTCFullYear();
    for (const y of [thisYear, thisYear + 1]) {
      const iso = toISODate(day, mon, y);
      if (withinWindow(iso)) return iso;
    }
    return null;
  };

  // Backslashes are doubled because these are template literals handed to
  // `new RegExp`: a single \d inside backticks is just "d" by the time the
  // regex sees it, which silently matches nothing.
  const RANGE = `(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:-|–|—|to|&)\\s*(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\.?,?\\s*(\\d{4})?`;
  const SINGLE = `(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\.?,?\\s*(\\d{4})?`;

  /*
   * Every date in the chunk, not just the first one.
   *
   * This used to call .match(), which returns a single result, so the first
   * date-shaped thing in the body decided the outcome. These posts almost
   * always open with a date that is already past — the drive they ran last
   * week, a batch year, the date of an earlier notice — so the first candidate
   * failed the sanity check and the whole parse gave up, even when a perfectly
   * good future date sat two sentences later.
   *
   * Measured on six listings that were stuck unpublished: five of them had a
   * usable drive date in the body that this threw away. Omega Healthcare was
   * posted on 28 September and said "2nd October"; it was rejected because the
   * body happened to mention 22nd September first.
   *
   * So: collect every match that survives resolve(), then take the EARLIEST,
   * not the first in reading order. A post often names several future dates —
   * the drive, a last date to apply, an unrelated notice — and the drive is
   * almost always the soonest. Picking the earliest also errs in the safe
   * direction: if we are wrong the listing expires too early, which costs a
   * reader nothing, where picking a later date keeps a finished drive on the
   * site, which is the exact failure this project exists to prevent.
   *
   * A range still wins over a single date, because "2 - 4 October" is more
   * specific than "2 October".
   */
  const readFrom = (chunk) => {
    const found = [];
    for (const r of chunk.matchAll(new RegExp(RANGE, 'gi'))) {
      const start = resolve(r[1], r[3], r[4]);
      const end = resolve(r[2], r[3], r[4]);
      if (start && end) found.push({ start, end });
    }
    if (found.length) return found.sort((a, b) => a.start.localeCompare(b.start))[0];

    for (const one of chunk.matchAll(new RegExp(SINGLE, 'gi'))) {
      const d = resolve(one[1], one[2], one[3]);
      if (d) found.push({ start: d, end: d });
    }
    if (found.length) return found.sort((a, b) => a.start.localeCompare(b.start))[0];
    return null;
  };

  // Labelled first. These are the words the source actually puts in front of a
  // drive date; the window is short so a date two paragraphs later cannot win.
  const LABELS = /(?:walk[\s-]?in\s*(?:drive\s*)?date|interview\s*date|drive\s*date|date\s*(?:&|and)\s*time|walk[\s-]?in\s*on|interview\s*on|\bdates?\b)\s*[:\-–]?\s*/gi;

  let found = null;
  for (const m of text.matchAll(LABELS)) {
    found = readFrom(text.slice(m.index, m.index + 140));
    if (found) break;
  }

  // Nothing labelled: scan the whole body, but every candidate still has to
  // land after the post date, so a batch year or an old drive cannot win.
  if (!found) found = readFrom(text);

  if (found) { out.start = found.start; out.end = found.end; }

  const time = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (time) out.time = `${time[1].toUpperCase()} – ${time[2].toUpperCase()}`;

  const venue = text.match(/(?:venue|address|interview\s+location)\s*[:\-]\s*([^\n]{12,220})/i);
  if (venue) out.venue = venue[1].trim();

  return out;
}

function toISODate(day, mon, year) {
  const i = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')
    .indexOf(String(mon).slice(0, 3).toLowerCase());
  if (i < 0) return null;
  const d = new Date(Date.UTC(+year, i, +day));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * @param post  a WordPress REST post
 * @param categoryNames  names of the post's categories, for facet mapping
 * @returns a row ready for `jobs`, or null when the post has no usable company/role
 */
export function extractJob(post, categoryNames = []) {
  const html = post?.content?.rendered ?? '';
  const title = decodeEntities(post?.title?.rendered ?? '').trim();
  const text = stripTags(html);
  const table = parseDetailTable(html);

  const company = table['company'] || companyFromTitle(title);
  if (!company || !title) return null;

  const role = table['roles'] || table['role'] || table['job role'] || table['position'] || title;
  const qualification = table['qualification'] || table['qualifications'] || table['education'] || null;
  const locationText = table['location'] || table['job location'] || table['work location'] || '';
  const expText = table['work experience'] || table['experience'] || table['exp'] || '';

  const locations = parseLocations(locationText || text);
  const remote = isRemote(`${title} ${locationText} ${categoryNames.join(' ')}`);
  const { min, max } = parseExperience(expText);
  const type = hiringType({ title, categories: categoryNames, body: text });

  // Declared before parseWalkin, which needs it: a drive cannot be dated before
  // the post that announces it, and that check is what keeps a misparsed date
  // out of the database.
  const postedAt = new Date(post.date_gmt ? `${post.date_gmt}Z` : post.date).toISOString();
  const walkin = type === 'walk-in' ? parseWalkin(text, postedAt) : { start: null, end: null, time: null, venue: null };

  const applyUrl = parseApplyLinks(html)[0] ?? null;
  const source = 'foundthejob';
  const sourceUid = String(post.id);
  const sid = shortId(source, sourceUid);
  const city = locations[0] ?? (remote ? 'Remote' : null);

  const flags = scamFlags(text, applyUrl);

  return {
    short_id: sid,
    slug: `${slugify(`${company}-${role}`, 60)}-${sid}`,
    dedupe_key: dedupeKey(company, role, city),

    source,
    source_uid: sourceUid,
    source_url: post.link ?? null,
    canonical_url: null,

    company_name: company,
    company_slug: slugify(company),
    title: role,

    locations,
    city_primary: city,
    is_remote: remote,

    exp_min: min,
    exp_max: max,
    qualification,
    eligible_batches: parseBatches(`${title} ${qualification ?? ''}`),

    // Pay is only ever set from an employer feed that states it. Never here.
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null,

    hiring_type: type,
    experience_level: experienceLevel(min, max),
    work_mode: remote ? 'remote' : 'onsite',

    walkin_start: walkin.start,
    walkin_end: walkin.end,
    walkin_time: walkin.time,
    walkin_venue: walkin.venue,

    // Left null on purpose: we do not copy the aggregator's write-up.
    // ats.js fills this only from the employer's own feed.
    description_html: null,
    description_source: null,

    posted_at: postedAt,
    valid_through: walkin.end ? new Date(`${walkin.end}T23:59:59Z`).toISOString() : ttl(postedAt),

    // Nothing goes live until it has a route a candidate can act on: a checked
    // apply link, or a walk-in venue and date. ingest.js decides.
    status: 'needs_review',
    review_reason: !applyUrl
      ? (walkin.venue && walkin.start ? 'walk-in, no online application' : 'no apply link or venue')
      : flags.length ? 'scam-flags' : 'unresolved-apply-url',
    scam_flags: flags.length ? flags : null,

    apply_url: applyUrl,
    first_seen_at: new Date().toISOString(),
  };
}
