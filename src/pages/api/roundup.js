// Publishes the Sunday roundup. Fired by pg_cron inside Supabase at 04:30 UTC
// every Sunday, which is 10:00 IST.
//
// There is no CI runner in this path and no GitHub token to keep alive. The
// clock lives in the database, the work happens here, and the post lands in
// `generated_posts` where the site reads it. A scheduled workflow was tried
// first and is not usable: GitHub deprioritises cron on free runners, so a
// job asking for every five minutes actually ran every three to six hours.
// pg_cron has kept time to the second on this project across thousands of runs.
//
// Idempotent on purpose. Firing it twice, or firing it late, republishes
// nothing: a post for that date already existing is a success, not an error.
// That is what makes a retry safe and a duplicate impossible.
//
// Protected by a shared secret rather than left open, because it writes.

import { buildRoundup } from '../../lib/roundup.js';
import { db } from '../../lib/supabase.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Compares in constant time. A plain === leaks how much of the secret was
 * right through how long the comparison took, which is enough to recover it
 * given enough attempts.
 */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * True if a hand-written article already sits at this slug. The early editions
 * were committed as markdown, and a generated row at the same address would
 * quietly shadow one of them.
 */
async function authoredAlready(slug) {
  try {
    const { getCollection } = await import('astro:content');
    const entries = await getCollection('insights');
    return entries.some((e) => e.id === slug);
  } catch {
    return false;
  }
}

export async function POST({ request }) {
  const env = (k) => import.meta.env?.[k] ?? process.env?.[k];
  // A dedicated secret if one is set; otherwise the one the poll already uses,
  // so adding this job needs no new credential anywhere.
  const secret = env('ROUNDUP_SECRET') ?? env('INGEST_SECRET');
  if (!secret) return json({ ok: false }, 503);

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // One message for a missing token and a wrong one: saying which is wrong
  // tells a caller they have found a real endpoint.
  if (!tokenMatches(given, secret)) return json({ ok: false }, 401);

  const started = Date.now();
  try {
    const post = await buildRoundup();

    const { data: existing, error: lookupErr } = await db
      .from('generated_posts')
      .select('slug')
      .eq('slug', post.slug)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);

    if (existing || (await authoredAlready(post.slug))) {
      return json({ ok: true, slug: post.slug, published: false, reason: 'already exists', ms: Date.now() - started });
    }

    const { error: insertErr } = await db.from('generated_posts').insert({
      slug: post.slug,
      kind: post.kind,
      title: post.title,
      dek: post.dek,
      seo_title: post.seoTitle,
      meta_description: post.metaDescription,
      published: post.published,
      data_as_of: post.dataAsOf,
      tags: post.tags,
      faq: post.faq,
      citations: post.citations,
      html: post.html,
      plain: post.plain,
    });
    if (insertErr) throw new Error(insertErr.message);

    return json({
      ok: true,
      slug: post.slug,
      published: true,
      ...post.stats,
      ms: Date.now() - started,
    });
  } catch (err) {
    // Logged for the Vercel function log; the caller is a cron job and only
    // reads the status code.
    console.error('roundup failed:', err?.message ?? err);
    return json({ ok: false, error: String(err?.message ?? err), ms: Date.now() - started }, 500);
  }
}
