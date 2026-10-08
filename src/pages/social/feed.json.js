// Today's post as JSON, for Make and anything else that prefers it to RSS.
//
// Same content and same reasoning as feed.xml: public, because the automation
// tool that reads it runs on someone else's infrastructure, and everything in
// it is about to be posted publicly anyway.

import { planRotation } from '../../lib/rotation.js';
import { faqPool } from '../../lib/faqs.js';
import { feedJson } from '../../lib/social-feed.js';

export const prerender = false;

export async function GET({ url, site }) {
  const origin = (site?.origin ?? url.origin).replace(/\/$/, '');
  try {
    const plan = await planRotation({ now: new Date(), faqs: await faqPool() });
    if (!plan) {
      return new Response(JSON.stringify({ ok: false, reason: 'no pillar had material' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    return new Response(JSON.stringify(feedJson(plan, origin), null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('social feed failed:', err?.message ?? err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
