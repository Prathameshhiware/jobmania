// Quick health read on the table. `npm run stats`

import { db } from './lib/supabase.js';

// supabase-js only exposes filters after .select(), so the filter is applied
// to the built query rather than to db.from(...).
async function count(filter) {
  const q = db.from('jobs').select('id', { count: 'exact', head: true });
  const { count: c, error } = filter ? await filter(q) : await q;
  if (error) throw new Error(error.message);
  return c ?? 0;
}

const byStatus = (s) => count((q) => q.eq('status', s));

const [total, live, review, dead, expired, rejected] = await Promise.all([
  count(),
  byStatus('live'),
  byStatus('needs_review'),
  byStatus('dead_link'),
  byStatus('expired'),
  byStatus('rejected'),
]);

const since = new Date(Date.now() - 864e5).toISOString();
const added24 = await count((q) => q.gte('first_seen_at', since));
const withDesc = await count((q) => q.not('description_html', 'is', null));

const pct = (n) => (total ? `${((n / total) * 100).toFixed(0)}%` : '—');

console.log(`
  total          ${total}
  live           ${live}\t${pct(live)}
  needs review   ${review}\t${pct(review)}
  dead link      ${dead}\t${pct(dead)}
  expired        ${expired}\t${pct(expired)}
  rejected       ${rejected}\t${pct(rejected)}

  added last 24h ${added24}
  with employer description ${withDesc}
`);

const tally = (rows, key) =>
  Object.entries(
    (rows ?? []).reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {})
  ).sort((a, b) => b[1] - a[1]);

const fmt = (pairs, n = 8) => pairs.slice(0, n).map(([k, v]) => `${k} ${v}`).join(' · ') || '—';

const { data: liveRows } = await db
  .from('jobs').select('hiring_type, city_primary, experience_level').eq('status', 'live');

console.log('  live by type   ', fmt(tally(liveRows, 'hiring_type')));
console.log('  live by level  ', fmt(tally(liveRows, 'experience_level')));
console.log('  top cities     ', fmt(tally(liveRows, 'city_primary')));

const { data: reviewRows } = await db
  .from('jobs').select('review_reason').eq('status', 'needs_review');
console.log('  review reasons ', fmt(tally(reviewRows, 'review_reason'), 6));

const { data: state } = await db.from('source_state').select('*');
for (const s of state ?? []) {
  console.log(`\n  source ${s.source}`);
  console.log(`    cursor ${s.cursor_ts ?? '—'}`);
  console.log(`    runs ${s.runs} · seen ${s.items_seen} · added ${s.items_added}${s.last_error ? `\n    last error: ${s.last_error}` : ''}`);
}
console.log('');
