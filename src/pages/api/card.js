// Gone. This was a social card image renderer built on @vercel/og, which
// could not be made to run here: imported as ESM it fails with "Dynamic
// require of fs is not supported", and through createRequire it cannot find
// itself. It is built for Next.js's bundler, not Astro. The replacement
// calls satori and resvg directly — see src/lib/render.js.
//
// Kept as a route rather than deleted outright so the URL answers 410 and a
// crawler stops coming back. See src/pages/social/[...path].js for why a
// route is needed instead of a middleware rule.

export const prerender = false;

const gone = () =>
  new Response('Gone. This endpoint was removed.', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
    },
  });

export const GET = gone;
export const HEAD = gone;
