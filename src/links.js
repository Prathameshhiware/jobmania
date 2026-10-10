// Checks every URL the site publishes, and every internal link it renders.
//
//   npm run links            against production
//   npm run links <origin>   against anything else
//
// Two questions, and they fail in different ways:
//
//   Does everything in the sitemap resolve?   A 404 in a sitemap is a URL
//     we told Google to index and then removed. Search Console reports it as
//     an error against the property, and it spends crawl budget that this
//     site has very little of.
//
//   Does every internal link resolve?   A link to a page that no longer
//     exists is a dead end for a reader, and Googlebot follows it before
//     finding out.
//
// Redirects are reported separately from failures. A 308 works for a visitor
// but costs an extra round trip, and a redirect inside a sitemap is a page
// Google has to fetch twice to index once.

const ORIGIN = (process.argv[2] || 'https://jobmania.dpdns.org').replace(/\/$/, '');
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (compatible; JoBmaniaLinkCheck/0.1; +https://jobmania.dpdns.org)';

/** HEAD where it is allowed, GET where it is not. Never throws. */
async function check(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'manual',
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      // Some hosts answer HEAD with 405; fall through and try GET.
      if (res.status === 405 && method === 'HEAD') continue;
      return { status: res.status, location: res.headers.get('location') };
    } catch (err) {
      if (method === 'GET') return { status: 0, error: String(err?.message ?? err).slice(0, 40) };
    }
  }
  return { status: 0, error: 'unreachable' };
}

/** Run `fn` over `items`, a few at a time, keeping the order of results. */
async function pool(items, fn, width = CONCURRENCY) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const text = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  return res.ok ? res.text() : '';
};

console.log(`${ORIGIN}\n`);

// ------------------------------------------------------------- the sitemap
const xml = await text(`${ORIGIN}/sitemap.xml`);
const sitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
console.log(`sitemap: ${sitemap.length} URLs, checking…`);

const smResults = await pool(sitemap, async (u) => ({ url: u, ...(await check(u)) }));
const smBad = smResults.filter((r) => r.status >= 400 || r.status === 0);
const smRedir = smResults.filter((r) => r.status >= 300 && r.status < 400);

console.log(`  ${smResults.length - smBad.length - smRedir.length} ok, ${smRedir.length} redirect, ${smBad.length} broken`);

// --------------------------------------------------------- internal links
// A sample of page types rather than all 675: every job page renders from
// the same template, so checking one proves the template and checking six
// hundred just spends time.
const SAMPLE = ['/', '/jobs', '/c/freshers', '/c/walk-ins', '/c/internships', '/c/remote',
                '/c/off-campus', '/c/just-posted', '/city/bengaluru', '/city/hyderabad',
                '/closed', '/glossary', '/insights', '/insights/blogs/trusted-job-sites-india'];

const found = new Map();                      // url -> pages that link to it
for (const path of SAMPLE) {
  const html = await text(`${ORIGIN}${path}`);
  for (const m of html.matchAll(/href="([^"#?]+)"/g)) {
    const href = m[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const abs = `${ORIGIN}${href}`;
    if (!found.has(abs)) found.set(abs, new Set());
    found.get(abs).add(path);
  }
}

const links = [...found.keys()];
console.log(`\ninternal links: ${links.length} distinct across ${SAMPLE.length} pages, checking…`);

const liResults = await pool(links, async (u) => ({ url: u, ...(await check(u)) }));
const liBad = liResults.filter((r) => r.status >= 400 || r.status === 0);
const liRedir = liResults.filter((r) => r.status >= 300 && r.status < 400);

console.log(`  ${liResults.length - liBad.length - liRedir.length} ok, ${liRedir.length} redirect, ${liBad.length} broken`);

// ------------------------------------------------------------------ report
const show = (title, rows, withSource = false) => {
  if (!rows.length) return;
  console.log(`\n${title}`);
  for (const r of rows.slice(0, 40)) {
    const p = r.url.replace(ORIGIN, '');
    const extra = r.location ? ` -> ${r.location.replace(ORIGIN, '')}` : r.error ? ` (${r.error})` : '';
    const from = withSource && found.has(r.url) ? `   linked from ${[...found.get(r.url)].slice(0, 3).join(', ')}` : '';
    console.log(`  ${String(r.status).padEnd(4)} ${p}${extra}${from}`);
  }
  if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
};

show('BROKEN in sitemap — told Google to index, then removed:', smBad);
show('REDIRECTS in sitemap — Google fetches twice to index once:', smRedir);
show('BROKEN internal links — dead ends for readers and crawlers:', liBad, true);
show('REDIRECTING internal links — an extra round trip each:', liRedir, true);

const total = smBad.length + liBad.length;
console.log(`\n${total} broken, ${smRedir.length + liRedir.length} redirecting`);
process.exit(total ? 1 : 0);
