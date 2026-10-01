// The freshness pass, in bite-sized pieces.
//
// pg_cron inside Supabase calls this every 30 minutes. It replaces a daily CI
// job: GitHub is no longer in the scheduling path, and a serverless function
// cannot hold a 250-link sweep open for several minutes anyway. Forty links a
// pass, forty-eight passes a day, is roughly 1,900 re-tests daily against the
// 250 the old job managed — and a listing whose closing date has passed now
// comes off the site within half an hour instead of within a day.
//
// Safe to call at any frequency. Every step is idempotent: expiry is a filtered
// update, link checks take the least recently checked rows first, and the daily
// snapshot writes only if today has not been recorded yet.
//
// Protected by a shared secret rather than left open, because it writes.

import { expirePass } from '../../lib/expire.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Constant time, so the comparison cannot be timed to recover the secret. */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST({ request }) {
  const env = (k) => import.meta.env?.[k] ?? process.env?.[k];
  const secret = env('EXPIRE_SECRET') ?? env('INGEST_SECRET');
  if (!secret) return json({ ok: false }, 503);

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(given, secret)) return json({ ok: false }, 401);

  try {
    const result = await expirePass({
      limit: Number(env('CHECK_LIMIT') ?? 40),
      // Comfortably inside the 60s ceiling set in astro.config.mjs, with room
      // for the queries either side of the link checks.
      budgetMs: 45000,
      // One pass only has to cover what left since the last one. A 36 hour
      // window at this cadence would resubmit the same delistings 70 times.
      delistWindowHours: 2,
      log: () => {},
    });
    return json({ ok: true, ...result });
  } catch (err) {
    console.error('expire failed:', err?.message ?? err);
    return json({ ok: false, error: String(err?.message ?? err) }, 500);
  }
}
