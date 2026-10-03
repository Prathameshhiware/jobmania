// Renders one slide of today's Instagram carousel as a PNG.
//
// Instagram's publishing API does not accept an upload: it fetches the image
// from a public URL. So the carousel has to exist as URLs on this site, and
// these are them — /api/card/0.png, /api/card/1.png, /api/card/2.png.
//
// Deliberately takes no text from the caller. The slide is whatever today's
// plan says it is, chosen in daily-post.js from the live database. An endpoint
// that rendered arbitrary query-string text would be an open image generator
// for anyone who found it: both an abuse vector and a way for a stranger to put
// words in our own brand's mouth.
//
// @vercel/og only runs inside Vercel's bundler. Run standalone under node it
// fails with "Dynamic require of fs is not supported", so this route cannot be
// tested by importing it locally; it is tested by deploying and fetching the
// URL, which is the environment it actually runs in.

import { ImageResponse } from '@vercel/og';
import { planDailyPost } from '../../../lib/daily-post.js';

export const prerender = false;

/** An element tree without JSX, so one file does not pull in a compiler step. */
const el = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    children: children.length === 1 ? children[0] : children.filter(Boolean),
  },
});

const INK = '#221F33';
const INK2 = '#443F5E';
const INK3 = '#5A5575';
const GREEN = '#0E7A4A';
const FIELD = 'linear-gradient(150deg,#C3BEE4,#EEDAD4)';
const TICK = '✓';

/** The brand lockup: white wordmark on the dark badge, as used everywhere. */
const logo = () =>
  el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        background: '#262338',
        borderRadius: 34,
        padding: '22px 34px',
        alignSelf: 'flex-start',
      },
    },
    el('div', { style: { display: 'flex', fontSize: 50, fontWeight: 800, color: '#fff', letterSpacing: -2 } }, 'Jo'),
    el('div', { style: { display: 'flex', fontSize: 50, fontWeight: 800, color: '#ABB2F5', letterSpacing: -2 } }, 'B'),
    el('div', { style: { display: 'flex', fontSize: 50, fontWeight: 800, color: '#fff', letterSpacing: -2 } }, 'mania'),
    el(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 20,
          width: 38,
          height: 38,
          borderRadius: 19,
          background: GREEN,
          color: '#fff',
          fontSize: 24,
          fontWeight: 800,
        },
      },
      TICK,
    ),
  );

const foot = (link) =>
  el(
    'div',
    { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: INK2 } },
    link || 'jobmania.dpdns.org',
  );

/** One slide of the plan, as an element tree. */
function slideTree(slide, link) {
  const frame = (...kids) =>
    el(
      'div',
      {
        style: {
          width: '1080px',
          height: '1350px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '96px 86px',
          background: FIELD,
          color: INK,
          fontFamily: 'sans-serif',
        },
      },
      logo(),
      el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' } },
        ...kids,
      ),
      foot(link),
    );

  if (slide.type === 'festival') {
    return el(
      'div',
      {
        style: {
          width: '1080px',
          height: '1350px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#262338',
          color: '#fff',
          fontFamily: 'sans-serif',
        },
      },
      el('div', { style: { display: 'flex', fontSize: 104, fontWeight: 800, letterSpacing: -4 } }, slide.greeting),
      el(
        'div',
        { style: { display: 'flex', fontSize: 34, color: '#ABB2F5', fontWeight: 700, letterSpacing: 4, marginTop: 36 } },
        String(slide.line).toUpperCase(),
      ),
      el(
        'div',
        { style: { display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.72)', marginTop: 30 } },
        'jobmania.dpdns.org',
      ),
    );
  }

  if (slide.type === 'hero') {
    return frame(
      el(
        'div',
        { style: { display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: 5, color: INK3, marginBottom: 26 } },
        String(slide.kicker).toUpperCase(),
      ),
      el('div', { style: { display: 'flex', fontSize: 94, fontWeight: 800, lineHeight: 1.04, letterSpacing: -4 } }, slide.title),
      slide.sub &&
        el('div', { style: { display: 'flex', fontSize: 40, color: INK2, marginTop: 34, fontWeight: 500 } }, slide.sub),
    );
  }

  if (slide.type === 'list') {
    return frame(
      el(
        'div',
        { style: { display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: 5, color: INK3, marginBottom: 30 } },
        String(slide.title).toUpperCase(),
      ),
      ...slide.items.map((it) =>
        el(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              paddingTop: 26,
              paddingBottom: 26,
              borderBottom: '1px solid rgba(70,60,110,0.18)',
            },
          },
          el('div', { style: { display: 'flex', fontSize: 46, fontWeight: 700, letterSpacing: -1 } }, it.primary),
          it.secondary &&
            el('div', { style: { display: 'flex', fontSize: 32, color: INK3, marginTop: 8 } }, it.secondary),
        ),
      ),
    );
  }

  if (slide.type === 'stat') {
    return frame(
      el(
        'div',
        { style: { display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: 5, color: INK3, marginBottom: 40 } },
        String(slide.title).toUpperCase(),
      ),
      ...slide.rows.map(([big, label]) =>
        el(
          'div',
          { style: { display: 'flex', flexDirection: 'column', marginBottom: 38 } },
          el('div', { style: { display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: -4, lineHeight: 1 } }, String(big)),
          el('div', { style: { display: 'flex', fontSize: 32, color: INK3, marginTop: 6 } }, label),
        ),
      ),
      slide.note && el('div', { style: { display: 'flex', fontSize: 26, color: INK3 } }, slide.note),
    );
  }

  // cta
  return frame(
    el('div', { style: { display: 'flex', fontSize: 78, fontWeight: 800, lineHeight: 1.06, letterSpacing: -3 } }, slide.title),
    el(
      'div',
      { style: { display: 'flex', fontSize: 38, color: INK2, marginTop: 32, lineHeight: 1.45, fontWeight: 500 } },
      slide.body,
    ),
  );
}

export async function GET({ params }) {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 0 || n > 9) return new Response('Not found', { status: 404 });

  try {
    const plan = await planDailyPost();
    const slide = plan.slides[n];
    if (!slide) return new Response('Not found', { status: 404 });

    const link = plan.slides.find((s) => s.link)?.link;

    return new ImageResponse(slideTree(slide, link), {
      width: 1080,
      height: 1350,
      headers: {
        // Instagram fetches this within seconds of being told to. A short cache
        // makes a retry cheap without risking yesterday's card tomorrow.
        'Cache-Control': 'public, max-age=0, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('card render failed:', err?.message ?? err);
    return new Response('Render failed', { status: 500 });
  }
}
