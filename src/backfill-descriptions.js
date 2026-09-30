// One-off pass: try to recover the employer's own job description for live
// listings that do not have one.
//
// Every description here comes from the employer: a platform API (Greenhouse,
// Lever, Ashby, SmartRecruiters, Workable, Workday) or the JobPosting
// structured data the employer's own page publishes for exactly this purpose.
// Where neither exists, the row is left without a description. Nothing is
// generated, paraphrased or filled in.
//
//   npm run backfill:desc          -- try every live listing without one
//   npm run backfill:desc -- 40    -- cap the number attempted
//
// Rate-limited on purpose: this walks other people's servers.

import { db } from './lib/supabase.js';
import { fetchCanonical } from './lib/ats.js';
import { sanitizeJobHtml } from './lib/sanitize.js';

const LIMIT = Number(process.argv[2] ?? 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

const { data: rows, error } = await db
  .from('jobs')
  .select('id, company_name, title, apply_url')
  .eq('status', 'live')
  .is('description_html', null)
  .not('apply_url', 'is', null)
  .limit(LIMIT);

if (error) { console.error(error.message); process.exit(1); }

console.log(`\nTrying ${rows.length} live listings with no description.\n`);

const bySource = {};
let found = 0, none = 0, tooShort = 0;

for (const row of rows) {
  let res = null;
  try { res = await fetchCanonical(row.apply_url); } catch { /* treated as none */ }

  const clean = sanitizeJobHtml(res?.description_html ?? null);
  const chars = text(clean).length;

  // A handful of pages return a stub such as "Apply now" inside JobPosting
  // markup. That is not a description and would be worse than none, because
  // Google would see the field filled and the page as thin.
  if (!clean || chars < 200) {
    if (clean) tooShort++; else none++;
    continue;
  }

  const src = res.description_source ?? 'unknown';
  bySource[src] = (bySource[src] ?? 0) + 1;
  found++;

  await db.from('jobs').update({
    description_html: clean,
    description_source: src,
    canonical_url: res.canonical_url ?? row.apply_url,
  }).eq('id', row.id);

  console.log(`  ${String(chars).padStart(6)}ch  ${src.padEnd(16)} ${row.company_name.slice(0, 34)}`);
  await sleep(500);
}

console.log(`\n  recovered:      ${found}`);
console.log(`  nothing to take: ${none}`);
console.log(`  too thin to use: ${tooShort}`);
if (found) console.log('  by source:', Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(' · '));
