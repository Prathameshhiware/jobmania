// Quick health read on the table. `npm run stats`

import { db } from './lib/supabase.js';

const count = async (q) => (await q.select('id', { count: 'exact', head: true })).count ?? 0;
const base = () => db.from('jobs');

const [live, review, dead, expired, total] = await Promise.all([
  count(base().eq('status', 'live')),
  count(base().eq('status', 'needs_review')),
  count(base().eq('status', 'dead_link')),
  count(base().eq('status', 'expired')),
  count(base()),
]);

const since = new Date(Date.now() - 864e5).toISOString();
const added24 = await count(base().gte('first_seen_at', since));

console.log(`
  total        ${total}
  live         ${live}
  needs review ${review}
  dead link    ${dead}
  expired      ${expired}
  added 24h    ${added24}
`);

const { data: types } = await db.from('jobs').select('hiring_type').eq('status', 'live');
const byType = (types ?? []).reduce((a, r) => ((a[r.hiring_type] = (a[r.hiring_type] ?? 0) + 1), a), {});
console.log('  live by type:', Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · ') || '—');

const { data: cities } = await db.from('jobs').select('city_primary').eq('status', 'live');
const byCity = (cities ?? []).reduce((a, r) => (r.city_primary && (a[r.city_primary] = (a[r.city_primary] ?? 0) + 1), a), {});
const top = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('  top cities:  ', top.map(([k, v]) => `${k} ${v}`).join(' · ') || '—');

const { data: st } = await db.from('source_state').select('*');
for (const s of st ?? []) {
  console.log(`\n  source ${s.source}: cursor ${s.cursor_ts ?? '—'} · runs ${s.runs} · added ${s.items_added}${s.last_error ? ` · last error: ${s.last_error}` : ''}`);
}
console.log('');
