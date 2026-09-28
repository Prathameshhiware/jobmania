// One-time backfill. Pulls the last N days from the source and seeds the table.
//   npm run backfill            -> 30 days
//   npm run backfill -- 60      -> 60 days
//   npm run backfill -- 30 dry  -> extract and report, write nothing

import { fetchCategories, fetchPostsSince, SOURCE_ID } from './sources/foundthejob.js';
import { ingestPosts, summarise } from './lib/ingest.js';
import { saveCursor } from './lib/supabase.js';
import { extractJob } from './lib/extract.js';

const days = Number(process.argv[2]) || 30;
const dry = process.argv.includes('dry');

const t0 = Date.now();
console.log(`\nJoBmania backfill — last ${days} days${dry ? ' (dry run)' : ''}\n`);

console.log('Fetching category map…');
const categories = await fetchCategories();
console.log(`  ${categories.size} categories\n`);

console.log('Fetching posts…');
const posts = await fetchPostsSince(null, {
  days,
  onPage: (page, n, total) => console.log(`  page ${page}: ${n} posts (${total} so far)`),
});
console.log(`  ${posts.length} posts total\n`);

if (dry) {
  let ok = 0, noCompany = 0, noApply = 0, walkins = 0;
  const companies = new Set();
  for (const p of posts) {
    const names = (p.categories ?? []).map((id) => categories.get(id)).filter(Boolean);
    const row = extractJob(p, names);
    if (!row) { noCompany++; continue; }
    ok++;
    companies.add(row.company_name);
    if (!row.apply_url) noApply++;
    if (row.hiring_type === 'walk-in') walkins++;
  }
  console.log('Dry run — nothing written.');
  console.log(`  extracted        ${ok}/${posts.length}`);
  console.log(`  no company/role  ${noCompany}`);
  console.log(`  no apply link    ${noApply}  (these need a human)`);
  console.log(`  walk-ins         ${walkins}`);
  console.log(`  distinct firms   ${companies.size}`);
  process.exit(0);
}

console.log('Ingesting…');
const stats = await ingestPosts(posts, categories);

const newest = posts.reduce((max, p) => {
  const t = p.date_gmt ? `${p.date_gmt}Z` : p.date;
  return !max || new Date(t) > new Date(max) ? t : max;
}, null);
if (newest) await saveCursor(SOURCE_ID, new Date(newest).toISOString(), stats);

console.log(`\n${summarise(stats)}`);
console.log(`Cursor set to ${newest ?? 'unchanged'}`);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
