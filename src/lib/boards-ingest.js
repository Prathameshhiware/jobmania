// Ingest for employer job boards, and the retirement pass that goes with it.
//
// Separate from ingest.js because the two sources need different things. An
// aggregator post has to be mined for facts and its apply link resolved against
// whatever ATS it points at. A board row arrives already structured, already
// described by the employer, and already carrying a URL on the employer's own
// domain — so the work here is deduplication, a liveness probe, and the part
// ingest.js has no equivalent for: noticing what has disappeared.
//
// Retirement is the reason this file exists. Every other source on this site
// can only be asked whether a link still resolves, which answers "has anyone
// taken the page down" rather than "is this job still open". A board answers
// the second question directly by listing every role currently open, so a
// listing of ours that is no longer in the answer has been filled or withdrawn,
// and is retired on the same pass. One request settles a whole company.

import { db } from './supabase.js';
import { checkLink } from './ats.js';
import { sanitizeJobHtml } from './sanitize.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Insert whatever is genuinely new.
 *
 * `rows` come from a source adapter already in the jobs-table shape. Two
 * separate checks, because they catch different things: source_uid catches the
 * same posting seen again, dedupe_key catches the same role reaching us through
 * another board or through the aggregator.
 */
export async function ingestBoardRows(rows, { probe = true, concurrency = 6, log = console.log } = {}) {
  const stats = { seen: rows.length, added: 0, live: 0, duplicate: 0, dead: 0 };
  if (!rows.length) return stats;

  const source = rows[0].source;

  // Everything we already hold from this source, in one query rather than one
  // per row: 456 round trips on a backfill is minutes of waiting for nothing.
  const { data: knownSrc } = await db
    .from('job_sources').select('source_uid').eq('source', source);
  const haveUid = new Set((knownSrc ?? []).map((r) => String(r.source_uid)));

  const { data: knownKeys } = await db.from('jobs').select('dedupe_key').limit(10000);
  const haveKey = new Set((knownKeys ?? []).map((r) => r.dedupe_key));

  const fresh = [];
  for (const row of rows) {
    if (haveUid.has(String(row.source_uid)) || haveKey.has(row.dedupe_key)) { stats.duplicate++; continue; }
    // Guard against a board listing the same role twice within one run.
    haveKey.add(row.dedupe_key);
    haveUid.add(String(row.source_uid));
    fresh.push(row);
  }

  const queue = [...fresh];
  const insert = async (row) => {
    row.description_html = row.description_html ? sanitizeJobHtml(row.description_html) : null;

    if (probe) {
      const check = await checkLink(row.apply_url);
      row.last_checked_at = new Date().toISOString();
      if (!check.alive) {
        row.status = 'dead_link';
        row.review_reason = `apply link returned ${check.status}`;
        stats.dead++;
      } else {
        row.status = 'live';
        row.review_reason = null;
        row.last_verified_at = row.last_checked_at;
      }
    }

    const { data, error } = await db.from('jobs').insert(row).select('id, status').single();
    if (error) {
      if (!/duplicate key/i.test(error.message)) log(`  ! ${row.company_name}: ${error.message}`);
      stats.duplicate++;
      return;
    }
    stats.added++;
    if (data.status === 'live') stats.live++;

    await db.from('job_sources').insert({
      job_id: data.id, source: row.source, source_uid: row.source_uid, source_url: row.source_url,
    });
  };

  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      if (!row) return;
      try { await insert(row); } catch (err) { log(`  ! ${row.company_name}: ${err?.message ?? err}`); }
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return stats;
}

/**
 * Retire anything from this source that the employer no longer lists.
 *
 * `openUids` must be the COMPLETE set of currently-open postings for the boards
 * that were actually reached on this run. Passing a partial set would retire
 * live jobs, so the caller filters to the companies it polled: `companies` is
 * that list, and nothing outside it is touched.
 *
 * A board that failed to answer must not be in `companies`. An employer having
 * a bad minute is not evidence that their jobs are gone.
 */
export async function retireMissing(source, openUids, companies, { log = console.log } = {}) {
  if (!companies?.length) return { retired: 0 };

  const { data: mine, error } = await db
    .from('jobs')
    .select('id, source_uid, company_name, title')
    .eq('source', source)
    .in('status', ['live', 'needs_review'])
    .in('company_name', companies);
  if (error) throw new Error(error.message);

  const gone = (mine ?? []).filter((j) => !openUids.has(String(j.source_uid)));
  if (!gone.length) return { retired: 0 };

  const { error: upErr } = await db
    .from('jobs')
    .update({ status: 'expired', review_reason: 'no longer listed by the employer' })
    .in('id', gone.map((g) => g.id));
  if (upErr) throw new Error(upErr.message);

  for (const g of gone.slice(0, 10)) log(`  retired: ${g.company_name} — ${g.title}`);
  return { retired: gone.length };
}
