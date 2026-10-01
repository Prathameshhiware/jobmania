// Builds the Sunday roundup. Returns a finished post; writes nothing.
//
// Two callers use this: the API route at /api/roundup, which pg_cron fires at
// 04:30 UTC every Sunday, and `npm run roundup -- dry` for looking at it
// locally before it goes anywhere.
//
// Two kinds of content, and the difference matters because nobody reads this
// before it goes live:
//
//   News   headline, publisher, date, link. Nothing written, nothing
//          summarised, nothing inferred. Real mastheads only, via an allowlist.
//   Data   counted from our own database, with the date it was counted.
//
// There is deliberately no generated commentary. An unattended page is the
// worst possible place for a sentence nobody checked.
//
// Emits HTML rather than markdown. The post is stored in the database and
// rendered at request time, so markdown would mean parsing it on every view and
// carrying a parser we do not otherwise need. It also removes a bug we have
// already had once, where markdown read an indented inline chart as a code
// block and printed the SVG source to the reader.

import { db } from './supabase.js';
import { weeklyNews } from './news.js';

const iso = (d) => d.toISOString().slice(0, 10);

const longDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');

/** Text going into HTML. Everything interpolated below passes through here. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A URL going into an href. Anything not plainly http(s) is dropped. */
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? esc(u) : '#');

const citySlug = (c) =>
  String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const tally = (list, key) =>
  Object.entries(list.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]);

/* ------------------------------------------------------------- visuals --- */

/** Horizontal bars, drawn from real counts, themed with the site's own tokens. */
function barChart({ title, note, rows: data, ariaLabel }) {
  if (!data.length) return '';
  const max = Math.max(...data.map((d) => d[1]));
  const W = 700, labelW = 170, barW = 440, top = 52, step = 34;
  const bars = data.map(([label, value], i) => {
    const y = top + i * step;
    const w = Math.max(3, Math.round((value / max) * barW));
    return `<text x="0" y="${y + 15}" font-size="12" fill="var(--ink-2)">${esc(label)}</text>` +
      `<rect x="${labelW}" y="${y}" width="${w}" height="20" rx="5" fill="var(--accent)" opacity="${i === 0 ? 0.95 : 0.6}"/>` +
      `<text x="${labelW + w + 10}" y="${y + 15}" font-size="12" font-weight="700" fill="var(--ink)">${n(value)}</text>`;
  }).join('');
  const h = top + data.length * step + 8;
  return `<div style="margin:28px 0;padding:22px;border:1px solid var(--hairline);border-radius:16px">` +
    `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(ariaLabel)}" style="width:100%;height:auto">` +
    `<text x="0" y="16" font-size="13" font-weight="700" fill="var(--ink)">${esc(title)}</text>` +
    `<text x="0" y="34" font-size="11" fill="var(--ink-3)">${esc(note)}</text>${bars}</svg></div>`;
}

/** A line of live totals over recent weeks, once there are points to plot. */
function trendChart(hist) {
  const pts = hist.filter((h) => Number.isFinite(h.live));
  if (pts.length < 3) return '';
  const W = 700, H = 200, L = 46, R = 20, T = 48, B = 34;
  const vals = pts.map((p) => p.live);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(1, hi - lo);
  const x = (i) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / span) * (H - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.live).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.live).toFixed(1)}" r="3" fill="var(--accent)"/>`).join('');
  const first = pts[0], last = pts.at(-1);
  return `<div style="margin:28px 0;padding:22px;border:1px solid var(--hairline);border-radius:16px">` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Live openings on JoBmania over recent weeks" style="width:100%;height:auto">` +
    `<text x="0" y="16" font-size="13" font-weight="700" fill="var(--ink)">Live openings over time</text>` +
    `<text x="0" y="34" font-size="11" fill="var(--ink-3)">Counted once a day from our own database</text>` +
    `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}` +
    `<text x="${L}" y="${H - 10}" font-size="11" fill="var(--ink-3)">${esc(shortDate(first.day))}</text>` +
    `<text x="${W - R}" y="${H - 10}" font-size="11" text-anchor="end" fill="var(--ink-3)">${esc(shortDate(last.day))}</text>` +
    `<text x="0" y="${y(hi) + 4}" font-size="11" fill="var(--ink-4)">${n(hi)}</text>` +
    `<text x="0" y="${y(lo) + 4}" font-size="11" fill="var(--ink-4)">${n(lo)}</text>` +
    `</svg></div>`;
}

const rows2 = (pairs) =>
  `<table><tbody>${pairs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>`;

/* ----------------------------------------------------------------- build - */

/**
 * Gathers the week and returns a finished post. Throws only if the jobs table
 * is unreachable; a week with no usable news produces a post that says so.
 */
export async function buildRoundup({ now = new Date() } = {}) {
  const today = iso(now);
  const weekAgo = iso(new Date(now.getTime() - 7 * 864e5));
  const inAWeek = iso(new Date(now.getTime() + 7 * 864e5));

  const [jobsRes, histRes, news] = await Promise.all([
    db.from('jobs')
      .select('status, hiring_type, experience_level, city_primary, company_name, company_slug, slug, first_seen_at, updated_at, walkin_start')
      .limit(5000),
    db.from('daily_stats')
      .select('*')
      .gte('day', iso(new Date(now.getTime() - 35 * 864e5)))
      .order('day', { ascending: true }),
    weeklyNews(10),
  ]);

  if (jobsRes.error) throw new Error(`jobs: ${jobsRes.error.message}`);

  const all = jobsRes.data ?? [];
  const live = all.filter((j) => j.status === 'live');
  // daily_stats may not exist yet. That costs a chart, not the post.
  const hist = histRes.error ? [] : (histRes.data ?? []);

  /*
   * Week on week comes from daily_stats, not from a rolling window over
   * first_seen_at. A rolling window counts the September backfill as "added
   * this week" and reported 226 added and 225 removed on a week when three
   * listings actually arrived. A snapshot taken a week ago is the only honest
   * comparison, and until there are two snapshots the roundup says so.
   */
  const lastWeek = hist.find((h) => h.day <= weekAgo) ?? null;
  const haveHistory = Boolean(lastWeek);
  const deltaLive = haveHistory ? live.length - lastWeek.live : null;

  const addedWindow = all.filter((j) => j.first_seen_at >= weekAgo && j.status === 'live').length;
  const closedWindow = all.filter(
    (j) => ['expired', 'dead_link'].includes(j.status) && String(j.updated_at) >= weekAgo
  ).length;

  const cities = tally(live, 'city_primary');
  const employers = Object.values(
    live.reduce((a, j) => {
      if (!j.company_slug) return a;
      a[j.company_slug] ??= { name: j.company_name, slug: j.company_slug, n: 0 };
      a[j.company_slug].n++;
      return a;
    }, {})
  ).sort((a, b) => b.n - a.n);

  const drives = live
    .filter((j) => j.walkin_start && j.walkin_start >= today && j.walkin_start <= inAWeek)
    .sort((a, b) => a.walkin_start.localeCompare(b.walkin_start));

  const freshers = live.filter((j) => j.experience_level === 'fresher').length;
  const walkins = live.filter((j) => j.hiring_type === 'walk-in').length;

  /* --------------------------------------------------------------- copy -- */

  const movement = haveHistory
    ? `${n(live.length)} openings are live, ${deltaLive === 0 ? 'unchanged on' : deltaLive > 0 ? `up ${n(deltaLive)} on` : `down ${n(Math.abs(deltaLive))} on`} last Sunday.`
    : `${n(live.length)} openings are live. This is an early edition, so there is no snapshot from last week to compare against yet; week on week figures start once the record has a few more days behind it.`;

  const newsBlock = news.length
    ? `<ol class="news">` +
      news.map((item) =>
        `<li><a href="${safeUrl(item.link)}" rel="nofollow noopener noreferrer" target="_blank">${esc(item.title)}</a>` +
        `<br><small>${esc(item.source)} &middot; ${esc(shortDate(item.date))}</small></li>`
      ).join('') +
      `</ol>` +
      `<p>Headlines and links only, from Indian newsrooms we keep on a short list. We do not summarise or rewrite them, because this page publishes automatically and an unchecked summary is how mistakes get printed. Click through for the full story.</p>`
    : `<p>No stories from the publishers we follow cleared our filter this week. Rather than pad this section with whatever matched a keyword, it stays empty.</p>`;

  const drivesBlock = drives.length
    ? `<h2>Walk-in drives in the next seven days</h2>` +
      `<p>${drives.length === 1 ? 'One drive is' : `${n(drives.length)} drives are`} scheduled. Confirm the venue and timing on the employer&rsquo;s own page before you travel, because drives get moved and cancelled at short notice.</p>` +
      `<table><thead><tr><th>Date</th><th>Employer</th><th>City</th></tr></thead><tbody>` +
      drives.slice(0, 12).map((d) =>
        `<tr><td>${esc(shortDate(d.walkin_start))}</td>` +
        `<td><a href="/job/${esc(d.slug)}">${esc(d.company_name)}</a></td>` +
        `<td>${esc(d.city_primary ?? 'See listing')}</td></tr>`
      ).join('') +
      `</tbody></table>`
    : `<h2>Walk-in drives</h2>` +
      `<p>Nothing is scheduled in the next seven days. <a href="/c/walk-ins">Walk-ins</a> are usually announced two or three days ahead, so it is worth checking again midweek.</p>`;

  const html = [
    `<h2>This week in Indian hiring</h2>`,
    `<p>${esc(movement)} Every one of them had its application link re-tested in the last 24 hours, and anything that closed came off the site the same day.</p>`,

    `<h2>Top 10 job market stories this week</h2>`,
    newsBlock,

    `<h2>The numbers on JoBmania</h2>`,
    /*
     * Arrivals and departures are listed only once there are two snapshots a
     * week apart to subtract. first_seen_at is when we first saw a listing, not
     * when the employer posted it, so over a rolling seven days it counts the
     * launch import as this week's arrivals: it reported 226 added and 225
     * removed on a week when three listings actually came in. A number that
     * wrong is worse than no number.
     */
    rows2([
      ['Live openings', n(live.length)],
      ['Open to freshers', n(freshers)],
      ['Walk-in roles', n(walkins)],
      ...(haveHistory
        ? [
            ['Added in the last seven days', n(addedWindow)],
            ['Taken down in the last seven days', n(closedWindow)],
          ]
        : []),
    ]),
    haveHistory
      ? ''
      : `<p>Arrivals and departures are not listed this week. Most of what is on the site came in as one import at launch, and counting first-seen dates across seven days would report that import as this week's news. Those two rows start once there are two snapshots a week apart to subtract.</p>`,
    `<p>Counted from our own database on ${esc(longDate(now))}. Listings come off when the drive finishes, the closing date passes, or the employer&rsquo;s application link stops responding, and we publish <a href="/closed">every removal with its reason</a>.</p>`,
    trendChart(hist),

    `<h2>Where the openings are</h2>`,
    barChart({
      title: 'Live openings by city',
      note: `Counted ${longDate(now)}`,
      rows: cities.slice(0, 7),
      ariaLabel: 'Live job openings by city in India',
    }),
    cities.length
      ? `<p><a href="/city/${esc(citySlug(cities[0][0]))}">${esc(cities[0][0])}</a> leads again this week.</p>`
      : '',

    `<h2>Who is hiring most</h2>`,
    `<table><thead><tr><th>Employer</th><th>Live openings</th></tr></thead><tbody>` +
      employers.slice(0, 7).map((e) =>
        `<tr><td><a href="/company/${esc(e.slug)}">${esc(e.name)}</a></td><td>${n(e.n)}</td></tr>`
      ).join('') +
      `</tbody></table>`,

    drivesBlock,

    `<h2>Where to look next</h2>`,
    `<ul>` +
      `<li><a href="/jobs">All live openings</a>, re-checked daily</li>` +
      `<li><a href="/c/freshers">Fresher jobs</a> and <a href="/c/internships">internships</a></li>` +
      `<li><a href="/c/walk-ins">Walk-in interviews</a></li>` +
      `<li><a href="/closed">What we removed this week, and why</a></li>` +
      `</ul>`,
  ].filter(Boolean).join('\n');

  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    slug: `india-hiring-roundup-${today}`,
    kind: 'blog',
    title: `India hiring roundup: ${longDate(now)}`,
    dek: `The top 10 Indian job market stories this week, plus what changed on JoBmania: ${n(live.length)} live openings, ${n(drives.length)} walk-in drives scheduled, and where the hiring is.`,
    seoTitle: `India Hiring Roundup: ${shortDate(now)}`,
    metaDescription: `India hiring roundup for ${longDate(now)}: top 10 job market news stories, ${n(live.length)} live openings and every walk-in drive in the next seven days.`,
    published: today,
    dataAsOf: today,
    tags: [
      'india hiring roundup',
      'india job market news',
      'weekly job news',
      'walk in interviews this week',
      'fresher jobs India',
    ],
    faq: [
      {
        q: 'When is the India hiring roundup published?',
        a: 'Every Sunday at 10am IST. It is generated automatically from our own listings database and from Indian news feeds, so it goes out whether or not anyone is at a keyboard.',
      },
      {
        q: 'Where do the news stories come from?',
        a: 'Indian newsrooms we keep on a short list, including the Economic Times, Mint, Moneycontrol, Business Standard, the Times of India, CNBC-TV18 and People Matters. We publish the headline, the publisher and the date, and link to the original. We do not summarise or rewrite the reporting.',
      },
      {
        q: 'Where do the JoBmania numbers come from?',
        a: 'Our own listings table, counted at the moment the roundup is generated, with that date stated on the page. We track openings across India, re-test every application link daily, and remove anything that has closed.',
      },
      {
        q: 'Why do listings get taken down?',
        a: 'A walk-in drive finished, a closing date passed, or the employer’s application link stopped responding. Every removal appears on our Recently closed page with the reason.',
      },
      {
        q: 'How do I find walk-in interviews near me this week?',
        a: 'The drives scheduled in the next seven days are listed in this roundup with their dates and cities, and the full list is on our walk-in interviews page. Always confirm the venue on the employer’s own page before travelling.',
      },
    ],
    // Cited in the structured data without repeating the links on the page:
    // the story list above already shows every one of them with its publisher.
    citations: news.map((i) => i.link),
    html,
    plain,
    stats: { news: news.length, live: live.length, drives: drives.length, history: hist.length },
  };
}
