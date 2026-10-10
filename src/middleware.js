import { clientIp, take, bucketFor } from './lib/ratelimit.js';

// Security headers on every response, and a rate limit on the two paths that
// cost something to serve.
//
// These are defence in depth. The actual holes — third-party HTML rendered raw,
// and user input concatenated into a PostgREST filter — are closed at source in
// sanitize.js and db.js. Headers exist to limit the damage if something slips
// past that, and to shut down whole classes of attack the code cannot.

const CSP = [
  "default-src 'self'",

  // One external script host, and it is there because Google Analytics cannot
  // work without it. 'unsafe-inline' is required because the page carries
  // inline JSON-LD blocks and the visitor-count script; moving to a per-request
  // nonce is the obvious next hardening step, and is only worth doing once the
  // script inventory stops changing.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",

  // Astro emits scoped <style> blocks and the design uses inline style
  // attributes, so inline styles cannot be blocked without rewriting both.
  // No Google Fonts any more: the faces are served from this origin, so
  // neither host needs to be allowed. A narrower policy is the quiet
  // benefit of self-hosting.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",

  // Analytics still falls back to a tracking pixel in some browsers, so the
  // image hosts have to be allowed alongside the script.
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",

  // The daily reel is encoded on a real machine — Vercel cannot do video —
  // and served from Supabase Storage, so it is genuinely cross-origin. With
  // no media-src it fell through to default-src 'self' and was blocked
  // outright: the player rendered and sat black with nothing in the network
  // log. Storage only; the API host has no business being a media source.
  "media-src 'self' https://*.supabase.co",
  // Same-origin XHR plus the analytics endpoints. Every Supabase call still
  // happens server-side, so the browser never reaches the database host; these
  // three are the only outbound destinations a visitor's browser is allowed.
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",

  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  // Clickjacking: nothing may embed this site.
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

// Features this site never uses. Denying them means a compromised script
// cannot silently ask for them either.
const PERMISSIONS = [
  'accelerometer=()', 'ambient-light-sensor=()', 'autoplay=()', 'battery=()',
  'camera=()', 'display-capture=()', 'document-domain=()', 'encrypted-media=()',
  'geolocation=()', 'gyroscope=()', 'magnetometer=()', 'microphone=()',
  'midi=()', 'payment=()', 'usb=()', 'xr-spatial-tracking=()',
  'interest-cohort=()',
].join(', ');

/** Routes that existed, were removed deliberately, and are not coming back. */
const GONE = [
  /^\/social(\/|$)/,      // reel and carousel pages, paused
  /^\/api\/card$/,         // image renderer, could not run on Vercel
  /^\/api\/og$/,
];

export async function onRequest(context, next) {
  /*
   * One address per page.
   *
   * /jobs and /jobs/ both answered 200, and each told Google it was the
   * canonical one, so the same page could be indexed twice and split its own
   * ranking. Every internal link and every sitemap entry already uses the form
   * without the trailing slash, so that is the one that wins.
   *
   * A redirect rather than a canonical tag: a canonical is advice a search
   * engine may ignore, while this means the duplicate cannot be reached at all.
   * 308 rather than 301 so the method and body survive, which matters because
   * the scheduled POSTs to /api/* go through here too.
   */
  const { pathname, search } = context.url;

  /*
   * Pages that were removed on purpose answer 410, not 404.
   *
   * The difference matters here more than it usually would. A 404 tells a
   * crawler the page is missing and might return, so it comes back to check;
   * a 410 says it was deliberately removed and will not. Search Console
   * shows this site getting forty crawl requests in ninety days with zero
   * discovery crawls, so every request spent re-checking something that was
   * deleted is taken from a budget that is already too small to index the
   * pages that do exist.
   *
   * /social/* were the reel and carousel pages, removed when that automation
   * was paused. /api/card and /api/og were an image renderer that could not
   * run on this platform.
   *
   * If any of these come back, delete its line. A 410 on a route that now
   * exists is invisible in testing and fatal in production.
   */
  if (GONE.some((re) => re.test(pathname))) {
    return new Response('Gone. This page was removed.', {
      status: 410,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    return new Response(null, {
      status: 308,
      headers: { Location: pathname.replace(/\/+$/, '') + search },
    });
  }

  /*
   * Metered before anything else runs, so a blocked request costs a map lookup
   * rather than a page render and a database query. Only the open counter
   * endpoint and query-string requests are counted; see bucketFor() for why.
   */
  const bucket = bucketFor(pathname, search);
  if (bucket) {
    const { limited, retryAfter } = take(clientIp(context.request), bucket);
    if (limited) {
      return new Response('Too many requests. Try again shortly.', {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  }

  const response = await next();
  const h = response.headers;

  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', PERMISSIONS);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  h.set('X-DNS-Prefetch-Control', 'off');

  // HSTS only over TLS: sending it on plain http is meaningless, and in local
  // development it would pin localhost to https in the browser for a year.
  if (context.url.protocol === 'https:') {
    h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}
