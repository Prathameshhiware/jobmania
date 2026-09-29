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
//   report      — measured. Numbers this system produced. `dataAsOf` required,
//                 because a statistic without the date it was taken is a claim
//                 with no shelf life.
//   playbook    — authored guidance. Anything a reader could act on and be hurt
//                 by needs `sources`, so the claim is checkable rather than
//                 confident.
//   perspective — authored opinion, clearly one person's reading.
//   blog        — everything else: product notes, changelog, how this was built.
//
// The schema refuses a report without an as-of date on purpose. It is the same
// idea as the database constraint that will not publish a job without a way to
// apply: make the rule structural and it cannot be forgotten on a busy day.

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
      kind: z.enum(['report', 'playbook', 'perspective', 'blog']),
      title: z.string().max(120),
      // The standfirst. Doubles as the meta description, so it has to read as a
      // sentence on its own and state the point rather than tease it.
      dek: z.string().min(40).max(300),
      published: z.coerce.date(),
      updated: z.coerce.date().optional(),
      author: z.string().default('Prathamesh Hiware'),

      // Reports only: the moment the numbers were true.
      dataAsOf: z.coerce.date().optional(),

      // Where a checkable claim came from. Rendered at the foot of the article.
      sources: z.array(source).default([]),

      // Answer engines quote a direct question-and-answer far more readily than
      // they quote prose, so a piece may carry its own.
      faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),

      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    })
    .refine((d) => d.kind !== 'report' || d.dataAsOf != null, {
      message: 'A report must carry dataAsOf: the date its numbers were measured.',
      path: ['dataAsOf'],
    }),
});

export const collections = { insights };
