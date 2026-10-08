// Industry hiring news and startup funding, for the Friday social post.
//
// Two pillars that both answer "who is about to hire", from opposite ends of
// the market: the IT majors, who announce headcount every quarter, and the
// funded startups, who do not announce anything but reliably start hiring
// within a few months of a round.
//
// Same discipline as sarkari.js and news.js. We report a named newsroom's
// headline, with its date, and we never paraphrase a number into our own
// voice. The difference here is that the funding pillar can sometimes be
// joined to our own data: if a company that just raised is already on one of
// the boards we read, we can say so and link to their openings, and that turns
// a repost into something only this site can publish.

import { googleNews, feedItems, parseItem, storyKey, decode } from './feed-parse.js';

/** Newsrooms we will cite for a hiring or funding number. */
const ALLOWED = [
  ['economic times', 'The Economic Times'],
  ['et hrworld', 'ET HRWorld'],
  ['hrworld', 'ET HRWorld'],
  ['moneycontrol', 'Moneycontrol'],
  ['livemint', 'Mint'],
  ['mint', 'Mint'],
  ['business standard', 'Business Standard'],
  ['business today', 'Business Today'],
  ['financial express', 'The Financial Express'],
  ['times of india', 'The Times of India'],
  ['indian express', 'The Indian Express'],
  ['the hindu', 'The Hindu'],
  ['hindu businessline', 'The Hindu BusinessLine'],
  ['ndtv', 'NDTV'],
  ['cnbc', 'CNBC-TV18'],
  ['deccan herald', 'Deccan Herald'],
  ['hindustan times', 'Hindustan Times'],
  ['inc42', 'Inc42'],
  ['entrackr', 'Entrackr'],
  ['yourstory', 'YourStory'],
  ['reuters', 'Reuters'],
];

const publisher = (raw) => {
  const hay = String(raw ?? '').toLowerCase();
  for (const [needle, name] of ALLOWED) if (hay.includes(needle)) return name;
  return null;
};

/*
 * Topics. Each is one Google News query plus the two filters that decide what
 * survives it, kept together so a topic can be judged as a whole.
 *
 * `relevant` is deliberately specific. A bare company name matches share price
 * stories, results previews and management changes, none of which tell a job
 * seeker anything. The headline has to be about people being hired, let go, or
 * paid.
 */
export const TOPICS = {
  industry: {
    // Two queries, because one was not enough. A single broad search returned
    // three usable stories in thirty days, which does not sustain a weekly
    // slot. The second query goes straight at the quarterly headcount
    // disclosures, which are the most substantial hiring numbers published in
    // India and are easy to miss in a general search.
    query: [
      '(TCS OR Infosys OR Wipro OR HCLTech OR Cognizant OR Accenture OR Capgemini OR ' +
        '"Tech Mahindra" OR LTIMindtree) (hiring OR headcount OR freshers OR "campus" OR ' +
        'layoffs OR attrition OR appraisal) India when:30d',
      '(headcount OR "campus hiring" OR "fresher hiring" OR "hiring freeze" OR ' +
        '"graduate hiring" OR "entry level hiring") India IT sector when:30d',
    ],
    relevant: new RegExp([
      'hir(e|es|ing)', 'headcount', 'fresher', 'campus (hiring|placement|drive|recruit)',
      'graduate hiring', 'onboard', 'add(s|ed)? [\\d,]+ (employees|staff)',
      'layoff', 'job cuts', 'retrench', 'bench', 'attrition',
      'salary (hike|increment)', 'appraisal', 'pay (hike|rise)', 'variable pay',
      'workforce', 'intake', 'trainee',
    ].join('|'), 'i'),
    noise: new RegExp([
      'share price', 'stock', 'target price', 'buy or sell', 'q\\d results preview',
      'dividend', 'buyback', 'market cap', 'brokerage', 'analyst',
      'resigns', 'appointed (as )?(ceo|cfo|md)', 'steps down', 'board approves',
      'scam', 'fraud', 'arrest', 'lawsuit', 'court',
      'horoscope', 'cricket',
    ].join('|'), 'i'),
  },

  funding: {
    query:
      '(Indian startup OR India startup) (raises OR raised OR funding OR "Series A" OR ' +
      '"Series B" OR "seed round") when:10d',
    relevant: new RegExp([
      'rais(e|es|ed|ing)', 'funding', 'series [a-f]\\b', 'seed round', 'pre[- ]seed',
      'secures', 'bags', 'mops up', 'closes .{0,20}round', 'led by',
    ].join('|'), 'i'),
    noise: new RegExp([
      'shuts? down', 'shutting', 'insolven', 'winding up', 'bankrupt',
      'scam', 'fraud', 'arrest', 'lawsuit', 'court', 'probe', 'raid',
      'layoff', 'fires', 'sacks',
      'opinion', 'explained', 'what it means', 'to watch', 'predictions',
    ].join('|'), 'i'),
  },
};

/**
 * Stories for one topic, newest first, at most two per publisher.
 *
 * Returns [] on any failure or empty week. Every caller treats an empty result
 * as "use a different pillar today", never as a reason to invent filler.
 */
export async function topicStories(name, { want = 6, days = 30 } = {}) {
  const topic = TOPICS[name];
  if (!topic) throw new Error(`unknown topic: ${name}`);

  const cutoff = Date.now() - (days + 0.5) * 864e5;
  const queries = Array.isArray(topic.query) ? topic.query : [topic.query];
  const seen = new Set();
  const perSource = {};
  const out = [];

  const batches = await Promise.all(queries.map((q) => feedItems(googleNews(q))));

  for (const raw of batches.flat()) {
    const item = parseItem(raw, { cutoff });
    if (!item) continue;

    const source = publisher(item.source);
    if (!source) continue;
    if (!topic.relevant.test(item.title) || topic.noise.test(item.title)) continue;

    const key = storyKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);

    perSource[source] = (perSource[source] ?? 0) + 1;
    if (perSource[source] > 2) continue;

    out.push({ title: decode(item.title), source, date: item.date, link: item.link, topic: name });
  }

  out.sort((a, b) => b.date.localeCompare(a.date));
  return out.slice(0, want);
}

/*
 * Company names mentioned in a headline, matched against companies we already
 * carry openings for.
 *
 * Only exact word-boundary matches on names of four characters or more. Short
 * or generic company names produce false positives that would have us claiming
 * to list a company we do not, which is worse than saying nothing.
 */
export function matchKnownCompanies(title, companies) {
  const t = String(title);
  const hits = [];
  for (const name of companies) {
    const clean = String(name).trim();
    if (clean.length < 4) continue;
    const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('\\b' + esc + '\\b', 'i').test(t)) hits.push(clean);
  }
  return hits;
}
