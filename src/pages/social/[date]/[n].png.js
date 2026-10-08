// One card of a day's post, as a PNG.
//
// Public and unauthenticated, because it has to be. Instagram's publishing API
// does not accept an upload: you hand Meta a URL and their servers fetch it.
// So the picture has to be on the open web before it can be posted.
//
// That makes this the one expensive endpoint on the site that anyone can call,
// and rendering a card costs about a second of CPU. Three things keep that
// from being a way to burn through the Vercel quota:
//
//   1. The date must be within a few days of today. Without this, a script
//      could walk ten thousand dates and make us render each one.
//   2. The slide index must exist in that day's plan.
//   3. Everything is cached hard and immutably at the edge, so a given card is
//      rendered once no matter how often Instagram, a CDN or a crawler asks.
//
// The middleware rate limiter sits in front of this as well.

import { planRotation } from '../../../lib/rotation.js';
import { slidePng, SQUARE, STORY } from '../../../lib/render.js';
import { faqPool } from '../../../lib/faqs.js';
import { istDate } from '../../../lib/ist.js';

export const prerender = false;

// How far from today a renderable date may be. Yesterday and today cover the
// publish job and a retry; a week ahead is enough to preview a festival card.
const BACK_DAYS = 2;
const FORWARD_DAYS = 8;

const notFound = () => new Response('Not found', { status: 404 });

export async function GET({ params, url }) {
  const { date, n } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return notFound();
  const when = new Date(`${date}T09:00:00+05:30`);
  if (Number.isNaN(when.getTime())) return notFound();

  const offset = (when.getTime() - new Date(`${istDate()}T09:00:00+05:30`).getTime()) / 864e5;
  if (offset < -BACK_DAYS || offset > FORWARD_DAYS) return notFound();

  const index = Number(n) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 9) return notFound();

  try {
    const plan = await planRotation({ now: when, faqs: await faqPool() });
    if (!plan || !plan.slides[index]) return notFound();

    // ?story renders 1080x1920 for a reel frame or a story; the default is the
    // 1080x1080 carousel card.
    const size = url.searchParams.has('story') ? STORY : SQUARE;

    const png = await slidePng(plan.slides[index], {
      kind: plan.kind,
      index,
      total: plan.slides.length,
      url: plan.url,
      size,
    });

    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        // A past or present card can never change, so it is immutable. A
        // future one can still move as the data moves, so it is only held
        // briefly.
        'Cache-Control': offset <= 0
          ? 'public, max-age=31536000, s-maxage=31536000, immutable'
          : 'public, max-age=600, s-maxage=600',
        'X-Pillar': plan.kind,
      },
    });
  } catch (err) {
    console.error('card render failed:', err?.message ?? err);
    return new Response('Render failed', { status: 500 });
  }
}
