// The FAQ pool, flattened out of the articles.
//
// Lives here rather than in a route because two routes need it: the plan
// endpoint and the card images. It reaches into astro:content, so it only
// resolves inside the Astro runtime and returns [] anywhere else — which is
// the right answer for a plain node script, not an error.

import { KINDS } from './insights.js';

/**
 * Every FAQ across every published article.
 *
 * These are the only social posts whose words were written by a person and
 * checked once already, which is exactly what makes them safe to send out
 * unattended: nothing new is being asserted.
 *
 * Sorted stably so that "which question went out that day" stays reproducible
 * after the fact.
 */
export async function faqPool() {
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
      .sort((a, b) => (a.path + a.q).localeCompare(b.path + b.q));
  } catch {
    return [];
  }
}
