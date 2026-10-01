// The freshness contract, enforced.
//   1. anything past valid_through is expired
//   2. the oldest-checked live rows get their apply link re-tested
//   3. a hard 404/410 marks the row dead and delists it with Google
//   4. once a day, the table is photographed into daily_stats
//
// Used to be a daily CI job that checked 250 links in one go. It now runs as a
// small chunk every 30 minutes, called by pg_cron, because there is no CI
// runner any more and a serverless function has a minute at most. That is a
// better shape anyway: a listing whose deadline passed comes off within half an
// hour instead of within a day, and 48 passes of 40 links re-test far more of
// the site per day than one pass of 250 did.
//
// Bounded twice over. `limit` caps the work and `budgetMs` stops it early if
// the links are slow, so the pass always returns rather than being killed
// mid-flight by the platform.

import { db } from './supabase.js';
import { checkLink } from './ats.js';
import { notifyMany, indexingEnabled } from './indexing.js';
import { recordSnapshot } from './snapshot.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function expirePass({
  limit = 40,
  concurrency = 5,
  budgetMs = 45000,
  delistWindowHours = 36,
  snapshot = true,
  log = console.log,
} = {}) {
  const started = Date.now();
  const now = new Date().toISOString();
  const out = { expired: 0, checked: 0, alive: 0, dead: 0, delisted: 0, snapshot: false, live: 0, stoppedEarly: false };

  // 1. deadline passed — for anything not already in a terminal state.
  //    needs_review is included on purpose: a walk-in whose drive has finished
  //    is never going to be publishable, and leaving it in the queue buries the
  //    rows a human could actually act on.
  const { data: lapsed, error: e1 } = await db
    .from('jobs')
    .update({ status: 'expired', review_reason: 'deadline passed' })
    .in('status', ['live', 'needs_review']).lt('valid_through', now)
    .select('id');
  if (e1) throw new Error(`expiry: ${e1.message}`);
  out.expired = lapsed?.length ?? 0;
  if (out.expired) log(`expired by deadline: ${out.expired}`);

  // 2. re-check the least recently verified live rows
  const { data: due, error: e2 } = await db
    .from('jobs')
    .select('id, company_name, title, apply_url, last_checked_at')
    .eq('status', 'live').not('apply_url', 'is', null)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (e2) throw new Error(`due: ${e2.message}`);

  /*
   * Checked a few at a time rather than one after another. Measured on the
   * first scheduled run: a probe averages about 2.6 seconds, so sequentially
   * only 17 of the 40 got done before the time budget stopped the pass. The
   * workers pull from one shared queue, so a slow link delays itself rather
   * than everything behind it.
   *
   * Five is deliberately modest. These are other people's careers pages and
   * the point is to notice a dead link, not to hammer anybody; the pause
   * between a worker's own requests is kept for the same reason.
   */
  const queue = [...(due ?? [])];
  const worker = async () => {
    while (queue.length) {
      if (Date.now() - started > budgetMs) { out.stoppedEarly = true; return; }
      const job = queue.shift();
      if (!job) return;
      const probe = await checkLink(job.apply_url);
      out.checked++;
      if (probe.alive) {
        out.alive++;
        await db.from('jobs').update({ last_checked_at: now, last_verified_at: now }).eq('id', job.id);
      } else {
        out.dead++;
        await db.from('jobs').update({
          status: 'dead_link', last_checked_at: now,
          review_reason: `apply link returned ${probe.status}`,
        }).eq('id', job.id);
        log(`  dead (${probe.status}): ${job.company_name} — ${job.title}`);
      }
      await sleep(200);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  log(`links checked: ${out.checked} · alive ${out.alive} · dead ${out.dead}${out.stoppedEarly ? ' (time budget reached)' : ''}`);

  // 3. tell Google what left, so a closed listing drops out of results now
  //    rather than whenever it would next have been recrawled. This is the half
  //    of the Indexing API that matters most for a site whose claim is freshness.
  if (indexingEnabled()) {
    const SITE = (process.env.SITE_URL ?? 'https://jobmania.dpdns.org').replace(/\/$/, '');
    const { data: gone } = await db
      .from('jobs').select('slug')
      .in('status', ['expired', 'dead_link'])
      .gte('updated_at', new Date(Date.now() - delistWindowHours * 3600e3).toISOString())
      .limit(180);
    if (gone?.length) {
      const r = await notifyMany(gone.map((g) => `${SITE}/job/${g.slug}`), 'URL_DELETED');
      out.delisted = r.sent;
      log(`google: ${r.sent} delistings submitted (${r.failed} failed)`);
    }
  }

  // 4. photograph the table, so next week's roundup has something to compare
  //    against. Never throws: a missing data point must not stop the pass.
  if (snapshot) out.snapshot = Boolean(await recordSnapshot(log, { onlyIfMissing: true }));

  const { count } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'live');
  out.live = count ?? 0;
  out.ms = Date.now() - started;
  return out;
}
