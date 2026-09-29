// Live listings only. An expired job leaves the sitemap the same day it is
// delisted, which is the whole point — a sitemap full of dead jobs is how a
// site teaches Google to distrust it.

import { getAllLive, getFacets } from '../lib/db.js';
import { citySlug, CATEGORIES } from '../lib/format.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET({ site }) {
  const origin = (site?.origin ?? 'https://jobmania.vercel.app').replace(/\/$/, '');
  const [jobs, facets] = await Promise.all([getAllLive(), getFacets()]);

  const url = (loc, lastmod, changefreq, priority) =>
    `  <url>\n    <loc>${esc(origin + loc)}</loc>\n` +
    (lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>\n` : '') +
    `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

  const entries = [
    url('/', new Date(), 'hourly', '1.0'),
    url('/jobs', new Date(), 'hourly', '0.9'),
    ...CATEGORIES.map((c) => url(`/c/${c.slug}`, new Date(), 'daily', '0.8')),
    ...facets.cities.map(([name]) => url(`/city/${citySlug(name)}`, new Date(), 'daily', '0.8')),
    // thin company pages are left out rather than published as near-empty pages
    ...facets.companies.filter((c) => c.n >= 2).map((c) => url(`/company/${c.slug}`, new Date(), 'weekly', '0.6')),
    ...jobs.map((j) => url(`/job/${j.slug}`, j.updated_at ?? j.posted_at, 'daily', '0.7')),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } }
  );
}
