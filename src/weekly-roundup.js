// Local command for the Sunday roundup. The scheduled path does not use this:
// pg_cron calls /api/roundup, which calls the same builder.
//
//   npm run roundup -- dry    build it and print it, write nothing
//   npm run roundup           build it and publish it to generated_posts
//
// Both read the live database, so a dry run shows exactly what Sunday will
// produce apart from a week's drift in the news.

import { buildRoundup } from './lib/roundup.js';
import { db } from './lib/supabase.js';

const DRY = process.argv.includes('dry');

const post = await buildRoundup();
const { news, live, drives, history } = post.stats;

const row = {
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
};

if (DRY) {
  console.log(post.html);
  console.log('\n---');
  console.log(`slug       ${post.slug}`);
  console.log(`title      ${post.title}`);
  console.log(`seo title  ${post.seoTitle}`);
  console.log(`meta       ${post.metaDescription}`);
  console.log(`faq        ${post.faq.length} questions`);
  console.log(`citations  ${post.citations.length}`);
  console.log(`words      ${post.plain.split(/\s+/).length}`);
  console.log(`\nnews ${news} · live ${live} · drives ${drives} · history ${history} days`);
  console.log('dry run. Nothing written.');
} else {
  const { data: existing } = await db
    .from('generated_posts').select('slug').eq('slug', post.slug).maybeSingle();

  if (existing) {
    console.log(`already published, leaving it alone: ${post.slug}`);
  } else {
    const { error } = await db.from('generated_posts').insert(row);
    if (error) {
      console.error(`could not publish: ${error.message}`);
      process.exit(1);
    }
    console.log(`published ${post.slug}`);
    console.log(`  news ${news} · live ${live} · drives ${drives} · history ${history} days`);
  }
}
