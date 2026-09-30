// The freshness contract, enforced.
//   1. anything past valid_through is expired
//   2. the oldest-checked live rows get their apply link re-tested
//   3. a hard 404/410 marks the row dead and delists it
//
// Runs daily. LIMIT keeps one run bounded so the job always finishes.

import { db } from './lib/supabase.js';
import { checkLink } from './lib/ats.js';
import { notifyMany, indexingEnabled } from './lib/indexing.js';

const LIMIT = Number(process.env.CHECK_LIMIT ?? 250);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date().toISOString();

console.log(`\nJoBmania expiry pass — ${now.slice(0, 19).replace('T', ' ')}\n`);

// 1. deadline passed — for anything not already in a terminal state.
//    needs_review is included on purpose: a walk-in whose drive has finished is
//    never going to be publishable, and leaving it in the queue buries the rows
//    a human could actually act on.
const { data: lapsed, error: e1 } = await db
  .from('jobs')
  .update({ status: 'expired', review_reason: 'deadline passed' })
  .in('status', ['live', 'needs_review']).lt('valid_through', now)
  .select('id, status');
if (e1) { console.error(e1.message); process.exit(1); }
console.log(`expired by deadline: ${lapsed?.length ?? 0}`);

// 2. re-check the least recently verified live rows
const { data: due } = await db
  .from('jobs')
  .select('id, company_name, title, apply_url, last_checked_at')
  .eq('status', 'live').not('apply_url', 'is', null)
  .order('last_checked_at', { ascending: true, nullsFirst: true })
  .limit(LIMIT);

let alive = 0, dead = 0;
for (const job of due ?? []) {
  const probe = await checkLink(job.apply_url);
  if (probe.alive) {
    alive++;
    await db.from('jobs').update({ last_checked_at: now, last_verified_at: now }).eq('id', job.id);
  } else {
    dead++;
    await db.from('jobs').update({
      status: 'dead_link', last_checked_at: now,
      review_reason: `apply link returned ${probe.status}`,
    }).eq('id', job.id);
    console.log(`  dead (${probe.status}): ${job.company_name} — ${job.title}`);
  }
  await sleep(200);
}

console.log(`links checked: ${due?.length ?? 0}  ·  alive ${alive}  ·  dead ${dead}`);

// 3. tell Google what left, so a closed listing drops out of results now
//    rather than whenever it would next have been recrawled. This is the half
//    of the Indexing API that matters most for a site whose claim is freshness.
if (indexingEnabled()) {
  const SITE = (process.env.SITE_URL ?? 'https://jobmania.dpdns.org').replace(/\/$/, '');
  const { data: gone } = await db
    .from('jobs').select('slug')
    .in('status', ['expired', 'dead_link'])
    .gte('updated_at', new Date(Date.now() - 36 * 3600e3).toISOString())
    .limit(180);
  if (gone?.length) {
    const r = await notifyMany(gone.map((g) => `${SITE}/job/${g.slug}`), 'URL_DELETED');
    console.log(`google: ${r.sent} delistings submitted (${r.failed} failed)`);
  }
}

const { count } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'live');
console.log(`live now: ${count ?? 0}\n`);
