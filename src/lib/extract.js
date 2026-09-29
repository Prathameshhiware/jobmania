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
export function parseWalkin(text) {
  const out = { start: null, end: null, time: null, venue: null };
  if (!text) return out;

  const range = text.match(
    new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:-|–|to)\\s*(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\s*(\\d{4})?`, 'i'));
  if (range) {
    const [, d1, d2, mon, yr] = range;
    const y = yr || String(new Date().getFullYear());
    out.start = toISODate(d1, mon, y);
    out.end = toISODate(d2, mon, y);
  } else {
    const one = text.match(new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\s*(\\d{4})?`, 'i'));
    if (one) { out.start = toISODate(one[1], one[2], one[3] || String(new Date().getFullYear())); out.end = out.start; }
  }

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
  const walkin = type === 'walk-in' ? parseWalkin(text) : { start: null, end: null, time: null, venue: null };

  const applyUrl = parseApplyLinks(html)[0] ?? null;
  const postedAt = new Date(post.date_gmt ? `${post.date_gmt}Z` : post.date).toISOString();
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
