// Records one row in daily_stats: a photograph of the jobs table today.
//
// Called by the daily expire pass, which already runs on a schedule and already
// holds the service role key. Upserted on the day, so running it twice corrects
// the row rather than duplicating it.
//
// Never throws. A missing snapshot costs a point on a chart; an exception here
// would stop the expiry pass, which is the thing that keeps dead listings off
// the site. The less important job must not be able to break the important one.

import { db } from './supabase.js';

const tally = (rows, key) =>
  rows.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {});

export async function recordSnapshot(log = console.log) {
  try {
    const { data, error } = await db
      .from('jobs')
      .select('status, hiring_type, experience_level, city_primary, is_remote, first_seen_at, description_html')
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const live = rows.filter((j) => j.status === 'live');
    const dayAgo = new Date(Date.now() - 864e5);

    const row = {
      day: new Date().toISOString().slice(0, 10),
      live: live.length,
      needs_review: rows.filter((j) => j.status === 'needs_review').length,
      expired: rows.filter((j) => j.status === 'expired').length,
      dead_link: rows.filter((j) => j.status === 'dead_link').length,
      added_today: rows.filter((j) => new Date(j.first_seen_at) >= dayAgo).length,
      live_walkins: live.filter((j) => j.hiring_type === 'walk-in').length,
      live_freshers: live.filter((j) => j.experience_level === 'fresher').length,
      live_remote: live.filter((j) => j.is_remote).length,
      with_description: live.filter((j) => j.description_html).length,
      by_city: tally(live, 'city_primary'),
      by_type: tally(live, 'hiring_type'),
      recorded_at: new Date().toISOString(),
    };

    const { error: upErr } = await db.from('daily_stats').upsert(row, { onConflict: 'day' });
    if (upErr) throw new Error(upErr.message);

    log(`snapshot: live ${row.live} · added ${row.added_today} · walk-ins ${row.live_walkins}`);
    return row;
  } catch (err) {
    // Most likely cause is the table not existing yet, which is a setup step
    // rather than a failure worth shouting about.
    log(`snapshot skipped: ${err?.message ?? err}`);
    return null;
  }
}
