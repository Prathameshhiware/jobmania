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


/*
 * Hold multipliers, not durations.
 *
 * The first version held six cards across thirty seconds, which forces five
 * seconds a card however the weights are set — and five seconds on a static
 * frame is a slideshow. The fix is not faster transitions, it is more beats:
 * a dozen cards at two and a half seconds reads as fast, where six at five
 * reads as broken.
 *
 * So each builder now breaks its subject into many small statements instead
 * of a few dense ones. A label and its value get their own frames, because
 * two short cards land harder than one card with two lines on it.
 */
const HOOK = 2.6;
const BEAT = 1.5;
const PUNCH = 1.2;      // a short one: a single word or number
const CLOSE = 2.2;

/*
 * Walk-ins are deliberately not made into reels.
 *
 * They are the most useful thing this site has and they still lead the
 * carousel, the site and the Saturday post. But a drive is over in a day, and
 * a reel keeps being served for weeks — so the format outlives the thing it
 * is advertising, and someone travels across a city to a drive that finished
 * a fortnight ago. Evergreen subjects only here.
 */
export const NO_REEL = new Set(['walkins']);

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

/** One opening, broken into short beats rather than a few dense cards. */
function openingReel(j, plan) {
  const posted = has(j.posted_at) ? istShort(j.posted_at) : null;
  const exp = experience(j);
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: posted ? `Posted ${posted}` : 'Now hiring',
        title: cleanCompany(j.company_name), sub: '' } },
    { weight: BEAT + 0.5, slide: { type: 'hero', kicker: 'The role', title: clip(j.title, 64), sub: '' } },
    beat('Where', j.city_primary ?? 'Across India', PUNCH),
    j.work_mode ? beat('Work mode', j.work_mode.replace(/^\w/, (c) => c.toUpperCase()), PUNCH) : null,
    exp ? beat('Experience', exp, PUNCH) : null,
    has(j.qualification) ? beat('Who can apply', clip(j.qualification, 80), BEAT) : null,
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'Apply in 48 hours', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '',
        title: 'Recruiters stop reading once they have a shortlist', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'The link goes to them, not us', sub: '' } },
    { weight: PUNCH + 0.3, slide: { type: 'hero', kicker: '', title: 'No fee. Ever.', sub: '' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'On the site now', body: '',
        link: `${plan.url}/c/just-posted` } },
  ];
}

/** One role about to close. */
function closingReel(j, plan) {
  const when = has(j.valid_through) ? istShort(j.valid_through) : null;
  const exp = experience(j);
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: when ? `Closes ${when}` : 'Closing soon',
        title: cleanCompany(j.company_name), sub: '' } },
    { weight: BEAT + 0.5, slide: { type: 'hero', kicker: 'The role', title: clip(j.title, 64), sub: '' } },
    beat('Where', j.city_primary ?? 'Across India', PUNCH),
    exp ? beat('Experience', exp, PUNCH) : null,
    has(j.qualification) ? beat('Who can apply', clip(j.qualification, 80), BEAT) : null,
    when ? { weight: BEAT + 0.4, slide: { type: 'hero', kicker: '', title: `Last day ${when}`, sub: '' } } : null,
    { weight: BEAT, slide: { type: 'hero', kicker: '',
        title: 'A deadline is the last possible day, not the best one', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '',
        title: 'Employers close early once they have enough', sub: '' } },
    { weight: PUNCH + 0.3, slide: { type: 'hero', kicker: '', title: 'Do it tonight', sub: '' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'Open now on JoBmania', body: '', link: `${plan.url}/jobs` } },
  ];
}

/** One government recruitment notification. */
function sarkariReel(x, plan) {
  const posts = x.vacancies ? Number(x.vacancies).toLocaleString('en-IN') : null;
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: 'Government recruitment',
        title: x.body, sub: '' } },
    posts ? { weight: PUNCH + 0.4, slide: { type: 'hero', kicker: 'Vacancies', title: posts, sub: '' } }
          : { weight: PUNCH + 0.4, slide: { type: 'hero', kicker: '', title: 'Applications open', sub: '' } },
    { weight: BEAT + 0.6, slide: { type: 'news', title: clip(x.title, 140), source: x.source, date: istShort(x.date) } },
    beat('Apply here', x.site, BEAT),
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'Only on the official site', sub: '' } },
    { weight: PUNCH + 0.3, slide: { type: 'hero', kicker: '', title: 'Never pay a fee', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '',
        title: 'Nobody can sell you a government job', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '',
        title: 'We did not verify this one', sub: `Reported by ${x.source}. We do not list government vacancies.` } },
    { weight: CLOSE, slide: { type: 'cta', title: 'Read the official notification', body: '', link: x.site } },
  ];
}

/** One news story, with our own measured numbers as the counterweight. */
function industryReel(x, plan) {
  const st = plan.stats ?? {};
  const n = (v) => Number(v ?? 0).toLocaleString('en-IN');
  return [
    { weight: HOOK, slide: { type: 'hero', kicker: 'This week in hiring', title: clip(x.title, 100), sub: '' } },
    { weight: BEAT + 0.6, slide: { type: 'news', title: clip(x.title, 140), source: x.source, date: istShort(x.date) } },
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'News tells you the direction', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'It does not tell you what you can apply to', sub: '' } },
    st.live ? { weight: PUNCH + 0.4, slide: { type: 'hero', kicker: 'Live right now', title: n(st.live), sub: 'openings' } } : null,
    st.freshers ? { weight: PUNCH + 0.4, slide: { type: 'hero', kicker: 'Of those', title: n(st.freshers), sub: 'open to freshers' } } : null,
    st.companies ? { weight: PUNCH + 0.4, slide: { type: 'hero', kicker: 'From', title: n(st.companies), sub: 'employers' } } : null,
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'Every link re-tested through the day', sub: '' } },
    { weight: BEAT, slide: { type: 'hero', kicker: '', title: 'Closed roles come down', sub: '' } },
    { weight: CLOSE, slide: { type: 'cta', title: 'See what is open', body: '', link: `${plan.url}/jobs` } },
  ];
}

/** One term, or one question from an article. */
function educationReel(plan) {
  const qa = plan.slides.find((v) => v.type === 'qa');
  const cta = plan.slides.find((v) => v.type === 'cta');
  const hero = plan.slides.find((v) => v.type === 'hero');
  if (!qa) return null;

  const out = [{ weight: HOOK, slide: { type: 'hero', kicker: 'Know the word', title: hero?.title ?? qa.question, sub: '' } }];

  /*
   * The definition is broken on sentence boundaries rather than shown whole.
   * A paragraph held for six seconds is read by nobody; three statements at
   * two seconds each are read by everyone.
   */
  const sentences = String(qa.answer).split(/(?<=\.)\s+/).filter(Boolean);
  const chunks = [];
  let buf = '';
  for (const sentence of sentences) {
    if ((buf + ' ' + sentence).trim().length > 110 && buf) { chunks.push(buf.trim()); buf = sentence; }
    else buf = (buf + ' ' + sentence).trim();
  }
  if (buf) chunks.push(buf.trim());
  for (const c of chunks.slice(0, 4)) out.push({ weight: BEAT + 0.5, slide: { type: 'qa', question: '', answer: c } });

  if (cta?.body) {
    out.push({ weight: PUNCH + 0.3, slide: { type: 'hero', kicker: '', title: 'Why it matters', sub: '' } });
    out.push({ weight: BEAT + 0.4, slide: { type: 'qa', question: '', answer: cta.body } });
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
  openings: openingReel, closing: closingReel,
  sarkari: sarkariReel, industry: industryReel,
};

/**
 * The cards of one reel, each with a hold multiplier.
 *
 * `pick` chooses which subject when a pillar has several, so a week of reels
 * covers a week of different drives rather than the same one every day.
 *
 * Returns [{ slide, weight }]. The weight scales the reading pause after a
 * card's text has finished arriving; the arrival itself is timed by the
 * encoder from the number of reveal states.
 */
export function reelFrames(plan, { pick = 0 } = {}) {
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

  // No normalising to a fixed length. The weights are hold multipliers, and
  // the encoder works out how long each card actually needs from how much
  // text is on it. A reel is as long as its content, not padded to a round
  // number — which is what left two and a half dead seconds on every beat.
  return raw.filter(Boolean).map((f) => ({ slide: f.slide, weight: f.weight / BEAT }));
}

/** How many different reels this plan could make today. */
export const subjectCount = (plan) =>
  plan?.subjects?.length ? plan.subjects.length : 1;
