// Everything under /social is gone.
//
// These were the reel and carousel pages: /social/today, the two feeds, and
// the card images at /social/<date>/<n>.png. They were removed when that
// automation was paused.
//
// This file exists only so the URLs keep answering 410 instead of 404, and
// it has to be a route rather than a line in the middleware. Astro's Vercel
// adapter ends its routing table with a catch-all that hardcodes the status:
//
//   {"src":"^/.*$", "dest":"_render", "status":404}
//
// Anything without a declared route hits that, and Vercel applies the 404
// whatever the function returned — so the middleware's 410 arrived with the
// right body and the wrong status. A declared route is not matched by the
// catch-all, so the status survives.
//
// The difference is worth the file. A 404 tells a crawler the page is
// missing and might come back, so it returns to check. A 410 says it was
// deliberately removed. Search Console shows this site getting forty crawl
// requests in ninety days with zero discovery crawls, so a request spent
// re-checking something deleted is taken from a budget already too small to
// index the pages that exist.
//
// If the reel pages come back, delete this file first. A 410 sitting in
// front of a route that now works is invisible in testing and fatal in
// production.

export const prerender = false;

const gone = () =>
  new Response('Gone. This page was removed.', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
    },
  });

export const GET = gone;
export const HEAD = gone;
export const POST = gone;
