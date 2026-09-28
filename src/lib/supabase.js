import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

// Load .env.local when running locally. In CI the values arrive as real env vars.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Local: copy .env.example to .env.local and fill it in.');
  console.error('CI:    set them as GitHub repository secrets.');
  process.exit(1);
}

export const db = createClient(url, key, { auth: { persistSession: false } });

export async function getCursor(source) {
  const { data } = await db.from('source_state').select('cursor_ts').eq('source', source).maybeSingle();
  return data?.cursor_ts ?? null;
}

export async function saveCursor(source, cursorTs, stats = {}) {
  const { data: prev } = await db
    .from('source_state').select('runs, items_seen, items_added').eq('source', source).maybeSingle();

  await db.from('source_state').upsert({
    source,
    cursor_ts: cursorTs,
    last_run_at: new Date().toISOString(),
    last_ok_at: stats.error ? undefined : new Date().toISOString(),
    last_error: stats.error ?? null,
    runs: (prev?.runs ?? 0) + 1,
    items_seen: (prev?.items_seen ?? 0) + (stats.seen ?? 0),
    items_added: (prev?.items_added ?? 0) + (stats.added ?? 0),
  }, { onConflict: 'source' });
}
