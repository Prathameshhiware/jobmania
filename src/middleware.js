// Security headers on every response.
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
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",

  // Analytics still falls back to a tracking pixel in some browsers, so the
  // image hosts have to be allowed alongside the script.
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
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

export async function onRequest(context, next) {
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
