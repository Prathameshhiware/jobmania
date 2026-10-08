// RSS primitives, shared by every feed reader on the site.
//
// Extracted from news.js once a second and third feed needed exactly the same
// four things: fetch it, split it into items, pull a tag, decode the entities.
// Google News is the only feed any of them actually reads, so the quirks
// handled here are Google's quirks.

export const UA =
  'Mozilla/5.0 (compatible; JoBmaniaBot/0.1; +https://jobmania.dpdns.org)';

/** A Google News RSS search URL for an Indian-English query. */
export const googleNews = (query) =>
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent(query) +
  '&hl=en-IN&gl=IN&ceid=IN:en';

/** The text of the first `tag` in `xml`, unwrapped from CDATA, or null. */
export const text = (xml, tag) => {
  const m = xml.match(
    new RegExp('<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>', 'i'),
  );
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
};

/** HTML entities to characters, and runs of whitespace to one space. */
export const decode = (s) =>
  String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ').trim();

/**
 * The <item> bodies of a feed, or [] if anything at all goes wrong.
 *
 * Never throws. Every caller is a scheduled job that should skip a source it
 * cannot read rather than fail the whole run because one publisher is down.
 */
export async function feedItems(url, timeoutMs = 10000) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/**
 * Title, link, publisher and date from one Google News item, or null.
 *
 * Google appends " - Publisher" to every headline and also carries it in
 * <source>. Both are read, because the suffix has to come off the title
 * regardless and <source> is occasionally missing.
 */
export function parseItem(raw, { cutoff = 0 } = {}) {
  let title = decode(text(raw, 'title'));
  const link = text(raw, 'link');
  const pub = text(raw, 'pubDate');
  if (!title || !link || !pub) return null;

  const when = Date.parse(pub);
  if (!Number.isFinite(when) || when < cutoff) return null;

  let source = decode(text(raw, 'source'));
  const dash = title.lastIndexOf(' - ');
  if (dash > 20) {
    const tail = title.slice(dash + 3);
    if (tail.length < 40) { source = source || tail; title = title.slice(0, dash).trim(); }
  }
  return { title, link, source: source || null, date: new Date(when).toISOString() };
}

/** A loose key for spotting the same story twice across publishers. */
export const storyKey = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
