// Today's social post, as a plan.
//
// Returns what should go out and why. It renders nothing and publishes
// nothing, which is deliberate: the renderer does not exist yet and the Meta
// app does not exist yet, and neither of those should block the part that
// decides what to say. When both arrive, they read this.
//
// Until then it is the way to look at tomorrow's post before it happens, and
// the way a scheduled job will eventually fetch it.
//
// GET with the shared secret returns the plan. `?force=sarkari` builds a
// specific pillar instead of today's, and `?date=2026-10-20` plans for another
// day, both of which exist so a festival post or a thin pillar can be checked
// without waiting a week for it to come round.

import { planRotation, PILLAR_BY_WEEKDAY, istWeekday } from '../../lib/rotation.js';
import { KINDS } from '../../lib/insights.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Constant-time compare, so a wrong token does not leak how much was right. */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Every FAQ across every published article, flattened.
 *
 * The articles are the only content pillar that is written by a person, and
 * each question in them has already been checked once. That is exactly what
 * makes them safe to post unattended: nothing new is being asserted.
 */
async function faqPool() {
  try {
    const { getCollection } = await import('astro:content');
    const entries = await getCollection('insights');
    return entries
      .filter((e) => !e.data.draft && Array.isArray(e.data.faq))
      .flatMap((e) =>
        e.data.faq.map((f) => ({
          q: f.q,
          a: f.a,
          title: e.data.title,
          path: `/insights/${KINDS[e.data.kind]?.slug ?? 'blogs'}/${e.id}`,
        })),
      )
      // Stable order, so "which question today" is reproducible after the fact.
      .sort((a, b) => (a.path + a.q).localeCompare(b.path + b.q));
  } catch {
    return [];
  }
}

export async function GET({ request }) {
  const env = (k) => import.meta.env?.[k] ?? process.env?.[k];
  const secret = env('ROUNDUP_SECRET') ?? env('INGEST_SECRET');
  if (!secret) return json({ ok: false }, 503);

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(given, secret)) return json({ ok: false }, 401);

  const url = new URL(request.url);
  const force = url.searchParams.get('force');
  const date = url.searchParams.get('date');
  const now = date ? new Date(`${date}T09:00:00+05:30`) : new Date();
  if (Number.isNaN(now.getTime())) return json({ ok: false, error: 'bad date' }, 400);

  const started = Date.now();
  try {
    const faqs = await faqPool();
    const plan = await planRotation({ now, faqs, force });

    if (!plan) {
      // Every pillar came back empty. Saying so is the correct outcome; the
      // caller posts nothing rather than filling the slot.
      return json({ ok: true, plan: null, reason: 'no pillar had material', ms: Date.now() - started });
    }

    return json({
      ok: true,
      faqPool: faqs.length,
      weekday: istWeekday(now),
      wouldSchedule: PILLAR_BY_WEEKDAY[istWeekday(now)],
      plan,
      ms: Date.now() - started,
    });
  } catch (err) {
    console.error('daily plan failed:', err?.message ?? err);
    return json({ ok: false, error: String(err?.message ?? err), ms: Date.now() - started }, 500);
  }
}
