// A post plan, expanded into the frames of a thirty second reel.
//
// A carousel and a reel want different things. A carousel card can hold five
// companies because the reader controls the pace and can sit on it. A reel
// card cannot: it is on screen for three seconds whether the viewer is ready
// or not, so each one gets a single idea and the list is dealt out one item at
// a time.
//
// The shape is the same every time, because it is the shape that works:
//
//   hook      one number, held long enough to stop a thumb
//   context   why it matters, before the detail
//   items     one per card, dealt out
//   close     where to go, and the fee warning
//
// Nothing new is asserted here. Every frame is built from the same plan the
// carousel uses, which is built from the database and from named publishers.
// This only decides what goes on which card and for how long.

import { lookup } from './glossary.js';

const SECONDS = 30;

/*
 * Pillars whose reel needs a definition before the detail, and the glossary
 * term that supplies it. Only where the word genuinely needs explaining to
 * someone seeing it for the first time.
 */
const GLOSS_FOR = {
  walkins: 'Walk-in interview',
  closing: 'Shortlisted',
  openings: 'ATS',
};

/** Pull the list items out of whichever slide carries them. */
const itemsOf = (plan) => plan.slides.find((s) => s.type === 'list')?.items ?? [];
const statOf = (plan) => plan.slides.find((s) => s.type === 'stat');
const qaOf = (plan) => plan.slides.find((s) => s.type === 'qa');
const ctaOf = (plan) => plan.slides.find((s) => s.type === 'cta');
const heroOf = (plan) => plan.slides.find((s) => s.type === 'hero');
const newsOf = (plan) => plan.slides.find((s) => s.type === 'news');

/*
 * Weights, not seconds.
 *
 * The hook earns more time than anything else because it is the only frame
 * most viewers will see, and the closing card needs long enough to read a URL
 * and decide. Everything is normalised to thirty seconds at the end, so a post
 * with three items and one with five both come out the right length rather
 * than one running short.
 */
const HOOK = 3.2;
const CONTEXT = 2.2;
const ITEM = 2.0;
const CLOSE = 2.6;

/**
 * The frames of the reel, each with how long it holds.
 *
 * Returns [{ slide, weight }], normalised to SECONDS by `withTimings`.
 */
function frames(plan) {
  const out = [];
  const hero = heroOf(plan);
  const cta = ctaOf(plan);
  const items = itemsOf(plan);

  // ---- hook
  out.push({
    weight: HOOK,
    slide: {
      type: 'hero',
      kicker: hero?.kicker ?? plan.kind,
      title: hero?.title ?? plan.headline,
      sub: hero?.sub ?? '',
    },
  });

  // ---- context, drawn from whatever the pillar actually has
  const qa = qaOf(plan);
  const news = newsOf(plan);
  const stat = statOf(plan);

  if (!qa && !news && !stat && GLOSS_FOR[plan.kind]) {
    /*
     * Some pillars carry no explaining slide at all: walk-ins is a hook, a
     * list and a call to action. On a carousel that is fine, because the list
     * speaks for itself. On a reel it means jumping from a number straight to
     * five company names, with nothing telling a first-time viewer what a
     * walk-in actually is.
     *
     * The glossary already answers that, in words a person wrote and checked.
     */
    const term = lookup(GLOSS_FOR[plan.kind]);
    if (term) {
      out.push({
        weight: CONTEXT + 1,
        slide: { type: 'qa', question: term.question ?? `What is ${term.term}?`, answer: term.short },
      });
    }
  } else if (qa) {
    // Education: the answer is the whole point, so it gets two cards if long.
    const a = String(qa.answer);
    if (a.length > 180) {
      const cut = a.lastIndexOf('. ', Math.floor(a.length * 0.6));
      const at = cut > 60 ? cut + 1 : Math.floor(a.length / 2);
      out.push({ weight: CONTEXT + 1, slide: { type: 'qa', question: qa.question, answer: a.slice(0, at).trim() } });
      out.push({ weight: CONTEXT + 1, slide: { type: 'qa', question: '', answer: a.slice(at).trim() } });
    } else {
      out.push({ weight: CONTEXT + 2, slide: { type: 'qa', question: qa.question, answer: a } });
    }
  } else if (news) {
    out.push({ weight: CONTEXT + 1.5, slide: news });
  } else if (stat) {
    out.push({ weight: CONTEXT + 1, slide: stat });
  }

  // ---- items, one card each
  for (const it of items.slice(0, 5)) {
    out.push({
      weight: ITEM,
      slide: {
        type: 'hero',
        kicker: '',
        title: it.primary,
        sub: it.secondary ?? '',
      },
    });
  }

  // ---- close
  out.push({
    weight: CLOSE,
    slide: {
      type: 'cta',
      title: cta?.title ?? 'Everything is on the site',
      body: cta?.body ?? '',
      link: cta?.link ?? plan.url,
    },
  });

  return out;
}

/**
 * The same frames, with real durations that add up to thirty seconds.
 *
 * Normalising rather than fixing each duration means the reel is always the
 * length it claims to be, whether the pillar produced three cards or eight.
 */
export function reelFrames(plan, { seconds = SECONDS } = {}) {
  const raw = frames(plan);
  const total = raw.reduce((a, f) => a + f.weight, 0);
  return raw.map((f) => ({ slide: f.slide, seconds: (f.weight / total) * seconds }));
}

export const REEL_SECONDS = SECONDS;
