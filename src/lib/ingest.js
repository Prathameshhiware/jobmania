// Shared ingest pass, used by both the backfill and the monitor.
//
// Flow per post:  extract facts -> dedupe -> resolve apply URL against the
// employer's own board -> insert. A row only reaches `live` when it has an
// apply link that resolved and did not 404. Everything else waits in
// needs_review for a human, which is the honest outcome.

import { notifyMany, indexingEnabled } from './indexing.js';
import { db } from './supabase.js';
import { extractJob } from './extract.js';
import { fetchCanonical, checkLink, identifyAts } from './ats.js';
import { sanitizeJobHtml } from './sanitize.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SITE = (process.env.SITE_URL ?? 'https://jobmania.dpdns.org').replace(/\/$/, '');

export async function ingestPosts(posts, categories, { resolve = true, log = console.log } = {}) {
  // Listings published in this run, so Google can be told once at the end
  // rather than mid-loop where a slow call would hold up the ingest.
  const published = [];
  const stats = { seen: posts.length, added: 0, duplicate: 0, unusable: 0, live: 0, review: 0, flagged: 0 };
  if (!posts.length) return stats;

  // Which source ids do we already hold?
  const uids = posts.map((p) => String(p.id));
  const { data: existing } = await db
    .from('jobs').select('id, source_uid, posted_at, status').eq('source', 'foundthejob').in('source_uid', uids);
  const have = new Map((existing ?? []).map((r) => [r.source_uid, r]));

  for (const post of posts) {
    const known = have.get(String(post.id));
    if (known) {
      /*
       * We already hold this post id. Usually that is just the source showing
       * us something we ingested days ago and there is nothing to do.
       *
       * But this source re-dates old posts to the top of its feed: of fifteen
       * listings it presented as today's, fourteen were older, one of them by
       * 49 days. A re-date alone is a traffic tactic and must not put a
       * finished drive back on the site. A re-date WITH a drive date that is
       * still ahead of us is different: the employer is running it again, and
       * refusing to look means we sit on a live opening the source is
       * advertising.
       *
       * So on a re-date we re-extract, and republish only when the facts
       * themselves justify it.
       */
      const feedDate = new Date(post.date_gmt ? `${post.date_gmt}Z` : post.date);
      if (feedDate > new Date(known.posted_at)) {
        const names = (post.categories ?? []).map((id) => categories.get(id)).filter(Boolean);
        const fresh = extractJob(post, names);
        const stillOpen = fresh?.walkin_end && new Date(`${fresh.walkin_end}T23:59:59Z`) > new Date();
        if (stillOpen) {
          await db.from('jobs').update({
            posted_at: fresh.posted_at,
            walkin_start: fresh.walkin_start,
            walkin_end: fresh.walkin_end,
            walkin_time: fresh.walkin_time,
            walkin_venue: fresh.walkin_venue,
            valid_through: fresh.valid_through,
            status: 'live',
            review_reason: null,
          }).eq('id', known.id);
          stats.refreshed = (stats.refreshed ?? 0) + 1;
          log(`  ~ [refreshed] ${fresh.company_name} — drive ${fresh.walkin_end}`);
          continue;
        }
      }
      stats.duplicate++;
      continue;
    }

    const names = (post.categories ?? []).map((id) => categories.get(id)).filter(Boolean);
    const row = extractJob(post, names);
    if (!row) { stats.unusable++; continue; }

    // Same opening already in from another source or another of their posts?
    const { data: dupe } = await db
      .from('jobs').select('id').eq('dedupe_key', row.dedupe_key).limit(1).maybeSingle();
    if (dupe) {
      await db.from('job_sources').upsert({
        job_id: dupe.id, source: row.source, source_uid: row.source_uid, source_url: row.source_url,
      }, { onConflict: 'job_id,source,source_uid' });
      stats.duplicate++;
      continue;
    }

    // A walk-in has no online application by design — its route is the venue
    // and the date. Publish it on that, the same as a URL-based listing.
    const walkinRoute = row.hiring_type === 'walk-in' && row.walkin_venue && row.walkin_start;

    if (!row.apply_url && walkinRoute) {
      if (row.scam_flags?.length) {
        row.review_reason = `flagged: ${row.scam_flags.join(', ')}`;
        stats.flagged++;
      } else {
        row.status = 'live';
        row.review_reason = null;
      }
    }

    if (resolve && row.apply_url) {
      const ats = identifyAts(row.apply_url);
      const canonical = ats ? await fetchCanonical(row.apply_url) : null;
      if (canonical) {
        row.canonical_url = canonical.canonical_url ?? row.apply_url;
        // Third-party HTML. Cleaned before storage so the database never holds
        // a script tag waiting to be rendered.
        row.description_html = sanitizeJobHtml(canonical.description_html);
        row.description_source = canonical.description_source;
      }

      const probe = await checkLink(row.apply_url);
      row.last_checked_at = new Date().toISOString();

      if (!probe.alive) {
        row.status = 'dead_link';
        row.review_reason = `apply link returned ${probe.status}`;
      } else if (row.scam_flags?.length) {
        row.status = 'needs_review';
        row.review_reason = `flagged: ${row.scam_flags.join(', ')}`;
        stats.flagged++;
      } else {
        row.status = 'live';
        row.review_reason = null;
        row.last_verified_at = row.last_checked_at;
      }
      await sleep(250); // be gentle on employer sites too
    }

    // Final gate. A working apply link is not enough — a backfill reaches back
    // over postings whose deadline has already elapsed, and a reachable link on
    // a finished role is exactly the listing that sends someone to a closed
    // drive. Nothing goes live with a deadline in the past.
    if (row.status === 'live' && new Date(row.valid_through) <= new Date()) {
      row.status = 'expired';
      row.review_reason = 'deadline already passed when ingested';
      // counters are tallied from inserted.status below, so nothing to adjust
    }

    const { data: inserted, error } = await db.from('jobs').insert(row).select('id, status').single();
    if (error) {
      if (!/duplicate key/i.test(error.message)) log(`  ! ${row.company_name}: ${error.message}`);
      stats.duplicate++;
      continue;
    }

    await db.from('job_sources').insert({
      job_id: inserted.id, source: row.source, source_uid: row.source_uid, source_url: row.source_url,
    });

    stats.added++;
    if (inserted.status === 'live') { stats.live++; published.push(`${SITE}/job/${row.slug}`); }
    else stats.review++;
    log(`  + [${inserted.status}] ${row.company_name} — ${row.title}${row.city_primary ? ` (${row.city_primary})` : ''}`);
  }

  // Best-effort, and deliberately last. A listing is live whether or not
  // Google accepts the ping, so nothing here is allowed to fail the run.
  if (published.length && indexingEnabled()) {
    const r = await notifyMany(published, 'URL_UPDATED');
    stats.indexed = r.sent;
    if (r.sent) log(`  google: ${r.sent} submitted for indexing`);
  }

  return stats;
}

export function summarise(stats) {
  const parts = [
    `seen ${stats.seen}`,
    `added ${stats.added} (live ${stats.live}, review ${stats.review}${stats.flagged ? `, flagged ${stats.flagged}` : ''})`,
  ];
  if (stats.refreshed) parts.push(`refreshed ${stats.refreshed}`);
  parts.push(`duplicate ${stats.duplicate}`, `unusable ${stats.unusable}`);
  return parts.join(' · ');
}
