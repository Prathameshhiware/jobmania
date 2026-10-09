// One subject, told properly, as the frames of a thirty second reel.
//
// This used to deal out five companies as five cards. That is a digest, and a
// digest is the wrong shape for a reel: nobody watches thirty seconds to learn
// five things shallowly, and nothing in it is worth sending to a friend. A
// carousel can be a digest because the reader sets the pace and can go back.
// A reel cannot.
//
// So a reel is about exactly one thing — one walk-in drive, one opening, one
// notification, one term — and uses its thirty seconds to answer the
// questions a person actually has about that one thing: what, when, where,
// who can apply, what it costs. The list is where the other thirty-seven
// drives live.
//
// Which subject a given day gets is decided by the date, so consecutive reels
// cover different drives and the choice is reproducible afterwards.
//
// Nothing new is asserted. Every frame is built from a row in our own
// database or from a named publisher, the same as the carousel.

import { lookup } from './glossary.js';
import { istShort, istLong } from './ist.js';
import { cleanCompany } from './rotation.js';

const SECONDS = 30;

/** Weights, normalised to SECONDS at the end, not literal durations. */
const HOOK = 3.4;
const BEAT = 2.1;
const CLOSE = 2.8;

const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const clip = (s, n) => (String(s ?? '').length > n ? String(s).slice(0, n - 1).trimEnd() + '…' : String(s ?? ''));

/** A plain-language experience line, or null when the employer did not say. */
function experience(j) {
  if (has(j.exp_min) || has(j.exp_max)) {
    const lo = Number(j.exp_min ?? 0);
    const hi = has(j.exp_max) ? Number(j.exp_max) : null;
    const yr = (n) => `${n} year${Number(n) === 1 ? '' : 's'}`;
    if (lo === 0 && (hi === 0 || hi === null)) return 'Freshers can apply';
    if (lo === 0 && hi) return `0 to ${yr(hi)}`;
    return hi ? `${lo} to ${yr(hi)}` : `${lo}+ years`;
  }
  if (j.experience_level === 'fresher') return 'Freshers can apply';
  if (j.experience_level === '0-2') return 'Up to 2 years';
  return null;
}

/** A beat, if there is something real to put in it. */
const beat = (title, sub, weight = BEAT) =>
  has(title) ? { weight, slide: { type: 'hero', kicker: '', title: String(title), sub: sub ?? '' } } : null;

// ----------------------------------------------------------- the subjects

/** One walk-in drive: the most time-critical thing this site knows. */
function walkinReel(j, plan) {
  const co = cleanCompany(j.company_name);
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: `Walk-in · ${istShort(j.walkin_start)}`,
        title: co, sub: clip(j.title, 70) } },
    beat(istLong(j.walkin_start), has(j.walkin_time) ? j.walkin_time : 'Check the timing on the site', BEAT + 0.4),
    beat(j.city_primary, has(j.walkin_venue) ? clip(j.walkin_venue, 110) : null, BEAT + 0.6),
    beat(experience(j), has(j.qualification) ? clip(j.qualification, 90) : null),
    { weight: BEAT + 0.3, slide: { type: 'hero', kicker: '', title: 'No registration fee',
        sub: 'No genuine employer in India charges a candidate to attend. If anyone asks, walk away.' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'Confirm before you travel',
        body: 'Drives get moved at short notice. The venue and timing on the site are the employer’s own words.',
        link: `${plan.url}/c/walk-ins` } },
  ];
}

/** One opening. */
function openingReel(j, plan) {
  const posted = has(j.posted_at) ? istShort(j.posted_at) : null;
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: posted ? `Posted ${posted}` : 'New opening',
        title: cleanCompany(j.company_name), sub: clip(j.title, 70) } },
    beat(j.city_primary ?? 'Across India', j.work_mode ? j.work_mode.replace(/^\w/, (c) => c.toUpperCase()) : null),
    beat(experience(j), has(j.qualification) ? clip(j.qualification, 90) : null, BEAT + 0.4),
    { weight: BEAT + 0.4, slide: { type: 'hero', kicker: '', title: 'Apply in 48 hours',
        sub: 'Recruiters stop reading once they have a shortlist. Early beats perfect.' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'Straight to the employer',
        sub: 'The apply link goes to their own page, never through us. No fee, ever.' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'On the site now',
        body: 'Every apply link is re-tested through the day, and a role comes down when it closes.',
        link: `${plan.url}/c/just-posted` } },
  ];
}

/** One role about to close. */
function closingReel(j, plan) {
  const when = has(j.valid_through) ? istShort(j.valid_through) : null;
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: when ? `Closes ${when}` : 'Closing soon',
        title: cleanCompany(j.company_name), sub: clip(j.title, 70) } },
    beat(j.city_primary ?? 'Across India', j.work_mode ? j.work_mode.replace(/^\w/, (c) => c.toUpperCase()) : null),
    beat(experience(j), has(j.qualification) ? clip(j.qualification, 90) : null, BEAT + 0.4),
    { weight: BEAT + 0.6, slide: { type: 'hero', kicker: '', title: when ? `Last day ${when}` : 'Closing this week',
        sub: 'A deadline is the last possible day, not the best one. Employers close early once they have enough.' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'Do it tonight',
        body: 'The listing carries the employer’s own description and links straight to their form.',
        link: `${plan.url}/jobs` } },
  ];
}

/** One government recruitment notification. */
function sarkariReel(s, plan) {
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: 'Government recruitment',
        title: s.body, sub: s.vacancies ? `${Number(s.vacancies).toLocaleString('en-IN')} posts` : 'Applications open' } },
    { weight: BEAT + 0.8, slide: { type: 'news', title: clip(s.title, 150), source: s.source, date: istShort(s.date) } },
    { weight: BEAT + 0.4, slide: { type: 'hero', kicker: '', title: 'Apply on the official site',
        sub: s.site } },
    { weight: BEAT + 0.4, slide: { type: 'hero', kicker: '', title: 'Never pay a fee',
        sub: 'No one can sell you a government job. Anyone who offers is running a scam.' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'We did not verify this one',
        body: `Reported by ${s.source}. We do not list government vacancies — read the official notification before applying.`,
        link: s.site } },
  ];
}

/** One news story. */
function industryReel(s, plan) {
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: 'This week in hiring',
        title: clip(s.title, 110), sub: '' } },
    { weight: BEAT + 0.6, slide: { type: 'news', title: clip(s.title, 150), source: s.source, date: istShort(s.date) } },
    { weight: BEAT + 0.6, slide: { type: 'hero', kicker: '', title: 'What it means for you',
        sub: 'News tells you the direction. The site tells you which roles you can actually apply to today.' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'What is open right now',
        body: 'Verified openings, re-tested through the day, every link going to the employer.',
        link: `${plan.url}/jobs` } },
  ];
}

/** One term, or one question from an article. */
function educationReel(plan) {
  const qa = plan.slides.find((x) => x.type === 'qa');
  const cta = plan.slides.find((x) => x.type === 'cta');
  const hero = plan.slides.find((x) => x.type === 'hero');
  if (!qa) return null;

  const a = String(qa.answer);
  const out = [{ weight: HOOK, slide: { type: 'hero', kicker: 'Know the word', title: hero?.title ?? qa.question, sub: '' } }];

  // A long definition is split on a sentence boundary rather than dumped on
  // one card, so it is readable at two seconds a frame.
  if (a.length > 150) {
    const cut = a.lastIndexOf('. ', Math.floor(a.length * 0.58));
    const at = cut > 50 ? cut + 1 : Math.floor(a.length / 2);
    out.push({ weight: BEAT + 1.0, slide: { type: 'qa', question: '', answer: a.slice(0, at).trim() } });
    out.push({ weight: BEAT + 1.0, slide: { type: 'qa', question: '', answer: a.slice(at).trim() } });
  } else {
    out.push({ weight: BEAT + 1.6, slide: { type: 'qa', question: '', answer: a } });
  }

  if (cta?.body) {
    out.push({ weight: BEAT + 0.6, slide: { type: 'hero', kicker: '', title: 'Why it matters', sub: cta.body } });
  }
  out.push({ weight: CLOSE, slide: { type: 'cta', title: cta?.title ?? 'More on the site', body: '', link: cta?.link ?? plan.url } });
  return out;
}

/** Sunday. The one day a digest is the subject. */
function roundupReel(plan) {
  const stat = plan.slides.find((x) => x.type === 'stat');
  const cta = plan.slides.find((x) => x.type === 'cta');
  const rows = (stat?.rows ?? []).slice(0, 4);
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: 'This week', title: 'Where things stand', sub: '' } },
    ...rows.map(([value, label]) => ({ weight: BEAT, slide: { type: 'hero', kicker: '', title: String(value), sub: label } })),
    { weight: BEAT + 0.4, slide: { type: 'hero', kicker: '', title: 'Re-tested all day',
        sub: 'A role comes down when it closes, instead of staying up to collect applications nobody reads.' } },
    { weight: CLOSE, slide: { type: 'cta', title: cta?.title ?? 'The full roundup', body: '', link: cta?.link ?? plan.url } },
  ];
}

const BUILDERS = {
  walkins: walkinReel, openings: openingReel, closing: closingReel,
  sarkari: sarkariReel, industry: industryReel,
};

/**
 * The frames of one reel, each with how long it holds.
 *
 * `pick` chooses which subject when a pillar has several, so a week of reels
 * covers a week of different drives rather than the same one every day.
 *
 * Returns [{ slide, seconds }] normalised to thirty seconds, so a subject with
 * four beats and one with six both come out the right length.
 */
export function reelFrames(plan, { seconds = SECONDS, pick = 0 } = {}) {
  let raw = null;

  if (plan.kind === 'education') raw = educationReel(plan);
  else if (plan.kind === 'roundup') raw = roundupReel(plan);
  else if (plan.kind === 'festival') raw = null;
  else if (plan.subject) raw = BUILDERS[plan.kind]?.(plan.subject, plan) ?? null;
  else if (plan.subjects?.length) {
    const j = plan.subjects[pick % plan.subjects.length];
    raw = BUILDERS[plan.kind]?.(j, plan) ?? null;
  }

  // Festival days, and anything a builder cannot handle, fall back to the
  // carousel's own slides rather than failing. A greeting is one idea already.
  if (!raw) {
    raw = plan.slides.map((slide, i) => ({
      weight: i === 0 ? HOOK : i === plan.slides.length - 1 ? CLOSE : BEAT + 1,
      slide,
    }));
  }

  const list = raw.filter(Boolean);
  const total = list.reduce((a, f) => a + f.weight, 0);
  return list.map((f) => ({ slide: f.slide, seconds: (f.weight / total) * seconds }));
}

/** How many different reels this plan could make today. */
export const subjectCount = (plan) =>
  plan?.subjects?.length ? plan.subjects.length : 1;

export const REEL_SECONDS = SECONDS;
