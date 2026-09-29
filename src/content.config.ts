// Insights: the written side of the site.
//
// Articles live as markdown in the repo rather than in Supabase. The database
// holds things that change by the minute and are written by a machine; these
// change rarely, are written by a person, and belong in version control where
// a change is reviewable and a mistake is revertable.
//
// The frontmatter carries the provenance rules the rest of the project already
// follows. `kind` says which of the three categories a piece belongs to:
//
//   blog               — shorter pieces: product notes, what we are seeing,
//                        how this was built.
//   thought-leadership — an argument, clearly one person's reading of the
//                        evidence rather than a neutral summary.
//   playbook           — guidance a reader will act on. Anything they could be
//                        hurt by getting wrong needs `sources`, so the claim is
//                        checkable rather than merely confident.
//
// All three are authored. Where a piece leans on a
// figure this system measured, `dataAsOf` records the moment it was true — a
// statistic with no as-of date cannot be checked, and an answer engine quoting
// it has no way to know it has gone stale.

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const source = z.object({
  label: z.string(),
  url: z.string().url(),
});

const insights = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/insights' }),
  schema: z
    .object({
      kind: z.enum(['blog', 'thought-leadership', 'playbook']),

      // What a reader sees. `title` is the H1 and `dek` the standfirst, so both
      // are written for a person: the H1 can be long, and the dek can take the
      // room it needs to state the point.
      title: z.string().max(120),
      dek: z.string().min(40).max(300),

      // What a search engine sees. Separate fields on purpose: an H1 that reads
      // well is usually too long for a <title>, and a standfirst that reads well
      // is almost always past the ~160 characters Google will show before it
      // truncates — which buries the keywords if they sit at the end. Both fall
      // back to the display fields when a piece does not need the distinction.
      seoTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(160).optional(),
      published: z.coerce.date(),
      updated: z.coerce.date().optional(),
      // No byline. Pieces are published by the site, not credited to a person,
      // so the schema names the organisation as author.

      // Set on any piece that quotes a figure from our own database: the
      // moment those numbers were true. Rendered at the top of the article.
      dataAsOf: z.coerce.date().optional(),

      // Where a checkable claim came from. Rendered at the foot of the article.
      sources: z.array(source).default([]),

      // Answer engines quote a direct question-and-answer far more readily than
      // they quote prose, so a piece may carry its own.
      faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),

      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { insights };
