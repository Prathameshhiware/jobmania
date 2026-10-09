// What goes out on Instagram today.
//
// The first version of this picked by priority: whatever the most useful
// thing we knew that morning happened to be. That is the right question for a
// single post and the wrong one for a feed, because it would have posted
// about walk-ins most days of most weeks — walk-ins genuinely are the most
// useful thing this site knows, and a feed that says so every day is a feed
// nobody follows.
//
// So this picks by weekday instead, and rotates:
//
//   Mon  openings    who started hiring this week          our database
//   Tue  sarkari     a government recruitment notification news, official site
//   Wed  education   one question from our own articles    our articles
//   Thu  closing     what shuts in the next few days       our database
//   Fri  industry    hiring and funding news               news
//   Sat  walkins     drives in the coming week             our database
//   Sun  roundup     the weekly roundup that just posted   our own post
//
// A festival overrides the weekday, because a Diwali post on Diwali matters
// more than keeping the rotation tidy.
//
// Every pillar can return null, and that is the important part. A Tuesday with
// no government notification falls through to the next pillar that has real
// material rather than posting a thinner version of the same thing. Nothing
// here writes a sentence that is not either measured from our own database or
// attributed to a named publisher with a date.
//
// Renders nothing and publishes nothing: it returns a plan, so the choice can
// be tested long before a renderer exists, and the same plan can feed a
// carousel that posts itself or a reel that waits for someone to add audio.

import { db } from './supabase.js';
import { istDate, istDatePlus, istLong, istShort } from './ist.js';
import { festivalOn } from './festivals.js';
import { sarkariNotifications } from './sarkari.js';
import { topicStories, matchKnownCompanies } from './feeds.js';
import { GLOSSARY } from './glossary.js';

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');
const SITE = 'jobmania.dpdns.org';

const BASE_TAGS = ['jobsinindia', 'jobsearch', 'hiringindia', 'jobvacancy', 'jobalert'];
const TAGS = {
  openings: ['newjobs', 'jobstoday', 'fresherjobs', 'jobopening', 'nowhiring'],
  sarkari: ['sarkarinaukri', 'governmentjobs', 'govtjobs', 'railwayjobs', 'sarkariresult'],
  education: ['jobtips', 'careeradvice', 'jobsearchtips', 'freshers', 'interviewtips'],
  closing: ['lastdate', 'applynow', 'deadline', 'jobstoday', 'urgenthiring'],
  industry: ['itjobs', 'techjobs', 'jobmarket', 'hiringnews', 'careers'],
  walkins: ['walkininterview', 'walkindrive', 'fresherjobs', 'urgenthiring', 'jobstoday'],
  roundup: ['jobmarket', 'hiringnews', 'weeklyupdate', 'careers', 'freshers'],
  festival: ['festival', 'indianfestival', 'jobseekers', 'careers'],
};
const CITY_TAGS = {
  Bengaluru: ['bangalorejobs', 'bengalurujobs'],
  Hyderabad: ['hyderabadjobs'],
  'Delhi NCR': ['delhijobs', 'ncrjobs'],
  Mumbai: ['mumbaijobs'],
  Chennai: ['chennaijobs'],
  Pune: ['punejobs'],
};

/**
 * A glossary anchor, matching the id the glossary page renders.
 *
 * Must stay in step with the slug in glossary.astro. If they drift, the link
 * still resolves to the page and simply fails to jump, which is a small
 * enough failure that nothing would report it.
 */
const termSlug = (t) =>
  String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const citySlug = (c) =>
  String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/*
 * An employer's name, fit to put on a graphic.
 *
 * Employers routinely bake the hiring format into the company field on their
 * own postings, so the table holds "Capgemini ( Walk in )", "Mphasis (Walk-In
 * Interview)" and "Vishal Mega Mart walk-in". We never edit what is stored —
 * the listing shows the employer's own words — but a card that reads
 * "RMSI ( walk-in )" looks careless, and the slide already says these are
 * walk-ins.
 */
export const cleanCompany = (name) =>
  String(name ?? '')
    .replace(/[([{]\s*walk[\s-]?in(\s+interview|\s+drive)?\s*[)\]}]/gi, '')
    .replace(/[\s,-]+walk[\s-]?in(\s+interview|\s+drive)?\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[,\-–—:]+$/, '')
    .trim();

const tally = (list, key) =>
  Object.entries(list.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]);

/*
 * The weekday in India, 0 = Sunday.
 *
 * Taking the Indian calendar date and reading it back as midday UTC avoids the
 * whole problem: between midnight and 05:30 IST the server's own weekday is
 * still yesterday's, and a rotation driven by that would post Monday's content
 * on Sunday night every single week.
 */
export const istWeekday = (now = new Date()) =>
  new Date(istDate(now) + 'T12:00:00Z').getUTCDay();

export const PILLAR_BY_WEEKDAY = {
  0: 'roundup', 1: 'openings', 2: 'sarkari', 3: 'education',
  4: 'closing', 5: 'industry', 6: 'walkins',
};

/*
 * Where to go when the scheduled pillar has nothing.
 *
 * Ordered by how reliably each one has material. The three that read our own
 * database come first, because they are the only ones that cannot be empty for
 * reasons outside our control.
 */
const FALLBACK = ['openings', 'walkins', 'closing', 'education', 'industry', 'sarkari'];

/** One snapshot of the live table, shared by every pillar that needs it. */
async function liveJobs() {
  const { data, error } = await db
    .from('jobs')
    .select('status, hiring_type, experience_level, city_primary, company_name, slug, title, ' +
            'walkin_start, walkin_time, walkin_venue, first_seen_at, posted_at, valid_through, ' +
            'qualification, work_mode, exp_min, exp_max')
    .eq('status', 'live')
    .limit(5000);
  if (error) throw new Error(`jobs: ${error.message}`);
  return data ?? [];
}

const statsFor = (live) => ({
  live: live.length,
  freshers: live.filter((j) => ['fresher', '0-2'].includes(j.experience_level)).length,
  walkins: live.filter((j) => j.hiring_type === 'walk-in').length,
  companies: new Set(live.map((j) => j.company_name)).size,
});

// --------------------------------------------------------------- pillars
//
// Each takes the shared context and returns a plan or null. None of them
// throws: a pillar that cannot find material says so by returning null, and
// the caller moves to the next one.

function pillarOpenings({ live, now }) {
  /*
   * "New" has to mean the employer posted it recently, not that we first saw
   * it today. The day the Greenhouse import landed, first_seen_at alone would
   * have claimed 408 new openings when the true answer was three.
   */
  const seenSince = new Date(now.getTime() - 864e5).toISOString();
  const postedSince = new Date(now.getTime() - 3 * 864e5).toISOString();
  const arrived = live.filter(
    (j) => j.first_seen_at >= seenSince && String(j.posted_at ?? '') >= postedSince);
  if (arrived.length < 3) return null;

  const byCo = tally(arrived, 'company_name');
  const fresher = arrived.filter((j) => ['fresher', '0-2'].includes(j.experience_level)).length;

  return {
    kind: 'openings',
    subjects: arrived.slice(0, 12),
    headline: `${n(arrived.length)} new today`,
    slides: [
      { type: 'hero', kicker: istLong(now), title: `${n(arrived.length)} new openings today`,
        sub: fresher ? `${n(fresher)} open to freshers` : `From ${n(byCo.length)} employers` },
      { type: 'list', title: 'Who is hiring',
        items: byCo.slice(0, 5).map(([co, k]) =>
          ({ primary: cleanCompany(co), secondary: `${k} opening${k === 1 ? '' : 's'}` })) },
      { type: 'cta', title: 'Apply in the first 48 hours',
        body: 'Recruiters stop reading once they have a shortlist. Being early beats being perfect.',
        link: `${SITE}/c/just-posted` },
    ],
    caption: [
      `${n(arrived.length)} new openings went live on JoBmania today.`,
      '',
      ...byCo.slice(0, 5).map(([co, k]) => `${cleanCompany(co)} — ${k} opening${k === 1 ? '' : 's'}`),
      '',
      'Apply in the first 48 hours if you can. Recruiters stop reading once they have a shortlist.',
      '',
      'Every apply link goes to the employer, never through us. No registration fee, ever.',
      '',
      `${SITE}/c/just-posted`,
    ].join('\n'),
    hashtags: [...TAGS.openings, ...BASE_TAGS],
  };
}

function pillarClosing({ live, now }) {
  /*
   * Walk-ins are excluded even though their valid_through is the soonest of
   * anything on the site, because a walk-in's deadline is its drive date and
   * Saturday's pillar is already about exactly those drives. Without this,
   * Thursday and Saturday posted the same five companies.
   */
  const horizon = new Date(now.getTime() + 4 * 864e5).toISOString();
  const closing = live
    .filter((j) => j.hiring_type !== 'walk-in' && !j.walkin_start)
    .filter((j) => j.valid_through && j.valid_through > now.toISOString() && j.valid_through <= horizon)
    .sort((a, b) => String(a.valid_through).localeCompare(String(b.valid_through)));
  if (closing.length < 3) return null;

  const soonest = closing[0].valid_through.slice(0, 10);
  const fresher = closing.filter((j) => ['fresher', '0-2'].includes(j.experience_level)).length;

  return {
    kind: 'closing',
    subjects: closing.slice(0, 12),
    headline: `${n(closing.length)} closing this week`,
    slides: [
      { type: 'hero', kicker: 'Closing soon',
        title: `${n(closing.length)} openings close within 4 days`,
        sub: fresher ? `${n(fresher)} of them open to freshers` : `Earliest closes ${istShort(soonest)}` },
      { type: 'list', title: 'Closing first',
        items: closing.slice(0, 5).map((j) => ({
          primary: cleanCompany(j.company_name),
          secondary: `${String(j.title).slice(0, 38)} · closes ${istShort(j.valid_through)}`,
        })) },
      { type: 'cta', title: 'Do not leave it to the last evening',
        body: 'Employers close applications early once they have enough. A deadline is the last possible day, not the best one.',
        link: `${SITE}/jobs` },
    ],
    caption: [
      `${n(closing.length)} openings on JoBmania close within the next four days.`,
      '',
      ...closing.slice(0, 5).map((j) =>
        `${cleanCompany(j.company_name)} — ${String(j.title).slice(0, 44)}, closes ${istShort(j.valid_through)}`),
      '',
      'Worth doing tonight rather than on the last day. Employers often close applications early once they have enough people to shortlist.',
      '',
      'No registration fee, ever.',
      '',
      `${SITE}/jobs`,
    ].join('\n'),
    hashtags: [...TAGS.closing, ...BASE_TAGS],
  };
}

function pillarWalkins({ live, now }) {
  const today = istDate(now);
  const weekOut = istDatePlus(7, now);
  const all = live
    .filter((j) => j.walkin_start && j.walkin_start >= today && j.walkin_start <= weekOut && j.walkin_venue)
    .sort((a, b) => String(a.walkin_start).localeCompare(String(b.walkin_start)));
  if (!all.length) return null;

  /*
   * One row per employer in the listed drives.
   *
   * Employers post the same drive under names we cannot treat as equal in the
   * database — a reel built from this showed "Infoedge" and "Info Edge" as two
   * of its five companies. The count above the list still counts every drive,
   * because that number is true; it is only the named examples that are
   * collapsed, so the same logo does not appear twice in six seconds.
   */
  const key = (name) => cleanCompany(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const seen = new Set();
  const drives = all.filter((j) => {
    const k = key(j.company_name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const byCity = tally(all, 'city_primary');
  const topCity = byCity[0]?.[0] ?? null;

  return {
    kind: 'walkins',
    city: topCity,
    subjects: drives.slice(0, 12),
    headline: `${n(all.length)} walk-ins this week`,
    slides: [
      { type: 'hero', kicker: 'Next seven days',
        title: `${n(all.length)} walk-in drive${all.length === 1 ? '' : 's'} this week`,
        sub: byCity.slice(0, 4).map(([c, k]) => `${c} ${k}`).join('  ·  ') },
      { type: 'list', title: 'Where and when',
        items: drives.slice(0, 5).map((j) => ({
          primary: cleanCompany(j.company_name),
          secondary: [istShort(j.walkin_start), j.city_primary, j.walkin_time].filter(Boolean).join(' · '),
        })) },
      { type: 'cta', title: 'Check the venue before you travel',
        body: 'Drives get moved and cancelled at short notice. Every listing carries the venue and timing exactly as the employer stated them.',
        link: `${SITE}/c/walk-ins` },
    ],
    caption: [
      `${n(all.length)} walk-in drive${all.length === 1 ? '' : 's'} in the next seven days.`,
      '',
      ...drives.slice(0, 6).map((j) =>
        [`${istShort(j.walkin_start)} — ${cleanCompany(j.company_name)}`,
         [j.city_primary, j.walkin_time].filter(Boolean).join(', ')].filter(Boolean).join(', ')),
      '',
      'Venue and timing for each one is on the site, exactly as the employer published it. Confirm on their own page before you travel, because drives do get moved.',
      '',
      'No registration fee, ever. If anyone asks you to pay, walk away.',
      '',
      `${SITE}/c/walk-ins`,
    ].join('\n'),
    hashtags: [...TAGS.walkins, ...(CITY_TAGS[topCity] ?? []), ...BASE_TAGS],
  };
}

/*
 * Whether an article's FAQ still answers its own question months later.
 *
 * Article FAQs are frozen at publication and many of them quote our inventory
 * at that moment: "623 openings from 207 employers as of 2 October 2026". In
 * the article that is correct and properly dated. On a card posted in
 * December it is a stale number, and the as-of line that makes it honest is
 * the part nobody reads.
 *
 * The advice questions — what a walk-in is, whether a registration fee is ever
 * legitimate, how to apply off campus — do not go off, and they are the better
 * posts anyway.
 */
export const evergreen = (f) => {
  const a = String(f?.a ?? '');
  if (/\bas of\b/i.test(a)) return false;
  if (/[\d,]{3,}\s*(openings|listings|employers|live|vacancies)/i.test(a)) return false;
  if (/\bcounted on\b|\bright now\b.*\d{3}/i.test(a)) return false;
  return Boolean(f?.q && a);
};

/**
 * One question and answer, taken from our own articles.
 *
 * Which one is decided by the date rather than at random, so the same question
 * cannot come up twice in a week, the cycle is even, and a given day's post is
 * reproducible when something needs checking afterwards.
 */
function pillarEducation({ faqs, now }) {
  const day = Math.floor(Date.parse(istDate(now) + 'T00:00:00Z') / 864e5);
  const pool = (faqs ?? []).filter(evergreen);

  /*
   * Two kinds of education post, alternating on the day number rather than on
   * the week, so they stay evenly mixed even when this pillar comes up as a
   * fallback on some other weekday.
   *
   * Glossary first on even days. It is the half that teaches something the
   * site does not otherwise say anywhere: we measured our own 405 descriptions
   * and not one of them contains the word CTC.
   */
  const wantGlossary = day % 2 === 0;
  const term = GLOSSARY.length ? GLOSSARY[Math.floor(day / 2) % GLOSSARY.length] : null;
  if (wantGlossary && term) return glossaryPost(term);
  if (pool.length) return faqPost(pool[Math.floor(day / 2) % pool.length]);
  return term ? glossaryPost(term) : null;
}

/** One term from the glossary, defined. */
function glossaryPost(t) {
  const name = t.expand ? `${t.term} — ${t.expand}` : t.term;
  const q = t.question ?? `What is ${t.term}?`;
  return {
    kind: 'education',
    format: 'glossary',
    // Statutory terms were reviewed and approved on 9 October 2026 and now
    // publish unattended. What makes that safe is that they state no rate or
    // threshold at all — only what the thing is, the Act it comes from, and
    // where to check the current position. A statutory term that ever quotes
    // a figure has to go back behind a hold.
    needsHumanApproval: false,
    headline: q,
    slides: [
      { type: 'hero', kicker: 'Know the word', title: q, sub: t.expand ?? '' },
      { type: 'qa', question: name, answer: t.short },
      t.tier === 'statutory'
        ? { type: 'cta', title: 'Check the current rule',
            body: `Defined under the ${t.act}. Rates and limits change, so confirm the current position before you rely on it.`,
            link: t.source }
        : { type: 'cta', title: 'Why it matters', body: t.why,
            link: `${SITE}${t.path ?? `/glossary#${termSlug(t.term)}`}` },
    ],
    caption: [
      q,
      '',
      t.short,
      '',
      t.why,
      ...(t.tier === 'statutory'
        ? ['', `Defined under the ${t.act}. Rates and limits change by notification, so check ${t.source} for the current position rather than relying on this card.`]
        : []),
      '',
      `${SITE}${t.path ?? `/glossary#${termSlug(t.term)}`}`,
    ].join('\n'),
    hashtags: ['jobterms', ...TAGS.education, ...BASE_TAGS],
  };
}

/** One question and answer, lifted from an article we published. */
function faqPost(pick) {
  if (!pick?.q || !pick?.a) return null;
  return {
    kind: 'education',
    format: 'faq',
    headline: pick.q,
    slides: [
      { type: 'hero', kicker: 'Worth knowing', title: pick.q, sub: '' },
      { type: 'qa', question: pick.q, answer: pick.a },
      { type: 'cta', title: 'The full guide is on the site',
        body: pick.title ?? 'Written up properly, with the numbers behind it.',
        link: `${SITE}${pick.path ?? '/insights'}` },
    ],
    caption: [
      pick.q,
      '',
      pick.a,
      '',
      pick.title ? `More on this in our guide: ${pick.title}` : 'More guides on the site.',
      '',
      `${SITE}${pick.path ?? '/insights'}`,
    ].join('\n'),
    hashtags: [...TAGS.education, ...BASE_TAGS],
  };
}

/**
 * A government recruitment notification.
 *
 * We do not list government vacancies and this post does not pretend we do.
 * It states what a named paper reported, on what date, and sends the reader to
 * the recruiting body's own website, which is the only place the notification
 * can actually be read and applied to.
 */
async function pillarSarkari() {
  const items = await sarkariNotifications(4);
  const top = items.find((i) => i.vacancies) ?? items[0];
  if (!top) return null;

  const count = top.vacancies ? `${n(top.vacancies)} posts` : 'Applications open';

  return {
    kind: 'sarkari',
    external: true,
    subject: top,
    headline: `${top.body}: ${count}`,
    slides: [
      { type: 'hero', kicker: 'Government recruitment', title: top.body, sub: count },
      { type: 'news', title: top.title, source: top.source, date: istShort(top.date) },
      { type: 'cta', title: 'Apply on the official site only',
        body: `Everything about this notification is on ${top.site}. Never pay anyone to apply for a government job.`,
        link: top.site },
    ],
    caption: [
      `${top.body} — ${count}.`,
      '',
      top.title,
      `Reported by ${top.source}, ${istLong(top.date)}.`,
      '',
      `Apply only on the official site: ${top.site}`,
      '',
      'We do not list government vacancies and we have not verified this one ourselves. Check the official notification before you apply, and never pay anyone a fee for a government job.',
      '',
      `For private-sector openings we do verify: ${SITE}`,
    ].join('\n'),
    hashtags: [...TAGS.sarkari, ...BASE_TAGS],
  };
}

/*
 * How well a headline works as the lead card on a national account.
 *
 * Recency alone chooses badly. Two dry runs led with a venture capital
 * analysis piece and then with "UGI Naini students secure jobs at TCS in
 * campus drive" — one local college's placement day, which is lovely for that
 * college and means nothing to a reader in Hyderabad.
 *
 * So: a headcount figure is the strongest signal, because it is concrete and
 * national. A single named institution is the strongest negative. Funding
 * stories start a point down, since they are context rather than news a job
 * seeker can act on.
 */
export function leadScore(s) {
  const t = String(s.title);
  let score = 0;
  if (/[\d,]{3,}\s*(employees|freshers|jobs|hires|people|staff|engineers)/i.test(t)) score += 4;
  if (/\b(headcount|campus hiring|fresher hiring|graduate hiring|hiring freeze)\b/i.test(t)) score += 3;
  if (/\b(nasscom|tcs|infosys|wipro|hcltech|cognizant|accenture|capgemini)\b/i.test(t)) score += 2;
  if (/\b(hiring|layoff|job cuts|attrition|salary hike|appraisal)\b/i.test(t)) score += 1;
  if (s.topic === 'funding') score -= 1;
  // One college, one school, one batch: not a national story.
  if (/\b(students?|college|university|institute|campus of|alumni)\b.*\b(secure|bag|get|placed|placement)\b/i.test(t)
      || /\b(secure|bag|placed)\b.*\bstudents?\b/i.test(t)) score -= 6;
  if (/\bwhy\b|\bexplained\b|\boutpaced\b|\banalysis\b/i.test(t)) score -= 2;
  return score;
}

/** Hiring and funding news, with our own listings joined on where they match. */
async function pillarIndustry({ live }) {
  const [hiring, funding] = await Promise.all([
    topicStories('industry', { want: 4, days: 30 }),
    topicStories('funding', { want: 3, days: 10 }),
  ]);
  const stories = [...hiring, ...funding].sort((a, b) => b.date.localeCompare(a.date));
  if (!stories.length) return null;

  const companies = [...new Set(live.map((j) => j.company_name))];
  const lead = [...stories].sort((a, b) => leadScore(b) - leadScore(a) || b.date.localeCompare(a.date))[0];
  const rest = stories.filter((s) => s !== lead);
  const hits = matchKnownCompanies(lead.title, companies);

  return {
    kind: 'industry',
    external: true,
    subject: lead,
    headline: lead.title.slice(0, 60),
    slides: [
      { type: 'hero', kicker: 'This week in hiring', title: lead.title, sub: lead.source },
      { type: 'list', title: 'Also this week',
        items: rest.slice(0, 4).map((s) => ({ primary: s.title.slice(0, 64), secondary: s.source })) },
      hits.length
        ? { type: 'cta', title: `${hits[0]} is hiring on JoBmania`,
            body: 'We carry their openings, straight from their own careers system.',
            link: `${SITE}/jobs` }
        : { type: 'cta', title: 'What is actually open, right now',
            body: 'News tells you the direction. The site tells you which roles you can apply to today.',
            link: `${SITE}/jobs` },
    ],
    caption: [
      'This week in Indian hiring.',
      '',
      ...[lead, ...rest].slice(0, 5).map((s) => `${s.title} (${s.source}, ${istShort(s.date)})`),
      '',
      'Headlines are linked to their publishers. We report what they reported and add nothing to it.',
      '',
      hits.length
        ? `${hits[0]} openings are live on the site right now.`
        : 'For what is actually open today, rather than what the market is doing:',
      '',
      `${SITE}/jobs`,
    ].join('\n'),
    hashtags: [...TAGS.industry, ...BASE_TAGS],
  };
}

/** Sunday: point at the weekly roundup that published itself at 10am. */
function pillarRoundup({ live, now }) {
  const s = statsFor(live);
  const cities = tally(live, 'city_primary');
  return {
    kind: 'roundup',
    headline: 'This week on JoBmania',
    slides: [
      { type: 'hero', kicker: `Week to ${istShort(now)}`, title: 'This week on JoBmania',
        sub: `${n(s.live)} live openings from ${n(s.companies)} employers` },
      { type: 'stat', title: 'Where things stand',
        rows: [
          [n(s.live), 'live openings'],
          [n(s.freshers), 'open to freshers'],
          [n(s.walkins), 'walk-in drives'],
          [n(cities[0]?.[1] ?? 0), `in ${cities[0]?.[0] ?? 'India'}`],
        ],
        note: `Counted ${istLong(now)}` },
      { type: 'cta', title: 'The full roundup is on the site',
        body: 'Published every Sunday morning: what arrived, what closed, and what the week looked like.',
        link: `${SITE}/insights/blogs` },
    ],
    caption: [
      `This week on JoBmania: ${n(s.live)} live openings from ${n(s.companies)} employers.`,
      '',
      `${n(s.freshers)} open to freshers. ${n(s.walkins)} walk-in drives. ${n(cities[0]?.[1] ?? 0)} in ${cities[0]?.[0] ?? 'India'}.`,
      '',
      'Every apply link is re-tested about 1,900 times a day, and a role comes off the site when it closes rather than staying up to collect applications nobody reads.',
      '',
      'The full weekly roundup publishes every Sunday morning.',
      '',
      `${SITE}/insights/blogs`,
    ].join('\n'),
    hashtags: [...TAGS.roundup, ...BASE_TAGS],
  };
}

function pillarFestival({ fest, live, now }) {
  const s = statsFor(live);
  return {
    kind: 'festival',
    needsHumanApproval: Boolean(fest.confirm),
    headline: fest.greeting,
    slides: [
      { type: 'festival', greeting: fest.greeting, name: fest.name,
        line: 'From all of us at JoBmania' },
      { type: 'stat', title: 'Still hiring through the holiday',
        rows: [[n(s.live), 'live openings'], [n(s.freshers), 'open to freshers']],
        note: `Counted ${istLong(now)}` },
    ],
    caption: [
      `${fest.greeting} from everyone at JoBmania.`,
      '',
      'However you are spending today, we hope it is a good one.',
      '',
      `If you are job hunting over the break, ${n(s.live)} openings are live on the site and every apply link was tested in the last 24 hours.`,
      '',
      SITE,
    ].join('\n'),
    hashtags: [...TAGS.festival, ...BASE_TAGS],
  };
}

const BUILDERS = {
  openings: pillarOpenings,
  closing: pillarClosing,
  walkins: pillarWalkins,
  education: pillarEducation,
  sarkari: pillarSarkari,
  industry: pillarIndustry,
  roundup: pillarRoundup,
};

/**
 * Today's post.
 *
 * `faqs` comes from the caller because the articles live in Astro's content
 * collection, which cannot be read from a plain module. Each entry is
 * { q, a, title, path }.
 *
 * Returns the plan, plus `scheduled` and `fellBackFrom` so a run can be
 * audited afterwards: knowing that Tuesday posted openings because no
 * government notification cleared the filters is the difference between a
 * working rotation and one that has quietly collapsed onto one pillar.
 */
export async function planRotation({ now = new Date(), faqs = [], force = null } = {}) {
  const today = istDate(now);
  const live = await liveJobs();
  const ctx = { live, now, faqs, stats: statsFor(live) };
  const common = { today, url: SITE, stats: ctx.stats };

  const fest = festivalOn(today);
  if (fest && !force) {
    return { ...common, ...pillarFestival({ fest, ...ctx }), scheduled: 'festival', fellBackFrom: [] };
  }

  const scheduled = force ?? PILLAR_BY_WEEKDAY[istWeekday(now)];
  const order = [scheduled, ...FALLBACK.filter((p) => p !== scheduled)];
  const fellBackFrom = [];

  for (const name of order) {
    let plan = null;
    try {
      plan = await BUILDERS[name](ctx);
    } catch (err) {
      plan = null;
      fellBackFrom.push(`${name} (error: ${err.message})`);
      continue;
    }
    if (plan) return { ...common, ...plan, scheduled, fellBackFrom };
    fellBackFrom.push(name);
  }

  // Everything was empty, which should not happen while the site has listings.
  // Returning null is deliberate: no post is correct, inventing one is not.
  return null;
}
