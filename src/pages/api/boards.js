// Polls the employer job boards. Fired by pg_cron inside Supabase every hour.
//
// Two jobs in one pass, and the second is the one no other source on this site
// can do. New roles are ingested; roles that have vanished from a board are
// retired, because a board lists exactly what the employer currently has open.
// Everywhere else we can only ask whether a link still resolves, which does not
// answer whether the job is still going.
//
// Measured: fetching all 25 boards takes about 17 seconds, which leaves room
// inside the 60s ceiling for the link probes on whatever is new. The budget
// below stops the pass early rather than letting the platform kill it midway.
//
// Protected by a shared secret rather than left open, because it writes.

import { fetchOpenRoles, SOURCE_ID } from '../../sources/greenhouse.js';
import { ingestBoardRows, retireMissing } from '../../lib/boards-ingest.js';
import { getCursor, saveCursor } from '../../lib/supabase.js';

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
  const secret = env('BOARDS_SECRET') ?? env('INGEST_SECRET');
  if (!secret) return json({ ok: false }, 503);

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(given, secret)) return json({ ok: false }, 401);

  const started = Date.now();
  try {
    const cursor = await getCursor(SOURCE_ID);
    const { rows, openUids, companies, boardsReached, boardsTotal } =
      await fetchOpenRoles(cursor, { log: () => {} });

    const stats = await ingestBoardRows(rows, {
      probe: true,
      concurrency: 6,
      log: () => {},
    });

    /*
     * Scoped to the boards that actually answered. A company whose board was
     * briefly unreachable is absent from `companies`, so none of its listings
     * can be retired on the strength of a network blip.
     */
    const { retired } = await retireMissing(SOURCE_ID, openUids, companies, { log: () => {} });

    // Only advance the cursor when every board answered. A partial run that
    // moved it forward would skip whatever the missing board published.
    const complete = boardsReached === boardsTotal;
    await saveCursor(SOURCE_ID, complete ? new Date().toISOString() : cursor, {
      seen: stats.seen, added: stats.added,
    });

    return json({
      ok: true,
      boards: `${boardsReached}/${boardsTotal}`,
      seen: stats.seen,
      added: stats.added,
      live: stats.live,
      dead: stats.dead,
      retired,
      cursorAdvanced: complete,
      ms: Date.now() - started,
    });
  } catch (err) {
    console.error('boards failed:', err?.message ?? err);
    await saveCursor(SOURCE_ID, await getCursor(SOURCE_ID), { error: String(err?.message ?? err) });
    return json({ ok: false, error: String(err?.message ?? err), ms: Date.now() - started }, 500);
  }
}
