// Resolves an apply URL to the employer's own listing.
//
// This is where a job gets upgraded from "an aggregator mentioned it" to
// "the employer publishes it". Where we can reach the employer's own public
// board API, we take their description from there — it is theirs, published
// for syndication, and it is the canonical text. Where we cannot, the record
// stays in needs_review with facts only and no description at all.

const UA = 'JoBmaniaBot/0.1 (+https://jobmania.example; job listing verification)';

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
  if (!ats) return null;

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

    // Known ATS but no public per-job endpoint we can rely on. We keep the
    // apply link and let the record stand on facts alone.
    return { description_html: null, description_source: ats, canonical_url: applyUrl };
  } catch {
    return null;
  }
}
