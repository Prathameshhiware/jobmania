// Local command for the freshness pass. The scheduled path does not use this:
// pg_cron calls /api/expire every 30 minutes, which calls the same library.
//
//   npm run expire              one pass, 250 links, the old daily size
//   CHECK_LIMIT=40 npm run expire
//
// Useful for forcing a large sweep by hand after a backfill, when waiting for
// the half-hourly passes to work through the table would take too long.

import { expirePass } from './lib/expire.js';

const when = new Date().toISOString().slice(0, 19).replace('T', ' ');
console.log(`\nJoBmania expiry pass — ${when}\n`);

const r = await expirePass({
  limit: Number(process.env.CHECK_LIMIT ?? 250),
  // No platform timeout to respect when it runs on a laptop.
  budgetMs: 10 * 60_000,
  log: console.log,
});

console.log(`live now: ${r.live}\n`);
