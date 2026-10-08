// Government recruitment notifications, for the Tuesday social post.
//
// This is the one pillar that is not about listings on our own site, and the
// rule that keeps it honest is: we report what a named newsroom reported, and
// we send the reader to the recruiting body's own website to act on it.
//
// We never host a government vacancy, never claim to have verified one, and
// never link to the news article as though it were the application page. The
// vacancy count in a post is attributed to the publisher that printed it, with
// the date, because these numbers are corrected often and a bare number with
// our name on it would be us vouching for something we did not check.
//
// Exam-prep sites are deliberately excluded. They are usually first with a
// notification, but a post that states "4,029 vacancies" should have a masthead
// behind it, and the mainstream papers carry the same notifications within a
// day. Prep aggregators also publish a great deal of speculative "expected
// notification" content, which is exactly what this must not repeat.

import { googleNews, feedItems, parseItem, storyKey, decode } from './feed-parse.js';

/*
 * Recruiting bodies, with the site a reader should actually go to.
 *
 * `match` is checked against the headline in array order, so anything that can
 * be confused with another body is listed first. RRB NTPC is the railways'
 * Non-Technical Popular Categories exam and has nothing to do with NTPC the
 * power producer, which is why railways is tested before everything else.
 *
 * Every URL here was checked to resolve to the body's own domain. A body whose
 * official site could not be confirmed is not in the list.
 */
export const BODIES = [
  { id: 'rrb',  name: 'Railway Recruitment Board',
    match: /\b(RRB|RRC|railway recruitment|indian railways?)\b/i,
    site: 'indianrailways.gov.in' },
  { id: 'ssc',  name: 'Staff Selection Commission',
    match: /\bSSC\b|staff selection/i, site: 'ssc.gov.in' },
  { id: 'upsc', name: 'Union Public Service Commission',
    match: /\bUPSC\b|\bcivil services\b|union public service/i, site: 'upsc.gov.in' },
  { id: 'ibps', name: 'IBPS', match: /\bIBPS\b/i, site: 'ibps.in' },
  { id: 'sbi',  name: 'State Bank of India', match: /\bSBI\b/i, site: 'sbi.co.in/careers' },
  { id: 'rbi',  name: 'Reserve Bank of India', match: /\bRBI\b|reserve bank/i, site: 'rbi.org.in' },
  { id: 'lic',  name: 'LIC', match: /\bLIC\b/i, site: 'licindia.in' },
  { id: 'isro', name: 'ISRO', match: /\bISRO\b/i, site: 'isro.gov.in' },
  { id: 'drdo', name: 'DRDO', match: /\bDRDO\b/i, site: 'drdo.gov.in' },
  { id: 'army', name: 'Indian Army', match: /\bindian army\b|\bagniveer\b/i,
    site: 'joinindianarmy.nic.in' },
  { id: 'navy', name: 'Indian Navy', match: /\bindian navy\b/i, site: 'joinindiannavy.gov.in' },
  { id: 'iaf',  name: 'Indian Air Force', match: /\bindian air force\b|\bIAF\b/i,
    site: 'indianairforce.nic.in' },
  { id: 'post', name: 'India Post', match: /\bindia post\b|\bpostal circle\b|\bGDS\b/i,
    site: 'indiapost.gov.in' },
  { id: 'aai',  name: 'Airports Authority of India', match: /\bAAI\b|airports authority/i,
    site: 'aai.aero' },
];

/** Newsrooms we will put a vacancy number behind. */
const ALLOWED = [
  ['times of india', 'The Times of India'],
  ['telegraph india', 'The Telegraph'],
  ['indian express', 'The Indian Express'],
  ['financial express', 'The Financial Express'],
  ['economic times', 'The Economic Times'],
  ['hindustan times', 'Hindustan Times'],
  ['the hindu', 'The Hindu'],
  ['livemint', 'Mint'],
  ['mint', 'Mint'],
  ['ndtv', 'NDTV'],
  ['business standard', 'Business Standard'],
  ['business today', 'Business Today'],
  ['deccan herald', 'Deccan Herald'],
  ['news18', 'News18'],
  ['india today', 'India Today'],
  ['moneycontrol', 'Moneycontrol'],
];

/** A notification a reader can act on: something is open, or closing. */
const WANTED = new RegExp([
  'recruitment', 'notification', 'vacanc', 'apply online', 'applications? open',
  'registration (begins|open|starts)', 'last date', 'apply by', 'bharti',
  'invites applications', 'hiring for', 'posts? (out|announced|notified)',
].join('|'), 'i');

/*
 * Everything that is about an exam rather than a job opening.
 *
 * Prep content is the overwhelming majority of what this query returns, and
 * none of it is useful to someone deciding whether to apply. "Expected" is
 * here because a large genre of these headlines is pure speculation about
 * notifications that have not been issued.
 */
const NOISE = new RegExp([
  'admit card', 'answer key', 'result', 'cut[- ]?off', 'merit list',
  'syllabus', 'exam pattern', 'previous year', 'mock test', 'sample paper',
  'preparation', 'best books', 'how to (crack|prepare|study)', 'study plan',
  'exam (date|schedule|city|analysis|review)', 'shift timing',
  'postponed', 'revised', 'expected', 'likely to', 'rumour',
  'salary (structure|slip)', 'job profile', 'in hand salary',
  'centenary', 'anniversary', 'history of',
  'scam', 'fraud', 'fake', 'arrest', 'racket', 'probe', 'court', 'FIR',

  // Institutional retrospectives and opinion. The first live run returned
  // three of these in five results: "UPSC turns 100", "UPSC at 100" and a
  // listicle of recruitments "to watch". All of them contain the word
  // recruitment and none of them is a vacancy anyone can apply to.
  'turns \\d+', '\\bat 1?\\d{2}\\b(?!\\s*(?:posts|vacanc))', '\\bstory of\\b',
  '\\d+ years of', 'overhaul', 'to watch', 'opinion', 'what it means',
].join('|'), 'i');

/** The body a headline is about, or null. */
export const bodyFor = (title) => BODIES.find((b) => b.match.test(title)) ?? null;

/**
 * A vacancy count stated in the headline, or null.
 *
 * Only patterns where the number is unambiguously attached to posts are read.
 * "RRB JE 2026 Notification Out: 4,029 Vacancies" yields 4029; a headline that
 * merely contains a year or an exam code yields nothing, which is the correct
 * answer. A post with no count simply does not mention one.
 */
export function vacancyCount(title) {
  const t = String(title);
  const direct = t.match(/([\d,]{2,})\s*(?:\+\s*)?(?:vacanc|posts?\b|seats?\b|openings?\b)/i);
  if (direct) {
    const n = Number(direct[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 10 && n <= 500000) return n;
  }
  const kilo = t.match(/(?:over|more than|nearly|about)\s+([\d.]+)\s*k\b/i);
  if (kilo) {
    const n = Math.round(Number(kilo[1]) * 1000);
    if (Number.isFinite(n) && n >= 1000 && n <= 500000) return n;
  }
  return null;
}

/*
 * Headlines whose whole meaning is "act now".
 *
 * These go off very fast. A dry run posted "UPSC Recruitment 2026 last date
 * today for 212 posts" eleven days after it was printed, which tells a reader
 * to rush at something that shut a week and a half ago. Anything in this
 * family is only usable while it is still nearly true.
 */
const URGENT = /last date|closes? today|ends? today|deadline|final day|closing (today|soon)|hours left/i;
const URGENT_MAX_AGE_DAYS = 2;

const publisher = (raw) => {
  const hay = String(raw ?? '').toLowerCase();
  for (const [needle, name] of ALLOWED) if (hay.includes(needle)) return name;
  return null;
};

const QUERY =
  '(SSC OR UPSC OR IBPS OR RRB OR "railway recruitment" OR ISRO OR DRDO OR ' +
  '"India Post" OR "Indian Army" OR "Indian Navy" OR "Air Force") ' +
  'recruitment OR notification OR vacancies India when:10d';

/**
 * Government recruitment notifications from the last ten days, newest first.
 *
 * Each one carries the recruiting body and its official site, so the post can
 * send the reader somewhere they can actually apply. Returns [] on any failure:
 * a Tuesday with no notification falls back to another pillar rather than
 * posting something made up to fill the slot.
 */
export async function sarkariNotifications(want = 6, { now = Date.now() } = {}) {
  const cutoff = now - 10.5 * 864e5;
  const seen = new Set();
  const out = [];

  for (const raw of await feedItems(googleNews(QUERY))) {
    const item = parseItem(raw, { cutoff });
    if (!item) continue;

    const name = publisher(item.source);
    if (!name) continue;
    if (!WANTED.test(item.title) || NOISE.test(item.title)) continue;

    const body = bodyFor(item.title);
    if (!body) continue;                      // cannot tell the reader where to go

    // A deadline headline is worthless once the deadline has passed, and
    // worse than worthless on a post that says "apply now".
    const ageDays = (now - Date.parse(item.date)) / 864e5;
    if (URGENT.test(item.title) && ageDays > URGENT_MAX_AGE_DAYS) continue;

    const key = storyKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title: decode(item.title),
      source: name,
      date: item.date,
      link: item.link,
      body: body.name,
      bodyId: body.id,
      site: body.site,
      vacancies: vacancyCount(item.title),
    });
    if (out.length >= want) break;
  }
  return out;
}
