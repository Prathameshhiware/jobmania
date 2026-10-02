// One-off: load every India role currently open on the boards we carry.
//
//   npm run boards:backfill          do it
//   npm run boards:backfill -- dry   say what would happen, write nothing
//
// The scheduled poll (/api/boards) handles everything afterwards. This exists
// because the first load is 400+ listings with a link probe each, which is far
// longer than a serverless function may run.

import { fetchOpenRoles, SOURCE_ID } from './sources/greenhouse.js';
import { ingestBoardRows, retireMissing } from './lib/boards-ingest.js';
import { saveCursor } from './lib/supabase.js';

const DRY = process.argv.includes('dry');

console.log(`\nJoBmania board backfill — ${SOURCE_ID}\n`);

const { rows, openUids, companies, boardsReached, boardsTotal } =
  await fetchOpenRoles(null, { log: console.log });

console.log(`\nboards answered: ${boardsReached}/${boardsTotal}`);
console.log(`India roles open: ${rows.length}\n`);

if (DRY) {
  console.log('dry run. Nothing written.');
  console.log(`would insert up to ${rows.length} rows across ${companies.length} companies`);
  process.exit(0);
}

const stats = await ingestBoardRows(rows, { probe: true, concurrency: 6, log: console.log });
console.log(`\nadded ${stats.added} (live ${stats.live}, dead link ${stats.dead}) · duplicate ${stats.duplicate} of ${stats.seen} seen`);

const { retired } = await retireMissing(SOURCE_ID, openUids, companies, { log: console.log });
console.log(`retired ${retired} no longer listed`);

await saveCursor(SOURCE_ID, new Date().toISOString(), { seen: stats.seen, added: stats.added });
console.log('\ndone.\n');
