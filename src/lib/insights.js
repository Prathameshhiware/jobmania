// Shared vocabulary for the Insights section.
//
// One place decides what each kind is called, what it sits at, and how it is
// described — so the nav, the index, the article pages, the sitemap and the
// structured data can never drift apart.

/**
 * `schema` is the schema.org type emitted for that kind. A blog post is a
 * `BlogPosting`; an essay and a playbook are both `Article`, which is what a
 * standalone piece of writing is. Getting this right is what lets a search
 * engine tell a considered argument apart from a changelog note.
 */
export const KINDS = {
  blog: {
    slug: 'blogs',
    label: 'Blogs',
    one: 'Blog',
    schema: 'BlogPosting',
    blurb:
      'Shorter pieces — what changed on the site, what we are seeing across the openings we track, and how this was built.',
  },
  'thought-leadership': {
    slug: 'thought-leadership',
    label: 'Thought Leadership',
    one: 'Essay',
    schema: 'Article',
    blurb:
      'Arguments about how hiring in India actually works, and how it should. One reading of the evidence, put plainly enough to disagree with.',
  },
  playbook: {
    slug: 'playbook',
    label: 'Playbook',
    one: 'Playbook',
    schema: 'Article',
    blurb:
      'Practical guidance for applying in India, written to be acted on. Every claim that matters carries a source you can check.',
  },
};

/** Ordered for the nav and the index. */
export const KIND_ORDER = ['blog', 'thought-leadership', 'playbook'];

export const kindBySlug = (slug) =>
  KIND_ORDER.find((k) => KINDS[k].slug === slug) ?? null;

/** `/insights/playbook/what-to-carry-to-a-walk-in` */
export const articlePath = (entry) => `/insights/${KINDS[entry.data.kind].slug}/${entry.id}`;

export const fmtDate = (d) =>
  d instanceof Date && !Number.isNaN(+d)
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

/**
 * Reading time from the rendered body. Astro gives us the raw markdown, which
 * is close enough — 200 words a minute is the usual figure and nobody is
 * measuring us on it.
 */
export const readingMinutes = (body) =>
  Math.max(1, Math.round(String(body ?? '').trim().split(/\s+/).length / 200));

/** Live entries, newest first. Drafts never leave the repo. */
export function publish(entries) {
  return entries
    .filter((e) => !e.data.draft)
    .sort((a, b) => +b.data.published - +a.data.published);
}
