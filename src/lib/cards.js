// Turns one slide of a post plan into a picture.
//
// Satori takes a React-ish element tree and lays it out with a subset of CSS,
// so these are plain objects rather than JSX: this file has to be importable
// from a scheduled job and from a test script, neither of which has a JSX
// build step.
//
// Two rules that satori enforces and will not warn you about:
//   1. Any element with more than one child needs an explicit display:flex.
//   2. Text has to sit in its own leaf node. A div cannot mix text and
//      elements.
//
// Colours are literals here, deliberately duplicated from tokens.css rather
// than read from it. The site's CSS variables are resolved by a browser and
// there is no browser in this path. The duplication is the price of rendering
// server-side, so if the palette changes in tokens.css it has to change here
// too — which is why they are named identically.

const LIGHT = {
  field1: '#CFC9EC', field2: '#BFC7EC', field3: '#EAD2DA',
  baseA: '#C3BEE4', baseB: '#EEDAD4',
  ink: '#221F33', ink2: '#443F5E', ink3: '#5A5575',
  accent: '#4F55BE',
  anchor: '#262338', onAnchor: '#FFFFFF',
  hairline: 'rgba(70,60,110,0.16)',
  glass: 'rgba(255,255,255,0.55)',
  glassEdge: 'rgba(255,255,255,0.70)',
  ok: '#0E7A4A',
};

/*
 * The dark tone, for reels.
 *
 * The pastel palette is right for the site and wrong for a feed: pale on pale
 * is exactly what a thumb slides past. Reels alternate a dark card against the
 * light ones, which stops the scroll and makes the pastel frames land harder
 * by contrast. Same hues, inverted, so it is still unmistakably the brand.
 */
const D = {
  field1: '#2E3560', field2: '#3A3158', field3: '#382C52',
  baseA: '#221D33', baseB: '#2E2330',
  ink: '#F6F3FF', ink2: '#CFC8E4', ink3: '#A49BC2',
  accent: '#ADB3F7',
  anchor: '#F2EFFA', onAnchor: '#1A1726',
  hairline: 'rgba(255,255,255,0.16)',
  glass: 'rgba(255,255,255,0.10)',
  glassEdge: 'rgba(255,255,255,0.20)',
  ok: '#34D399',
};

/*
 * The palette in force while a card is being built.
 *
 * Swapped by card() and restored before it returns. That is safe only because
 * everything between is synchronous — building the element tree never awaits,
 * so no second card can interleave. If a builder ever becomes async this has
 * to become a parameter threaded through every slide function instead.
 */
let C = LIGHT;

/* Type scale. Reels get everything bigger: a card is on screen for two
 * seconds on a phone held at arm's length, where carousel sizing is unreadable. */
let SCALE = 1;
const z = (n) => Math.round(n * SCALE);

const DISPLAY = 'Sora';
const BODY = 'Grotesk';

/** Element helper. `h(style, children)` or `h(style, 'text')`. */
const h = (style, children) => ({
  type: 'div',
  props: {
    style: { display: 'flex', ...style },
    ...(typeof children === 'string' ? { children } : { children: children ?? [] }),
  },
});

/** A text leaf. */
const t = (style, text) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children: String(text) } });

export const SQUARE = { width: 1080, height: 1080 };
export const STORY = { width: 1080, height: 1920 };

/*
 * The background.
 *
 * A flat colour reads as cheap at this size, and a photographic background
 * makes the text unreadable at thumbnail scale, which is where most of these
 * are actually seen. So: a soft pastel wash built from the site's own field
 * colours, with the text sitting on it directly.
 */
const backdrop = (w, hgt, tint) => ([
  h({ position: 'absolute', top: 0, left: 0, width: w, height: hgt,
      background: `linear-gradient(145deg, ${tint[0]} 0%, ${tint[1]} 55%, ${tint[2]} 100%)` }),
  h({ position: 'absolute', top: -hgt * 0.22, left: -w * 0.18,
      width: w * 0.85, height: w * 0.85, borderRadius: w,
      background: tint[3] ?? 'rgba(255,255,255,0.38)' }),
  h({ position: 'absolute', bottom: -hgt * 0.16, right: -w * 0.24,
      width: w * 0.78, height: w * 0.78, borderRadius: w,
      background: tint[4] ?? 'rgba(255,255,255,0.22)' }),
]);

/*
 * Each pillar gets its own wash, so a glance at the grid shows the rotation.
 *
 * A function, not a constant. Built at module load it would capture whichever
 * palette was active then — which is how dark reel cards ended up with a
 * pastel gradient painted over a dark base.
 */
const tints = () => ({
  openings:  [C.field2, C.field1, C.baseB],
  closing:   [C.field3, C.baseB, C.field1],
  walkins:   [C.field1, C.baseA, C.field2],
  education: [C.baseB, C.field3, C.field1],
  sarkari:   [C.field2, C.baseA, C.field1],
  industry:  [C.field1, C.field2, C.baseA],
  roundup:   [C.baseA, C.field1, C.field3],
  festival:  [C.field3, C.baseB, C.field1],
});

/*
 * The wordmark, set in type rather than placed as an image.
 *
 * The logo file is a dark raster and would need masking to sit on a pastel
 * card, so it is rebuilt here from the same letters: "Jo", a "B" in the accent
 * colour, then "mania".
 *
 * NO gap, and no margin between the three pieces. A flex gap puts space
 * between every child including bare text, which is what once rendered the
 * name as "Jo B mania". If this ever needs spacing, space the row around the
 * wordmark, never inside it.
 */
const wordmark = (size = 28) =>
  h({ alignItems: 'baseline' }, [
    t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, color: C.ink, letterSpacing: -0.5 }, 'Jo'),
    t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, color: C.accent, letterSpacing: -0.5 }, 'B'),
    t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, color: C.ink, letterSpacing: -0.5 }, 'mania'),
  ]);

/** The strip along the bottom of every card. */
const footer = (w, { index, total, url }) =>
  h({ position: 'absolute', left: 72, right: 72, bottom: 56,
      width: w - 144, alignItems: 'center', justifyContent: 'space-between' }, [
    h({ alignItems: 'baseline' }, [
      wordmark(28),
      t({ fontFamily: BODY, fontWeight: 400, fontSize: z(22), color: C.ink3, marginLeft: z(14) },
        url ?? 'jobmania.dpdns.org'),
    ]),
    total > 1
      ? t({ fontFamily: BODY, fontWeight: 700, fontSize: z(22), color: C.ink3 }, `${index + 1} / ${total}`)
      : h({}),
  ]);

const kicker = (text) =>
  h({ alignSelf: 'flex-start', paddingTop: z(10), paddingBottom: z(10), paddingLeft: z(22), paddingRight: z(22),
      borderRadius: 999, background: C.glass, border: `2px solid ${C.glassEdge}`, marginBottom: z(32) },
    [t({ fontFamily: BODY, fontWeight: 700, fontSize: z(24), color: C.accent,
         textTransform: 'uppercase', letterSpacing: 2 }, text)]);

/*
 * Type size that adapts to how much there is to say.
 *
 * A fixed size either strands a six-word headline in the middle of an empty
 * card or runs a long one off the edge. Satori cannot measure text and reflow,
 * so the size is picked from the character count up front.
 *
 * The scale below is calibrated against the usable width, 936px once the 72px
 * gutters are taken off, assuming roughly 0.56em average advance for Sora
 * Bold. It aims for two or three lines. The first version was tuned by eye and
 * pushed "18 openings close within 4 days" off the right-hand edge.
 */
const fitTitle = (text, max = 88, min = 38) => z(fitRaw(text, max, min));
const fitRaw = (text, max, min) => {
  const n = String(text).length;
  const scale = max / 88;
  if (n <= 20) return max;
  if (n <= 32) return Math.round(72 * scale);
  if (n <= 48) return Math.round(62 * scale);
  if (n <= 70) return Math.round(54 * scale);
  if (n <= 100) return Math.round(46 * scale);
  return min;
};

// ------------------------------------------------------------------ slides

const slideHero = (s, w) => [
  s.kicker ? kicker(s.kicker) : h({}),
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: fitTitle(s.fit ?? s.title),
      color: C.ink, lineHeight: 1.08, letterSpacing: -1.5 }, s.title),
  s.sub
    ? t({ fontFamily: BODY, fontWeight: 400, fontSize: z(38), color: C.ink2,
          marginTop: z(28), lineHeight: 1.35 }, s.sub)
    : h({}),
];

const slideList = (s, w) => [
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: z(52), color: C.ink,
      marginBottom: z(36), letterSpacing: -0.8 }, s.title),
  h({ flexDirection: 'column' },
    (s.items ?? []).slice(0, 5).map((it, i) =>
      h({ flexDirection: 'column', paddingTop: z(22), paddingBottom: z(22),
          borderTop: i === 0 ? 'none' : `2px solid ${C.hairline}` }, [
        t({ fontFamily: BODY, fontWeight: 700, fontSize: z(38), color: C.ink }, it.primary),
        it.secondary
          ? t({ fontFamily: BODY, fontWeight: 400, fontSize: z(28), color: C.ink3, marginTop: z(6) }, it.secondary)
          : h({}),
      ]))),
];

const slideStat = (s, w) => [
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: z(52), color: C.ink,
      marginBottom: z(44), letterSpacing: -0.8 }, s.title),
  h({ flexDirection: 'column' },
    (s.rows ?? []).slice(0, 4).map((r) =>
      h({ alignItems: 'baseline', marginBottom: z(30) }, [
        t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: z(76), color: C.accent,
            letterSpacing: -2, marginRight: z(20) }, r[0]),
        t({ fontFamily: BODY, fontWeight: 400, fontSize: z(32), color: C.ink2 }, r[1]),
      ]))),
  s.note ? t({ fontFamily: BODY, fontWeight: 400, fontSize: z(24), color: C.ink3, marginTop: z(10) }, s.note) : h({}),
];

const slideQA = (s, w) => [
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: fitTitle(s.fit ?? s.question, 64, 40),
      color: C.ink, lineHeight: 1.14, marginBottom: z(34), letterSpacing: -0.8 }, s.question),
  t({ fontFamily: BODY, fontWeight: 400, fontSize: String(s.fit ?? s.answer).length > 240 ? z(30) : z(36),
      color: C.ink2, lineHeight: 1.45 }, s.answer),
];

const slideNews = (s, w) => [
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: fitTitle(s.fit ?? s.title, 60, 38),
      color: C.ink, lineHeight: 1.18, letterSpacing: -0.8 }, s.title),
  h({ alignItems: 'center', marginTop: z(36) }, [
    h({ width: 8, height: 8, borderRadius: 8, background: C.accent, marginRight: z(14) }),
    t({ fontFamily: BODY, fontWeight: 700, fontSize: z(28), color: C.ink2 }, s.source ?? ''),
    s.date ? t({ fontFamily: BODY, fontWeight: 400, fontSize: z(28), color: C.ink3, marginLeft: z(12) }, `· ${s.date}`) : h({}),
  ]),
];

const slideCTA = (s, w) => [
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: fitTitle(s.fit ?? s.title, 64, 40),
      color: C.ink, lineHeight: 1.14, marginBottom: z(28), letterSpacing: -0.8 }, s.title),
  s.body ? t({ fontFamily: BODY, fontWeight: 400, fontSize: z(34), color: C.ink2, lineHeight: 1.4 }, s.body) : h({}),
  s.link
    ? h({ alignSelf: 'flex-start', marginTop: z(42), paddingTop: z(20), paddingBottom: z(20),
          paddingLeft: z(34), paddingRight: z(34), borderRadius: 18, background: C.anchor },
        [t({ fontFamily: BODY, fontWeight: 700, fontSize: z(30), color: C.onAnchor }, s.link)])
    : h({}),
];

const slideFestival = (s, w) => [
  t({ fontFamily: DISPLAY, fontWeight: 700, fontSize: fitTitle(s.fit ?? s.greeting, 110, 56),
      color: C.ink, lineHeight: 1.04, letterSpacing: -2 }, s.greeting),
  s.line ? t({ fontFamily: BODY, fontWeight: 400, fontSize: z(38), color: C.ink2, marginTop: z(34) }, s.line) : h({}),
];

const SLIDES = {
  hero: slideHero, list: slideList, stat: slideStat, qa: slideQA,
  news: slideNews, cta: slideCTA, festival: slideFestival,
};

/**
 * One slide, as a satori element tree.
 *
 * `kind` picks the background wash; `index` and `total` drive the page
 * counter. An unknown slide type throws rather than rendering an empty card,
 * because a blank slide in a published carousel is worse than a failed job.
 */
export function card(slide, { kind = 'openings', index = 0, total = 1, size = SQUARE, url, tone = 'light', reel = false } = {}) {
  const build = SLIDES[slide.type];
  if (!build) throw new Error(`unknown slide type: ${slide.type}`);
  const { width: w, height: hgt } = size;

  C = tone === 'dark' ? D : LIGHT;
  SCALE = reel ? 1.34 : 1;

  return h({
    width: w, height: hgt, position: 'relative', flexDirection: 'column',
    background: C.baseA, fontFamily: BODY,
  }, [
    ...backdrop(w, hgt, [
      ...(tints()[kind] ?? tints().openings),
      tone === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.38)',
      tone === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.22)',
    ]),
    /*
     * A definite width, not padding on a full-width box. Satori will not wrap
     * a text node whose container has no resolved width, so with padding alone
     * long headlines ran straight off the right-hand edge instead of breaking.
     */
    h({
      position: 'absolute', top: 0, left: 72, width: w - 144, height: hgt,
      flexDirection: 'column', justifyContent: 'center',
      // Reels sit the content well above centre. A phone is held low, the
      // bottom third is under a thumb and Instagram's own caption overlay,
      // and text dead centre of a 1920px frame reads as unanchored.
      paddingBottom: reel ? Math.round(hgt * 0.26) : z(120),
    }, build(slide, w - 144)),
    footer(w, { index, total, url }),
  ]);
}
