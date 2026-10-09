// The daily health check, as an endpoint pg_cron can call.
//
// It reports. It does not rewrite code and it never will: a process that
// edits a live site unattended turns a small bug into an outage at three in
// the morning with nobody watching. Where something is genuinely broken, a
// person reads this and decides.
//
// There is one exception, and it is narrow on purpose. A listing whose
// deadline has passed is actively harmful — it sends a reader to apply for
// something that closed — and retiring it is exactly what the expire pass
// already does on its own schedule. Doing it here is not a new decision, it
// is the same decision taken sooner. Nothing else is touched.
//
// GET returns the report and always answers 200, because a monitor that
// returns 500 when the site is broken is indistinguishable from a monitor
// that is itself down. The verdict is in the body.

import { runHealth, formatHealth } from '../../lib/health.js';
import { db } from '../../lib/supabase.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Constant-time compare, so a wrong token does not leak how much was right. */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Retire listings that are past their own deadline.
 *
 * The only repair this endpoint makes. Reversible — the row keeps every
 * field and only its status changes — and bounded, so a bug here cannot
 * empty the site: if more than fifty rows look expired at once, something
 * is wrong with the clock rather than with the listings, and it stops and
 * says so instead.
 */
async function retirePastDeadline() {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('jobs').select('id, slug').eq('status', 'live').lt('valid_through', now).limit(200);
  if (error) return { attempted: 0, error: error.message };
  const rows = data ?? [];
  if (!rows.length) return { attempted: 0 };

  if (rows.length > 50) {
    return {
      attempted: 0,
      refused: `${rows.length} rows look expired at once, which is more likely a clock problem than a real sweep`,
    };
  }

  const { error: upErr } = await db
    .from('jobs')
    .update({ status: 'expired', review_reason: 'deadline passed (health check)', updated_at: now })
    .in('id', rows.map((r) => r.id));

  return upErr
    ? { attempted: rows.length, error: upErr.message }
    : { attempted: rows.length, retired: rows.map((r) => r.slug).slice(0, 20) };
}

export async function GET({ request, url, site }) {
  const env = (k) => import.meta.env?.[k] ?? process.env?.[k];
  const secret = env('HEALTH_SECRET') ?? env('ROUNDUP_SECRET') ?? env('INGEST_SECRET');
  if (!secret) return json({ ok: false, reason: 'no secret configured' }, 503);

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(given, secret)) return json({ ok: false }, 401);

  const origin = (site?.origin ?? url.origin).replace(/\/$/, '');

  try {
    // ?fix=1 lets the scheduled call clear expired listings. Reading the
    // report never changes anything, so a person can look safely.
    const repair = url.searchParams.get('fix') === '1'
      ? await retirePastDeadline()
      : null;

    const report = await runHealth({ origin });

    if (report.verdict !== 'ok') {
      // Lands in the Vercel function log, which is where someone looks after
      // noticing something is wrong.
      console.error(`health ${report.verdict}:\n${formatHealth(report)}`);
    }

    return json({ ...report, repair });
  } catch (err) {
    console.error('health check itself failed:', err?.message ?? err);
    return json({
      ok: false,
      verdict: 'fail',
      error: String(err?.message ?? err),
      meaning: 'The monitor threw. Nothing was checked — treat this as unknown, not as healthy.',
    });
  }
}
