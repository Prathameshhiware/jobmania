// Today's post, shaped for something else to publish.
//
// The Instagram Graph API needs a Meta Developer App, which is a real piece of
// setup and not everyone wants to do it. Make, Zapier and Buffer already hold
// approved Meta credentials, so connecting an account to one of them is an
// OAuth click rather than an app review. All three can read a feed and post
// what they find in it.
//
// So this is the same plan the publisher would use, expressed as something a
// general-purpose automation tool can consume: a headline, a caption that is
// ready to paste, and absolute URLs to the rendered cards.
//
// Absolute URLs matter. The tool fetching this runs on someone else's
// infrastructure and Meta fetches the image from theirs, so a relative path is
// useless to both.

import { istDate, istLong } from './ist.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** The caption as it should appear on the post, hashtags and all. */
export const fullCaption = (plan) =>
  `${plan.caption}\n\n${plan.hashtags.map((h) => `#${h}`).join(' ')}`;

/** Absolute URLs for each card of the post. */
export const cardUrls = (plan, origin, { story = false } = {}) =>
  plan.slides.map((_, i) =>
    `${origin}/social/${plan.today}/${i + 1}.png${story ? '?story' : ''}`);

/**
 * The plan as JSON, for Make and anything else that speaks it.
 *
 * `needsHumanApproval` is carried through rather than quietly dropped. A
 * statutory glossary term or an unconfirmed Eid date should stop an automation
 * rather than sail through it, and the only way a downstream tool can know
 * that is if we say so.
 */
export function feedJson(plan, origin) {
  return {
    date: plan.today,
    pillar: plan.kind,
    headline: plan.headline,
    caption: fullCaption(plan),
    hashtags: plan.hashtags,
    images: cardUrls(plan, origin),
    story_images: cardUrls(plan, origin, { story: true }),
    needs_human_approval: Boolean(plan.needsHumanApproval),
    scheduled_pillar: plan.scheduled ?? null,
    fell_back_from: plan.fellBackFrom ?? [],
    generated_at: new Date().toISOString(),
  };
}

/**
 * The plan as RSS, for Zapier and Buffer.
 *
 * Media RSS carries one <media:content> per card, because plain RSS has only a
 * single <enclosure> and a carousel is several pictures. Tools that only
 * understand <enclosure> get the first card, which is the one that matters
 * most anyway.
 */
export function feedRss(plan, origin) {
  const urls = cardUrls(plan, origin);
  const caption = fullCaption(plan);
  const title = `${istLong(plan.today)} — ${plan.headline}`;
  const guid = `${origin}/social/${plan.today}/${plan.kind}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>JoBmania — daily post</title>
    <link>${esc(origin)}</link>
    <description>One post a day, built from verified openings. Rotates through new openings, government recruitment, job terms, closing deadlines, hiring news and walk-ins.</description>
    <language>en-IN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${esc(origin)}/social/feed.xml" rel="self" type="application/rss+xml"/>
    <item>
      <title>${esc(title)}</title>
      <link>${esc(origin)}</link>
      <guid isPermaLink="false">${esc(guid)}</guid>
      <pubDate>${new Date(`${plan.today}T09:00:00+05:30`).toUTCString()}</pubDate>
      <category>${esc(plan.kind)}</category>
      <description>${esc(caption)}</description>
      <enclosure url="${esc(urls[0])}" type="image/png" length="0"/>
${urls.map((u) => `      <media:content url="${esc(u)}" medium="image" type="image/png"/>`).join('\n')}
      <media:description type="plain">${esc(caption)}</media:description>
    </item>
  </channel>
</rss>
`;
}

/** Today in India, so a caller can ask for the right cards. */
export const today = () => istDate();
