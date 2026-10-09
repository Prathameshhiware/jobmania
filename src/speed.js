// Times every kind of page on the live site.
//
//   npm run speed            against production
//   npm run speed <origin>   against anything else
//
// Two passes. The first is whatever the edge happens to be holding; the
// second, with a cache-busting query string, forces the page to be rendered
// for real. The gap between them is the part that can actually be fixed —
// a cache hit says nothing about how slow the page is to build.
//
// Reports the slowest of three attempts rather than the mean, because a
// visitor does not experience the mean. They experience the time it took
// them.

const ORIGIN = process.argv[2] || 'https://jobmania.dpdns.org';
const BUDGET = 2500;
const TRIES = 3;

const PAGES = [
  ['home', '/'],
  ['all jobs', '/jobs'],
  ['category', '/c/freshers'],
  ['walk-ins', '/c/walk-ins'],
  ['remote', '/c/remote'],
  ['city', '/city/bengaluru'],
  ['city + cat', '/city/hyderabad/walk-ins'],
  ['closed', '/closed'],
  ['glossary', '/glossary'],
  ['insights', '/insights'],
  ['article', '/insights/blogs/trusted-job-sites-india'],
  ['sitemap', '/sitemap.xml'],
];

async function time(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    await res.arrayBuffer();                    // the visitor waits for the body too
    return { ms: Date.now() - t0, status: res.status, cache: res.headers.get('x-vercel-cache') ?? '-' };
  } catch (err) {
    return { ms: Date.now() - t0, status: 'ERR', cache: String(err?.message ?? err).slice(0, 20) };
  }
}

const slowest = async (url) => {
  let worst = { ms: -1 };
  for (let i = 0; i < TRIES; i++) {
    const r = await time(url);
    if (r.ms > worst.ms) worst = r;
  }
  return worst;
};

console.log(`${ORIGIN}   budget ${BUDGET}ms, slowest of ${TRIES}\n`);
console.log('page          cached        uncached      verdict');
console.log('------------  ------------  ------------  -------');

let over = 0;
for (const [name, path] of PAGES) {
  const warm = await slowest(`${ORIGIN}${path}`);
  // A unique query string guarantees the edge has never seen this URL, so
  // the page is built from scratch — the worst a real visitor can get.
  const cold = await slowest(`${ORIGIN}${path}${path.includes('?') ? '&' : '?'}_cb=${Date.now()}`);

  const bad = cold.ms > BUDGET || warm.ms > BUDGET;
  if (bad) over++;
  console.log(
    `${name.padEnd(13)} ${String(warm.ms + 'ms').padEnd(13)} ${String(cold.ms + 'ms').padEnd(13)} ` +
    `${bad ? 'OVER' : 'ok'}${warm.status !== 200 ? '  status ' + warm.status : ''}`,
  );
}

console.log(`\n${over} of ${PAGES.length} over ${BUDGET}ms`);
process.exit(over ? 1 : 0);
