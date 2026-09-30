// Google Indexing API.
//
// Google restricts this API to two content types, and JobPosting is one of
// them. It is not a loophole: it exists because job listings go stale faster
// than a crawl cycle, which is the whole premise of this site. A new listing is
// crawled in minutes instead of days, and a closed one can be dropped the hour
// it closes rather than sitting in results until Google happens to revisit.
//
// Two notification types are used:
//   URL_UPDATED  a listing went live, or its facts changed
//   URL_DELETED  a listing closed, expired, or its apply link died
//
// Quota is 200 URLs a day by default, which is comfortably above what this
// site produces. Calls are best-effort: a failure here must never block an
// ingest or an expiry pass, so everything returns rather than throws.
//
// Setup is in db/../README; it needs a Google Cloud service account with the
// Indexing API enabled, added as an Owner of the property in Search Console.
// Without GOOGLE_INDEXING_CREDENTIALS set, every function here is a no-op, so
// the pipeline runs identically whether or not it is configured.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PUBLISH_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SCOPE = 'https://www.googleapis.com/auth/indexing';

const creds = () => {
  const raw = process.env.GOOGLE_INDEXING_CREDENTIALS;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j.client_email && j.private_key ? j : null;
  } catch {
    return null;
  }
};

export const indexingEnabled = () => creds() != null;

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * A service-account access token, signed locally.
 *
 * Done by hand rather than pulling in googleapis, which is a very large
 * dependency for one JWT. Node's crypto signs RS256 natively, and a smaller
 * dependency tree is a smaller supply-chain surface.
 */
let cached = { token: null, expires: 0 };
async function accessToken() {
  const c = creds();
  if (!c) return null;
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;

  const { createSign } = await import('node:crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: c.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(c.private_key.replace(/\\n/g, '\n')))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.access_token) return null;
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/**
 * Tell Google a listing appeared or changed.
 * @returns {Promise<boolean>} true when Google accepted it
 */
export async function notifyUpdated(url) {
  return publish(url, 'URL_UPDATED');
}

/** Tell Google a listing is gone, so it leaves results without waiting for a recrawl. */
export async function notifyDeleted(url) {
  return publish(url, 'URL_DELETED');
}

async function publish(url, type) {
  if (!url || !creds()) return false;
  try {
    const token = await accessToken();
    if (!token) return false;
    const res = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, type }),
    });
    return res.ok;
  } catch {
    // Never let an indexing ping break an ingest or an expiry pass.
    return false;
  }
}

/**
 * Several at once, in series with a small gap. The quota is per day rather
 * than per second, but a burst against any API is bad manners and the pipeline
 * is never in a hurry.
 */
export async function notifyMany(urls, type = 'URL_UPDATED') {
  if (!creds()) return { sent: 0, failed: 0, skipped: urls.length };
  let sent = 0, failed = 0;
  for (const u of urls) {
    const ok = await publish(u, type);
    ok ? sent++ : failed++;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { sent, failed, skipped: 0 };
}
