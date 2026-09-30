// The near-real-time poll.
//
// GitHub Actions cannot do this job. Its scheduler deprioritises frequent cron
// on free runners, so a workflow asking for every 5 minutes actually ran every
// 3 to 6 hours. Vercel's own cron is once a day on the Hobby plan. What is left,
// and what this endpoint exists for, is Supabase: pg_cron runs inside the
// database on a schedule it actually honours, and pg_net calls this route.
//
// Actions still runs the same poll a few times a day. It is no longer the
// mechanism, it is the safety net for when this route is failing and nobody
// has noticed.
//
// Protected by a shared secret rather than left open, because it writes.

import { fetchCategories, fetchPostsSince, SOURCE_ID } from '../../sources/foundthejob.js';
import { ingestPosts, summarise } from '../../lib/ingest.js';
import { getCursor, saveCursor } from '../../lib/supabase.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Compares in constant time. A plain === leaks how much of the secret was
 * right through how long the comparison took, which is enough to recover it
 * given enough attempts.
 */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST({ request }) {
  const secret = import.meta.env?.INGEST_SECRET ?? process.env?.INGEST_SECRET;
  if (!secret) return json({ ok: false }, 503);

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // One message for a missing token and a wrong one: saying which is wrong
  // tells a caller they have found a real endpoint.
  if (!tokenMatches(given, secret)) return json({ ok: false }, 401);

  const started = Date.now();
  try {
    const cursor = await getCursor(SOURCE_ID);
    const posts = await fetchPostsSince(cursor, { days: 2, pageLimit: 3 });

    if (!posts.length) {
      await saveCursor(SOURCE_ID, cursor, { seen: 0, added: 0 });
      return json({ ok: true, seen: 0, added: 0, ms: Date.now() - started });
    }

    const categories = await fetchCategories();
    const stats = await ingestPosts(posts, categories, { log: () => {} });

    const newest = posts.reduce((max, p) => {
      const t = p.date_gmt ? `${p.date_gmt}Z` : p.date;
      return !max || new Date(t) > new Date(max) ? t : max;
    }, cursor);

    await saveCursor(SOURCE_ID, new Date(newest).toISOString(), stats);
    return json({ ok: true, ...stats, summary: summarise(stats), ms: Date.now() - started });
  } catch (err) {
    // Recorded against the source so a run of failures is visible in stats,
    // and returned without detail so the endpoint describes nothing to a
    // caller who should not have reached it.
    console.error('ingest:', err?.message ?? err);
    try { await saveCursor(SOURCE_ID, await getCursor(SOURCE_ID), { error: String(err?.message ?? err) }); } catch {}
    return json({ ok: false, ms: Date.now() - started }, 500);
  }
}

// Kept so a browser or a misconfigured pinger gets a clear refusal rather than
// silently doing nothing. Reads nothing and writes nothing.
export function GET() {
  return json({ ok: false, hint: 'POST with a bearer token' }, 405);
}
