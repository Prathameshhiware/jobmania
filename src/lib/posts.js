// Reads machine-written articles out of Supabase and makes them look exactly
// like content-collection entries.
//
// The Insights section has two sources now. Pieces a person wrote are markdown
// in the repository; the weekly roundup is a row in `generated_posts`, because
// nothing can commit a file to the repository without a CI runner and we no
// longer use one. Rather than teach every index page, the sitemap and the
// article template about that split, this module hands back the same shape
// `getCollection('insights')` does — `{ id, data, body }` — so `publish()`,
// `articlePath()` and the listings work on either without knowing which is
// which. Only the article page cares, because one renders a component and the
// other sets HTML.
//
// Read with the ANON key like the rest of the site. These are published
// articles; there is nothing here the public should not see.

import { sb } from './db.js';

const asDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(+d) ? d : null;
};

const arr = (v) => (Array.isArray(v) ? v : []);

/** One database row, wearing a content-collection entry's clothes. */
function shape(row) {
  const published = asDate(row.published) ?? new Date(0);
  const updated = asDate(row.updated);
  const dataAsOf = asDate(row.data_as_of);

  return {
    id: row.slug,
    // Says which branch the article template should take. Nothing else reads it.
    generated: true,
    html: row.html ?? '',
    // readingMinutes() counts words off this, same as it does for markdown.
    body: row.plain ?? '',
    data: {
      kind: row.kind ?? 'blog',
      title: row.title,
      dek: row.dek,
      seoTitle: row.seo_title ?? undefined,
      metaDescription: row.meta_description ?? undefined,
      published,
      ...(updated ? { updated } : {}),
      ...(dataAsOf ? { dataAsOf } : {}),
      tags: arr(row.tags),
      faq: arr(row.faq),
      // Rendered as a visible list. The roundup leaves this empty on purpose:
      // its story links are already in the body with publisher and date, and
      // repeating all ten underneath helps nobody.
      sources: arr(row.sources),
      // Structured data only.
      citations: arr(row.citations),
      draft: false,
    },
  };
}

const COLUMNS =
  'slug, kind, title, dek, seo_title, meta_description, published, updated, ' +
  'data_as_of, tags, faq, citations, html, plain';

/**
 * Every generated post, newest first.
 *
 * Returns [] on any failure rather than throwing. The table may not exist yet
 * on a fresh database, and a missing weekly roundup should take the roundup off
 * the index — not take the Insights section down with it.
 */
export async function generatedPosts() {
  try {
    const { data, error } = await sb
      .from('generated_posts')
      .select(COLUMNS)
      .order('published', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map(shape);
  } catch {
    return [];
  }
}

/** One generated post by slug, or null. */
export async function generatedPost(slug) {
  if (!slug) return null;
  try {
    const { data, error } = await sb
      .from('generated_posts')
      .select(COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? shape(data) : null;
  } catch {
    return null;
  }
}
