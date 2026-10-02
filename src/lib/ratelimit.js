// A speed bump for scripts, not a wall.
//
// Vercel already absorbs volumetric attacks: L3, L4 and L7 mitigation is on by
// default, and Attack Challenge Mode can be switched on in the dashboard. What
// none of that stops is a cheap, low-volume script that stays under those
// thresholds and quietly spends the things this project is rationed on.
//
// Two holes were found by testing rather than guessing:
//
//   /jobs?q=<random>   a different query string is a different cache key, so
//                      every request misses the edge and wakes a function.
//                      20 out of 20 were served, none throttled, each costing
//                      about 0.87s of render and one database query.
//   POST /api/visit    open by design so the footer counter works. It returns
//                      200 to anything that sends a matching Origin header.
//
// Neither exposes data. Both spend the Hobby plan's function invocations, and
// exceeding that allowance does not bill you — it blocks the site for 30 days.
// A quota is a strange thing to have to defend, but that is the shape of it.
//
// This is deliberately in memory. A serverless instance does not share state
// with its siblings and does not live long, so a determined attacker spread
// across instances gets through. That is accepted: the goal is to make the
// cheap script expensive, not to replace the firewall. Anything stronger wants
// Vercel's WAF, which costs nothing to turn on and lives above this code.

const WINDOW_MS = 60_000;

/*
 * Generous on purpose. Mobile networks in India put very large numbers of real
 * people behind one address, so a limit tuned to a single human browsing would
 * lock out a whole carrier. A page view costs a handful of requests; nobody
 * legitimately makes 150 in a minute, and a script makes thousands.
 */
const LIMITS = {
  page: 150,
  visit: 20,   // the open counter endpoint
};

/*
 * Capped so the map cannot grow without limit under a spread attack, which
 * would turn a nuisance into a memory problem. Oldest entries go first.
 */
const MAX_KEYS = 5000;

const hits = new Map();

function prune(now) {
  for (const [key, rec] of hits) {
    if (now - rec.start > WINDOW_MS) hits.delete(key);
  }
  if (hits.size > MAX_KEYS) {
    const excess = hits.size - MAX_KEYS;
    let i = 0;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (++i >= excess) break;
    }
  }
}

/** The caller's address as Vercel reports it, or null when it cannot be read. */
export function clientIp(request) {
  const h = request.headers;
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? h.get('x-vercel-forwarded-for') ?? null;
}

/**
 * Records a request and says whether it is over the limit.
 * Returns { limited, remaining, retryAfter }.
 */
export function take(ip, bucket = 'page') {
  if (!ip) return { limited: false, remaining: Infinity, retryAfter: 0 };

  const now = Date.now();
  if (hits.size > 64) prune(now);

  const key = `${bucket}:${ip}`;
  const rec = hits.get(key);

  if (!rec || now - rec.start > WINDOW_MS) {
    hits.set(key, { start: now, n: 1 });
    return { limited: false, remaining: LIMITS[bucket] - 1, retryAfter: 0 };
  }

  rec.n++;
  const limit = LIMITS[bucket] ?? LIMITS.page;
  if (rec.n > limit) {
    return {
      limited: true,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - rec.start)) / 1000)),
    };
  }
  return { limited: false, remaining: limit - rec.n, retryAfter: 0 };
}

/**
 * Which bucket a request belongs to, or null when it should not be counted.
 *
 * Only two things are metered: the open counter endpoint, and requests that
 * carry a query string. A plain page is served from the edge cache without
 * waking a function, so counting it would punish ordinary readers for traffic
 * that costs nothing. The token-protected endpoints are left alone — they
 * answer 401 before doing any work, and the scheduler calls them from one
 * address many times a day quite legitimately.
 */
export function bucketFor(pathname, search) {
  if (pathname === '/api/visit') return 'visit';
  if (pathname.startsWith('/api/')) return null;
  if (search && search.length > 1) return 'page';
  return null;
}
