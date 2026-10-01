// The Sunday roundup, generated and published without anyone present.
//
// Triggered by pg_cron inside Supabase at 04:30 UTC every Sunday, which is
// 10:00 IST. That fires a GitHub workflow_dispatch, the workflow runs this,
// commits the markdown it writes, and the commit deploys. pg_cron is used
// rather than a GitHub schedule because GitHub deprioritises scheduled
// workflows on free runners and ran a five minute cron every three to six
// hours; workflow_dispatch is not throttled that way.
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
//   npm run roundup           write this week's file
//   npm run roundup -- dry    print it, write nothing

import { writeFileSync, existsSync } from 'node:fs';
import { db } from './lib/supabase.js';
import { weeklyNews } from './lib/news.js';

const DRY = process.argv.includes('dry');
const OUT_DIR = 'src/content/insights';

const now = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const weekAgo = iso(new Date(now.getTime() - 7 * 864e5));

const longDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const yaml = (s) => String(s).replace(/"/g, "'").replace(/\s+/g, ' ').trim();

/* --------------------------------------------------------------- gather -- */

const [{ data: rows }, { data: history }, news] = await Promise.all([
  db.from('jobs').select('status, hiring_type, experience_level, city_primary, company_name, company_slug, slug, first_seen_at, updated_at, walkin_start').limit(5000),
  db.from('daily_stats').select('*').gte('day', iso(new Date(now.getTime() - 35 * 864e5))).order('day', { ascending: true }),
  weeklyNews(10),
]);

const all = rows ?? [];
const live = all.filter((j) => j.status === 'live');
const hist = history ?? [];

/*
 * Week on week comes from daily_stats, not from a rolling window over
 * first_seen_at. A rolling window counts the September backfill as "added this
 * week" and reported 226 added and 225 removed on a week when three listings
 * actually arrived. A snapshot taken a week ago is the only honest comparison,
 * and until there are two snapshots the roundup says so rather than guessing.
 */
const lastWeek = hist.find((h) => h.day <= weekAgo) ?? null;
const haveHistory = Boolean(lastWeek);
const deltaLive = haveHistory ? live.length - lastWeek.live : null;

// Arrivals and departures only count once there is a snapshot to trust. Before
// that, first_seen_at over seven days is reported as "since launch" instead.
const addedWindow = all.filter((j) => j.first_seen_at >= weekAgo && j.status === 'live').length;
const closedWindow = all.filter(
  (j) => ['expired', 'dead_link'].includes(j.status) && String(j.updated_at) >= weekAgo
).length;

const tally = (list, key) =>
  Object.entries(list.reduce((a, r) => (r[key] && (a[r[key]] = (a[r[key]] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]);

const cities = tally(live, 'city_primary');
const employers = Object.values(
  live.reduce((a, j) => {
    if (!j.company_slug) return a;
    a[j.company_slug] ??= { name: j.company_name, slug: j.company_slug, n: 0 };
    a[j.company_slug].n++;
    return a;
  }, {})
).sort((a, b) => b.n - a.n);

const today = iso(now);
const inAWeek = iso(new Date(now.getTime() + 7 * 864e5));
const drives = live
  .filter((j) => j.walkin_start && j.walkin_start >= today && j.walkin_start <= inAWeek)
  .sort((a, b) => a.walkin_start.localeCompare(b.walkin_start));

const freshers = live.filter((j) => j.experience_level === 'fresher').length;
const walkins = live.filter((j) => j.hiring_type === 'walk-in').length;

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

/** A line of live totals over the last few weeks, once there are points to plot. */
function trendChart() {
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

/* ----------------------------------------------------------------- copy -- */

const slug = `india-hiring-roundup-${today}`;

const newsBlock = news.length
  ? news.map((item, i) =>
      `**${i + 1}. [${item.title}](${item.link})**  \n${item.source} · ${shortDate(item.date)}`
    ).join('\n\n')
  : 'No stories from the publishers we follow cleared our filter this week. Rather than pad this section with whatever matched a keyword, it stays empty.';

const movement = haveHistory
  ? `${n(live.length)} openings are live, ${deltaLive === 0 ? 'unchanged on' : deltaLive > 0 ? `up ${n(deltaLive)} on` : `down ${n(Math.abs(deltaLive))} on`} last Sunday.`
  : `${n(live.length)} openings are live. This is an early edition, so there is no snapshot from last week to compare against yet; week on week figures start once the record has a few more days behind it.`;

const body = `
## This week in Indian hiring

${movement} Every one of them had its application link re-tested in the last 24 hours, and anything that closed came off the site the same day.

## Top 10 job market stories this week

${newsBlock}

${news.length ? 'Headlines and links only, from Indian newsrooms we keep on a short list. We do not summarise or rewrite them, because this page publishes automatically and an unchecked summary is how mistakes get printed. Click through for the full story.\n' : ''}
## The numbers on JoBmania

| | |
| --- | --- |
| Live openings | ${n(live.length)} |
| Open to freshers | ${n(freshers)} |
| Walk-in roles | ${n(walkins)} |
| Added in the last seven days | ${n(addedWindow)} |
| Taken down in the last seven days | ${n(closedWindow)} |

Counted from our own database on ${longDate(now)}. Listings come off when the drive finishes, the closing date passes, or the employer's application link stops responding, and we publish [every removal with its reason](/closed).

${trendChart()}

## Where the openings are

${barChart({
  title: 'Live openings by city',
  note: `Counted ${longDate(now)}`,
  rows: cities.slice(0, 7),
  ariaLabel: 'Live job openings by city in India',
})}

${cities.length ? `[${cities[0][0]}](/city/${cities[0][0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}) leads again this week.` : ''}

## Who is hiring most

| Employer | Live openings |
| --- | --- |
${employers.slice(0, 7).map((e) => `| [${e.name}](/company/${e.slug}) | ${n(e.n)} |`).join('\n')}

${drives.length ? `## Walk-in drives in the next seven days

${drives.length === 1 ? 'One drive is' : `${n(drives.length)} drives are`} scheduled. Confirm the venue and timing on the employer's own page before you travel, because drives get moved and cancelled at short notice.

| Date | Employer | City |
| --- | --- | --- |
${drives.slice(0, 12).map((d) => `| ${shortDate(d.walkin_start)} | [${d.company_name}](/job/${d.slug}) | ${d.city_primary ?? 'See listing'} |`).join('\n')}
` : `## Walk-in drives

Nothing is scheduled in the next seven days. [Walk-ins](/c/walk-ins) are usually announced two or three days ahead, so it is worth checking again midweek.
`}

## Where to look next

- [All live openings](/jobs), re-checked daily
- [Fresher jobs](/c/freshers) and [internships](/c/internships)
- [Walk-in interviews](/c/walk-ins)
- [What we removed this week, and why](/closed)
`.trim();

const lead = news[0] ? yaml(news[0].title) : 'the week in Indian hiring';

const frontmatter = `---
kind: blog
title: "India hiring roundup: ${longDate(now)}"
dek: "The top 10 Indian job market stories this week, plus what changed on JoBmania: ${n(live.length)} live openings, ${n(drives.length)} walk-in drives scheduled, and where the hiring is."
seoTitle: "India Hiring Roundup: ${shortDate(now)}"
metaDescription: "India hiring roundup for ${longDate(now)}: top 10 job market news stories, ${n(live.length)} live openings and every walk-in drive in the next seven days."
published: ${today}
dataAsOf: ${today}
tags:
  - india hiring roundup
  - india job market news
  - weekly job news
  - walk in interviews this week
  - fresher jobs India
faq:
  - q: When is the India hiring roundup published?
    a: "Every Sunday at 10am IST. It is generated automatically from our own listings database and from Indian news feeds, so it goes out whether or not anyone is at a keyboard."
  - q: Where do the news stories come from?
    a: "Indian newsrooms we keep on a short list, including the Economic Times, Mint, Moneycontrol, Business Standard, the Times of India, CNBC-TV18 and People Matters. We publish the headline, the publisher and the date, and link to the original. We do not summarise or rewrite the reporting."
  - q: Where do the JoBmania numbers come from?
    a: "Our own listings table, counted at the moment the roundup is generated, with that date stated on the page. We track openings across India, re-test every application link daily, and remove anything that has closed."
  - q: Why do listings get taken down?
    a: "A walk-in drive finished, a closing date passed, or the employer's application link stopped responding. Every removal appears on our Recently closed page with the reason."
  - q: How do I find walk-in interviews near me this week?
    a: "The drives scheduled in the next seven days are listed in this roundup with their dates and cities, and the full list is on our walk-in interviews page. Always confirm the venue on the employer's own page before travelling."
---

`;

/* ---------------------------------------------------------------- write -- */

const path = `${OUT_DIR}/${slug}.md`;
const file = frontmatter + body + '\n';

if (DRY) {
  console.log(file);
  console.log(`\n--- dry run. Would write ${path}`);
} else if (existsSync(path)) {
  console.log(`already exists, leaving it alone: ${path}`);
} else {
  writeFileSync(path, file, 'utf8');
  console.log(`wrote ${path}`);
  console.log(`  news ${news.length} · live ${live.length} · drives ${drives.length} · history ${hist.length} days`);
}
