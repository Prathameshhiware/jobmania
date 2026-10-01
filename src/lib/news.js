// Indian job-market news for the Sunday roundup.
//
// Headline, publisher, date and link. Nothing else: no summary, no rewrite, no
// generated commentary. That is a deliberate limit, not a shortcut. The post
// publishes at 10am Sunday with nobody reading it first, so the only safe thing
// to put on it is material that cannot be wrong.
//
// Sources, after testing what actually works:
//   Google News RSS search  100 items a week, ~86 job-relevant, machine-readable
//   ET HRWorld              a reliable second opinion from an HR trade title
// Business Standard and Moneycontrol both return 403 to anything that is not a
// browser, and the Economic Times jobs feed and People Matters return nothing
// at all, so neither is fetched directly. Their articles still appear, because
// Google News carries them.
//
// Google News links cannot be resolved to the publisher without running a
// browser, since the redirect is done in JavaScript. The publisher name is in
// the feed itself though, which is what the allowlist needs, so the filtering
// works and only the final hop goes through Google.

const UA = 'Mozilla/5.0 (compatible; JoBmaniaBot/0.1; +https://jobmania.dpdns.org)';

const GOOGLE_NEWS =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('(India hiring OR recruitment OR layoffs OR "campus placement" OR freshers OR "job market") when:7d') +
  '&hl=en-IN&gl=IN&ceid=IN:en';

const HR_WORLD = 'https://hr.economictimes.indiatimes.com/rss/topstories';

/**
 * Publishers we will put in front of a reader.
 *
 * The point of this list is not snobbery, it is that an unfiltered feed is full
 * of SEO sites recycling each other, and this week's test run surfaced two of
 * them in the top six. Everything here is a real newsroom with a masthead to
 * lose. Anything not on the list is dropped rather than ranked lower.
 */
const ALLOWED = [
  ['economic times', 'The Economic Times'],
  ['et hrworld', 'ET HRWorld'],
  ['hrworld', 'ET HRWorld'],
  ['times of india', 'The Times of India'],
  ['moneycontrol', 'Moneycontrol'],
  ['business standard', 'Business Standard'],
  ['business today', 'Business Today'],
  ['livemint', 'Mint'],
  ['mint', 'Mint'],
  ['indian express', 'The Indian Express'],
  ['financial express', 'The Financial Express'],
  ['the hindu', 'The Hindu'],
  ['hindu businessline', 'The Hindu BusinessLine'],
  ['people matters', 'People Matters'],
  ['ndtv', 'NDTV'],
  ['cnbc', 'CNBC-TV18'],
  ['hindustan times', 'Hindustan Times'],
  ['deccan herald', 'Deccan Herald'],
  ['reuters', 'Reuters'],
];

/*
 * Relevance, tightened after a first run put a fake certificate racket, a UPSC
 * centenary history piece and a human trafficking story in the top ten. Every
 * one of them contained the word "recruitment".
 *
 * A bare keyword match is not enough, so a headline has to carry a phrase that
 * is actually about the labour market: who is hiring, who is cutting, what is
 * happening to pay or placements.
 */
const RELEVANT = new RegExp([
  'layoff', 'job cuts', 'jobs? cut', 'sack', 'retrench', 'downsiz',
  'hiring', 'to hire', 'will hire', 'hiring spree', 'hiring freeze',
  'recruitment drive', 'campus (placement|hiring|recruit)', 'placement season',
  'fresher', 'entry[- ]level', 'graduate hiring',
  'headcount', 'attrition', 'workforce', 'job market', 'jobs? market',
  'white[- ]collar', 'blue[- ]collar', 'gig work', 'gig econom',
  'salary (hike|increment)', 'appraisal', 'pay (hike|rise)', 'wage',
  'unemployment', 'employment (rate|data|growth)', 'vacanc',
  'GCC', 'offer letter', 'onboarding', 'notice period',
].join('|'), 'i');

/*
 * Keyword matches that are not job-market news. Crime, court cases and
 * institutional history all use this vocabulary, and a reader who came for
 * "what is happening to hiring" is not served by a trafficking investigation.
 */
const NOISE = new RegExp([
  'horoscope', 'astrolog', 'cricket', 'box office', 'recipe', 'lottery',
  'admit card', 'answer key', 'result declared', 'exam date',
  'racket', 'scam', 'fraud', 'fake', 'arrest', 'police', 'FIR', 'chargesheet',
  'court (case|order)', 'probe', 'irregularit', 'bribery', 'trafficking',
  'centenary', 'anniversary', 'obituary', 'passes away',
  'horosco', 'zodiac',
].join('|'), 'i');

const text = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
};

const decode = (s) =>
  String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ').trim();

/** Match a publisher against the allowlist, returning its tidy name or null. */
function publisher(raw) {
  const hay = String(raw ?? '').toLowerCase();
  for (const [needle, name] of ALLOWED) if (hay.includes(needle)) return name;
  return null;
}

async function feed(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/**
 * Up to `want` stories from the last seven days, newest first, deduplicated.
 * Returns [] rather than throwing: a week with no usable news is a thing the
 * roundup says out loud, not a reason for the job to fail.
 */
export async function weeklyNews(want = 10) {
  const cutoff = Date.now() - 7.5 * 864e5;
  const out = [];
  const seen = new Set();

  const take = (items, defaultSource) => {
    for (const raw of items) {
      let title = decode(text(raw, 'title'));
      const link = text(raw, 'link');
      const pub = text(raw, 'pubDate');
      if (!title || !link || !pub) continue;

      const when = Date.parse(pub);
      if (!Number.isFinite(when) || when < cutoff) continue;

      // Google News appends " - Publisher" to every headline. That is also the
      // only reliable place the publisher is named, so it is read and removed.
      let source = decode(text(raw, 'source')) || defaultSource;
      const dash = title.lastIndexOf(' - ');
      if (dash > 20) {
        const tail = title.slice(dash + 3);
        if (tail.length < 40) { source = source || tail; title = title.slice(0, dash).trim(); }
      }

      const name = publisher(source);
      if (!name) continue;                               // not a newsroom we will cite
      if (!RELEVANT.test(title) || NOISE.test(title)) continue;

      // Same story from two outlets, or the same headline twice in one feed.
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({ title, link, source: name, date: new Date(when).toISOString() });
    }
  };

  take(await feed(GOOGLE_NEWS), null);
  take(await feed(HR_WORLD), 'ET HRWorld');

  out.sort((a, b) => b.date.localeCompare(a.date));

  // No more than three from one masthead. The first run came back seven-tenths
  // Times of India, which reads like a clipping service rather than a roundup.
  const perSource = {};
  const spread = [];
  for (const item of out) {
    perSource[item.source] = (perSource[item.source] ?? 0) + 1;
    if (perSource[item.source] <= 3) spread.push(item);
    if (spread.length >= want) break;
  }
  return spread;
}
