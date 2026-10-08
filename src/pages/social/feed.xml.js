// Today's post as RSS, for Zapier, Buffer or anything else that reads a feed.
//
// Public, because the tool fetching it is someone else's server and cannot
// carry our secret. Nothing here is private: it is the same post that is about
// to appear on a public Instagram account, and the images it points at are
// already public for the same reason.
//
// Cached for ten minutes. The underlying data moves all day, but a tool polling
// this every few minutes should not make us rebuild the plan each time, and
// ten minutes is well inside the once-a-day cadence it exists for.

import { planRotation } from '../../lib/rotation.js';
import { faqPool } from '../../lib/faqs.js';
import { feedRss } from '../../lib/social-feed.js';

export const prerender = false;

export async function GET({ url, site }) {
  const origin = (site?.origin ?? url.origin).replace(/\/$/, '');
  try {
    const plan = await planRotation({ now: new Date(), faqs: await faqPool() });
    if (!plan) return new Response('No post today', { status: 503 });

    return new Response(feedRss(plan, origin), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('social feed failed:', err?.message ?? err);
    return new Response('Feed failed', { status: 500 });
  }
}
