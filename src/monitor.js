// The watcher. Runs on a schedule, fetches only what appeared since the stored
// cursor, and adds anything new. Safe to run as often as you like — with no new
// posts it costs two API calls and writes nothing.

import { fetchCategories, fetchPostsSince, SOURCE_ID } from './sources/foundthejob.js';
import { ingestPosts, summarise } from './lib/ingest.js';
import { getCursor, saveCursor } from './lib/supabase.js';

const t0 = Date.now();
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

try {
  const cursor = await getCursor(SOURCE_ID);
  console.log(`[${stamp}] monitor — cursor ${cursor ?? 'none (first run, last 2 days)'}`);

  const posts = await fetchPostsSince(cursor, { days: 2, pageLimit: 10 });

  if (!posts.length) {
    console.log('  nothing new');
    await saveCursor(SOURCE_ID, cursor, { seen: 0, added: 0 });
    process.exit(0);
  }

  console.log(`  ${posts.length} new post${posts.length === 1 ? '' : 's'}`);
  const categories = await fetchCategories();
  const stats = await ingestPosts(posts, categories);

  const newest = posts.reduce((max, p) => {
    const t = p.date_gmt ? `${p.date_gmt}Z` : p.date;
    return !max || new Date(t) > new Date(max) ? t : max;
  }, cursor);

  await saveCursor(SOURCE_ID, new Date(newest).toISOString(), stats);
  console.log(`  ${summarise(stats)}`);
  console.log(`  cursor -> ${newest}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} catch (err) {
  console.error(`  FAILED: ${err.message}`);
  await saveCursor(SOURCE_ID, await getCursor(SOURCE_ID), { error: String(err.message) });
  process.exit(1);
}
