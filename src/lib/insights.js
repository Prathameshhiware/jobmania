// Shared vocabulary for the Insights section.
//
// One place decides what each kind is called, what it sits at, and how it is
// described — so the nav, the index, the article pages, the sitemap and the
// structured data can never drift apart.

/**
 * `schema` is the schema.org type emitted for that kind. A report is an
 * analytical piece built on data, which is what `Report` means; a playbook is
 * instructional; the other two are ordinary articles. Getting this right is
 * what lets a search engine treat a report as research rather than a blog post.
 */
export const KINDS = {
  report: {
    slug: 'reports',
    label: 'Reports',
    one: 'Report',
    schema: 'Report',
    blurb:
      'Numbers measured by our own system — what we tracked, what we removed, and what that says about hiring in India.',
  },
  playbook: {
    slug: 'playbook',
    label: 'Playbook',
    one: 'Playbook',
    schema: 'Article',
    blurb:
      'Practical guidance for applying in India, written to be acted on. Every claim that matters carries a source you can check.',
  },
  perspective: {
    slug: 'perspectives',
    label: 'Perspectives',
    one: 'Perspective',
    schema: 'Article',
    blurb:
      'Arguments about how hiring works here, and how it should. One reading of the evidence, not the only one.',
  },
  blog: {
    slug: 'blog',
    label: 'Notes',
    one: 'Note',
    schema: 'BlogPosting',
    blurb: 'Shorter pieces: what changed on the site, and how it was built.',
  },
};

/** Ordered for the nav and the index — heaviest first. */
export const KIND_ORDER = ['report', 'playbook', 'perspective', 'blog'];

export const kindBySlug = (slug) =>
  KIND_ORDER.find((k) => KINDS[k].slug === slug) ?? null;

/** `/insights/reports/how-many-links-die` */
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
