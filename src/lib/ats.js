// Resolves an apply URL to the employer's own listing.
//
// This is where a job gets upgraded from "an aggregator mentioned it" to
// "the employer publishes it". Where we can reach the employer's own public
// board API, we take their description from there — it is theirs, published
// for syndication, and it is the canonical text. Where we cannot, the record
// stays in needs_review with facts only and no description at all.

const UA = 'JoBmaniaBot/0.1 (+https://jobmania.dpdns.org; job listing verification)';

export const ATS = [
  { id: 'greenhouse', test: /(?:^|\.)(?:boards|job-boards)\.greenhouse\.io$/i },
  { id: 'lever',      test: /(?:^|\.)jobs\.lever\.co$/i },
  { id: 'smartrecruiters', test: /(?:^|\.)jobs\.smartrecruiters\.com$/i },
  { id: 'workday',    test: /\.myworkdayjobs\.com$/i },
  { id: 'peoplestrong', test: /\.peoplestrong\.com$/i },
  { id: 'turbohire', test: /\.turbohire\.co$/i },
  { id: 'phenom',    test: /\.phenompeople\.com$/i },
  { id: 'workable',  test: /(?:^|\.)apply\.workable\.com$/i },
  { id: 'ashby',     test: /(?:^|\.)jobs\.ashbyhq\.com$/i },
];

export function identifyAts(url) {
  try {
    const host = new URL(url).hostname;
    return ATS.find((a) => a.test.test(host))?.id ?? null;
  } catch { return null; }
}

async function get(url, { json = false, timeout = 12000 } = {}) {
  const ctl = AbortController ? new AbortController() : null;
  const t = ctl && setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: json ? 'application/json' : '*/*' }, signal: ctl?.signal, redirect: 'follow' });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, status: r.status, body: json ? await r.json() : await r.text() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message ?? e) };
  } finally { if (t) clearTimeout(t); }
}

/** HEAD-ish liveness probe for an apply URL. Used by the daily link check. */
export async function checkLink(url) {
  if (!url) return { alive: false, status: 0 };
  const r = await get(url, { timeout: 10000 });
  // Some ATS reject HEAD and bot UAs with 403 while the page is perfectly live,
  // so only a hard 404/410 counts as dead.
  const dead = r.status === 404 || r.status === 410;
  return { alive: !dead, status: r.status };
}

/**
 * Fetch the employer's own description where their board exposes one publicly.
 * Returns { description_html, description_source, canonical_url } or null.
 */
export async function fetchCanonical(applyUrl) {
  const ats = identifyAts(applyUrl);

  // Not a platform we have an API for. Most of our apply links are an
  // employer's own careers page, so this is the common case: try their
  // published structured data and take nothing if there is none.
  if (!ats) {
    try { return await fetchJsonLdDescription(applyUrl); } catch { return null; }
  }

  try {
    const u = new URL(applyUrl);

    if (ats === 'greenhouse') {
      // /<board>/jobs/<id>
      const m = u.pathname.match(/\/([^/]+)\/jobs\/(\d+)/);
      if (!m) return null;
      const r = await get(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`, { json: true });
      if (!r.ok || !r.body?.content) return null;
      return { description_html: r.body.content, description_source: 'greenhouse', canonical_url: r.body.absolute_url ?? applyUrl };
    }

    if (ats === 'lever') {
      // /<company>/<uuid>
      const m = u.pathname.match(/\/([^/]+)\/([0-9a-f-]{16,})/i);
      if (!m) return null;
      const r = await get(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}?mode=json`, { json: true });
      if (!r.ok || !r.body?.description) return null;
      return { description_html: r.body.descriptionPlain ? r.body.description : r.body.description, description_source: 'lever', canonical_url: r.body.hostedUrl ?? applyUrl };
    }

    if (ats === 'ashby') {
      const m = u.pathname.match(/\/([^/]+)\/([0-9a-f-]{16,})/i);
      if (!m) return null;
      const r = await get(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true`, { json: true });
      if (!r.ok || !Array.isArray(r.body?.jobs)) return null;
      const job = r.body.jobs.find((j) => j.id === m[2]);
      if (!job?.descriptionHtml) return null;
      return { description_html: job.descriptionHtml, description_source: 'ashby', canonical_url: job.jobUrl ?? applyUrl };
    }

    if (ats === 'workday') {
      const wd = await fetchWorkday(u);
      if (wd) return wd;
    }

    if (ats === 'smartrecruiters') {
      // /<company>/<id>-<slug>
      const m = u.pathname.match(/\/([^/]+)\/(\d{6,})/);
      if (m) {
        const r = await get(`https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${m[2]}`, { json: true });
        const s = r.body?.jobAd?.sections;
        const html = [s?.jobDescription?.text, s?.qualifications?.text, s?.additionalInformation?.text]
          .filter(Boolean).join('\n');
        if (r.ok && html) {
          return { description_html: html, description_source: 'smartrecruiters', canonical_url: r.body?.applyUrl ?? applyUrl };
        }
      }
    }

    if (ats === 'workable') {
      const m = u.pathname.match(/\/j\/([A-Z0-9]+)/i);
      const sub = u.hostname.split('.')[0];
      if (m && sub) {
        const r = await get(`https://apply.workable.com/api/v1/accounts/${sub}/jobs/${m[1]}`, { json: true });
        if (r.ok && r.body?.description) {
          return { description_html: r.body.description, description_source: 'workable', canonical_url: applyUrl };
        }
      }
    }

    // Known ATS but no public per-job endpoint we can rely on. Fall through to
    // the structured-data attempt below rather than giving up here.
    const ld = await fetchJsonLdDescription(applyUrl);
    if (ld) return { ...ld, description_source: `${ats}:jsonld` };
    return { description_html: null, description_source: ats, canonical_url: applyUrl };
  } catch {
    return null;
  }
}

/**
 * Workday career sites render in the browser, so fetching the page returns an
 * empty shell. Every one of them is backed by a JSON endpoint though:
 *
 *   public   https://{host}/{site}/job/{path}
 *   json     https://{host}/wday/cxs/{tenant}/{site}/job/{path}
 *
 * where the tenant is the first label of the hostname. Measured against 10 real
 * links from our own table this answers about a fifth of the time: several
 * tenants return 403 to anything that is not a browser, and several of our
 * apply links point at a search page rather than a specific job, which has no
 * description to fetch. Worth doing for the ones that work, not worth
 * pretending about for the ones that do not.
 */
async function fetchWorkday(u) {
  const tenant = u.hostname.split('.')[0];
  const parts = u.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('job');
  if (i < 1) return null;                 // a listing page, not a job page
  const site = parts[i - 1];
  const api = `https://${u.hostname}/wday/cxs/${tenant}/${site}/${parts.slice(i).join('/')}`;
  const r = await get(api, { json: true });
  const html = r.body?.jobPostingInfo?.jobDescription;
  if (!r.ok || !html) return null;
  return { description_html: html, description_source: 'workday', canonical_url: u.href };
}

/**
 * Last resort for a page we have no API for: read the employer's own
 * JobPosting structured data if they publish it.
 *
 * This is not scraping the page's prose. JSON-LD is markup a site emits
 * deliberately so that job boards and search engines can consume it, and the
 * description inside it is the employer's own text, published for exactly this
 * purpose. If it is absent we take nothing.
 *
 * Measured hit rate across 22 different employer hosts: 2. Most modern career
 * sites render client-side, so there is nothing in the HTML to read.
 */
async function fetchJsonLdDescription(applyUrl) {
  const r = await get(applyUrl, { json: false });
  if (!r.ok || typeof r.body !== 'string') return null;

  for (const block of r.body.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(block[1].trim()); } catch { continue; }
    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n['@graph'])) stack.push(...n['@graph']);
      const t = n['@type'];
      const isJob = t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
      if (isJob && n.description) {
        return { description_html: String(n.description), description_source: 'jsonld', canonical_url: applyUrl };
      }
    }
  }
  return null;
}
