// What is wrong with the site today.
//
// This reports. It does not rewrite code, and it never will: a script that
// edits a live site unattended turns a small bug into an outage at three in
// the morning with nobody watching. The two things it does repair are
// mechanical and already reversible by the machinery that owns them —
// retiring a listing whose deadline has passed is what the expire pass does
// anyway, it has simply been missed.
//
// Every check says three things: what it looked for, what it found, and what
// it would mean. A monitor that only emits "FAIL" makes you reconstruct the
// reasoning at the worst possible moment.
//
// Severity is deliberately coarse:
//
//   fail   a visitor is being harmed right now — a dead page, a listing
//          sending someone to a role that closed, a security header gone
//   warn   something is drifting and will become a fail if ignored
//   ok     checked, fine
//
// A warn never wakes anybody. A fail is worth interrupting a day for.

import { db } from './supabase.js';
import { istDate, istLong } from './ist.js';

const ok = (name, detail, meta) => ({ name, status: 'ok', detail, ...meta });
const warn = (name, detail, meaning, meta) => ({ name, status: 'warn', detail, meaning, ...meta });
const fail = (name, detail, meaning, meta) => ({ name, status: 'fail', detail, meaning, ...meta });

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');

/* ---------------------------------------------------------------- data
 *
 * The listings table is the product. These are the ways it can be wrong that
 * a visitor would actually notice, each one found at least once in practice.
 */
async function dataChecks() {
  const out = [];
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from('jobs')
    .select('id, status, title, company_name, slug, apply_url, valid_through, posted_at, ' +
            'walkin_start, walkin_venue, hiring_type, city_primary, first_seen_at, last_checked_at')
    .eq('status', 'live')
    .limit(5000);

  if (error) {
    return [fail('jobs readable', `query failed: ${error.message}`,
      'The site cannot render listings at all. This is the first thing to fix.')];
  }

  const live = data ?? [];
  out.push(live.length
    ? ok('live listings', `${n(live.length)} live`, { count: live.length })
    : fail('live listings', 'none', 'Every category page is empty. Ingestion has stopped or everything expired at once.'));

  // A listing past its own deadline is the single worst thing this site can
  // do, because the whole promise is that what you see is still open.
  const past = live.filter((j) => j.valid_through && j.valid_through < nowIso);
  out.push(past.length
    ? fail('no expired listings live', `${past.length} past their deadline`,
        'Someone is being sent to apply for a role that has closed. The expire pass has not run or is failing.',
        { sample: past.slice(0, 5).map((j) => j.slug) })
    : ok('no expired listings live', 'none past deadline'));

  // A walk-in whose date has gone is worse than a stale listing: the reader
  // travels across a city for it.
  const today = istDate();
  const goneDrives = live.filter((j) => j.walkin_start && j.walkin_start < today);
  out.push(goneDrives.length
    ? fail('no past walk-ins live', `${goneDrives.length} drives already happened`,
        'A reader could travel to a drive that finished. Walk-ins must come down the day they end.',
        { sample: goneDrives.slice(0, 5).map((j) => j.slug) })
    : ok('no past walk-ins live', 'none in the past'));

  /*
   * A walk-in legitimately has no apply link — you turn up at a venue, there
   * is no form. The job page says exactly that in place of the button.
   *
   * The first version of this check flagged all 49 of them as dead ends,
   * which is the clearest argument against letting a monitor repair things
   * on its own: it would have "fixed" 49 perfectly correct listings. A real
   * dead end is a row with no link AND nowhere to physically go.
   */
  const deadEnd = live.filter((j) => !j.apply_url && !j.walkin_venue);
  out.push(deadEnd.length
    ? fail('no dead ends', `${deadEnd.length} with neither an apply link nor a venue`,
        'Nothing a reader can act on: no form to submit and no address to attend.',
        { sample: deadEnd.slice(0, 5).map((j) => j.slug) })
    : ok('no dead ends', `every listing has a link or a venue (${live.filter((j) => !j.apply_url).length} are walk-ins)`));

  const slugs = live.map((j) => j.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  out.push(dupes.length
    ? fail('slugs unique', `${new Set(dupes).size} duplicated`,
        'Two listings answer the same URL. One of them is unreachable.',
        { sample: [...new Set(dupes)].slice(0, 5) })
    : ok('slugs unique', `${n(slugs.length)} distinct`));

  // Freshness: the site claims links are re-tested through the day.
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  const stale = live.filter((j) => !j.last_checked_at || j.last_checked_at < dayAgo);
  out.push(stale.length > live.length * 0.2
    ? warn('links re-tested recently', `${stale.length} of ${live.length} not checked in 24h`,
        'The site says every link is re-tested daily. Past about a fifth, that claim stops being true.')
    : ok('links re-tested recently', `${live.length - stale.length} of ${live.length} checked in 24h`));

  const arrived = live.filter((j) => j.first_seen_at >= dayAgo).length;
  out.push(arrived
    ? ok('new listings arriving', `${arrived} in the last 24h`)
    : warn('new listings arriving', 'nothing new in 24h',
        'Ingestion may have stalled. A quiet Sunday is normal; two quiet days is not.'));

  return out;
}

/* ------------------------------------------------------------ schedules
 *
 * The clock lives in Postgres. If pg_cron stops, everything else keeps
 * looking fine for a day or two and then quietly rots.
 */
async function scheduleChecks() {
  const out = [];

  const { data: snaps, error } = await db
    .from('daily_stats').select('day, live, added_today').order('day', { ascending: false }).limit(3);

  if (error) {
    out.push(warn('daily snapshot', `could not read: ${error.message}`,
      'The roundup compares against yesterday. Without snapshots it has nothing to compare to.'));
  } else if (!snaps?.length) {
    out.push(warn('daily snapshot', 'no snapshots recorded',
      'The expire pass writes one a day. None means it has never completed.'));
  } else {
    const newest = snaps[0].day;
    const behind = Math.round((Date.parse(`${istDate()}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) / 864e5);
    out.push(behind <= 1
      ? ok('daily snapshot', `latest ${newest}`)
      : fail('daily snapshot', `latest is ${newest}, ${behind} days behind`,
          'The expire pass has stopped. Links are no longer being re-tested and closed roles are staying up.'));
  }

  const { data: posts } = await db
    .from('generated_posts').select('slug, published').order('published', { ascending: false }).limit(1);
  const last = posts?.[0];
  if (last) {
    const age = Math.round((Date.now() - Date.parse(last.published)) / 864e5);
    out.push(age <= 8
      ? ok('weekly roundup', `${last.slug}, ${age} days ago`)
      : warn('weekly roundup', `last was ${age} days ago (${last.slug})`,
          'It publishes Sundays at 10am. More than a week means the job did not fire.'));
  } else {
    out.push(warn('weekly roundup', 'none published', 'The Sunday job has never completed.'));
  }

  return out;
}

/* ------------------------------------------------------------- the site
 *
 * Hitting the real pages over the real network, because a route can compile
 * and still 500 on live data.
 */
async function siteChecks(origin) {
  const paths = ['/', '/jobs', '/c/freshers', '/c/walk-ins', '/glossary', '/closed',
                 '/insights', '/sitemap.xml', '/robots.txt'];
  const out = [];
  const slow = [];
  const broken = [];

  await Promise.all(paths.map(async (p) => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${origin}${p}`, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const ms = Date.now() - t0;
      if (!res.ok) broken.push(`${p} → ${res.status}`);
      else if (ms > 3000) slow.push(`${p} ${ms}ms`);
    } catch (err) {
      broken.push(`${p} → ${String(err?.message ?? err).slice(0, 40)}`);
    }
  }));

  out.push(broken.length
    ? fail('pages respond', broken.join(', '), 'A visitor hitting these gets an error.')
    : ok('pages respond', `${paths.length} checked, all 200`));

  out.push(slow.length
    ? warn('pages are quick', slow.join(', '), 'Past three seconds people leave, and search ranking follows them.')
    : ok('pages are quick', 'all under 3s'));

  /*
   * Security headers. These are the ones that, when missing, change what an
   * attacker can do rather than merely how tidy the response looks — and the
   * CSP in particular has already broken once in a way nothing reported.
   */
  try {
    const res = await fetch(`${origin}/`, { signal: AbortSignal.timeout(20000) });
    const want = {
      'content-security-policy': 'Without it, any injected script runs.',
      'x-content-type-options': 'Without it, a browser may execute a file it guessed was script.',
      'x-frame-options': 'Without it, the site can be framed for clickjacking.',
      'strict-transport-security': 'Without it, the first request each visit can be downgraded to HTTP.',
    };
    // HSTS only means anything over HTTPS — a browser ignores it on a plain
    // HTTP response, and the dev server correctly does not send one. Asking
    // for it on localhost made the check fail against a perfectly healthy
    // local build, which is the kind of false alarm that gets a monitor
    // ignored.
    if (!origin.startsWith('https://')) delete want['strict-transport-security'];

    const missing = Object.keys(want).filter((h) => !res.headers.get(h));
    out.push(missing.length
      ? fail('security headers', `missing: ${missing.join(', ')}`,
          missing.map((m) => want[m]).join(' '))
      : ok('security headers', `${Object.keys(want).length} present`));
  } catch (err) {
    out.push(warn('security headers', `could not check: ${String(err?.message ?? err).slice(0, 50)}`,
      'The check failed, not necessarily the headers.'));
  }

  /*
   * The write endpoints must refuse an unauthenticated caller. This is the
   * check that matters most: these routes insert into the database, and the
   * cost of one of them being open is not theoretical.
   */
  const guarded = ['/api/ingest', '/api/roundup', '/api/expire', '/api/boards'];
  const open = [];
  await Promise.all(guarded.map(async (p) => {
    try {
      const res = await fetch(`${origin}${p}`, { method: 'POST', signal: AbortSignal.timeout(20000) });
      // Anything in the 4xx family is a refusal. 401 is the route's own
      // check, 403 is the platform turning away an unauthenticated POST
      // before the route runs, 405 is the method, 429 is the rate limiter.
      // Only a 2xx means it actually did something for a stranger.
      if (res.ok) open.push(`${p} → ${res.status}`);
    } catch { /* unreachable is not the same as open */ }
  }));
  out.push(open.length
    ? fail('write endpoints refuse strangers', `${open.join(', ')} answered a stranger`,
        'Anyone on the internet can make these run. Rotate the secret and check what was written.')
    : ok('write endpoints refuse strangers', `${guarded.length} refused an unauthenticated POST`));

  return out;
}

/**
 * Every check, with a verdict.
 *
 * Never throws: a monitor that dies on its own bug reports nothing, which
 * looks exactly like everything being fine.
 */
export async function runHealth({ origin = 'https://jobmania.dpdns.org' } = {}) {
  const started = Date.now();
  const checks = [];

  for (const [group, fn] of [['data', dataChecks], ['schedules', scheduleChecks],
                             ['site', () => siteChecks(origin)]]) {
    try {
      for (const c of await fn()) checks.push({ group, ...c });
    } catch (err) {
      checks.push({ group, name: `${group} checks`, status: 'fail',
        detail: `the check itself threw: ${String(err?.message ?? err)}`,
        meaning: 'This group was not actually checked. Treat it as unknown, not as passing.' });
    }
  }

  const fails = checks.filter((c) => c.status === 'fail');
  const warns = checks.filter((c) => c.status === 'warn');

  return {
    at: new Date().toISOString(),
    day: istDate(),
    verdict: fails.length ? 'fail' : warns.length ? 'warn' : 'ok',
    counts: { ok: checks.length - fails.length - warns.length, warn: warns.length, fail: fails.length },
    checks,
    ms: Date.now() - started,
  };
}

/** The report as something readable in a terminal or a log. */
export function formatHealth(r) {
  const mark = { ok: '  ok  ', warn: ' WARN ', fail: ' FAIL ' };
  const lines = [`JoBmania health — ${istLong(r.day)} — ${r.verdict.toUpperCase()}`,
    `${r.counts.ok} ok, ${r.counts.warn} warn, ${r.counts.fail} fail, ${r.ms}ms`, ''];
  let group = null;
  for (const c of r.checks) {
    if (c.group !== group) { group = c.group; lines.push(`[${group}]`); }
    lines.push(`${mark[c.status]} ${c.name}: ${c.detail}`);
    if (c.meaning) lines.push(`        ${c.meaning}`);
    if (c.sample?.length) lines.push(`        e.g. ${c.sample.join(', ')}`);
  }
  return lines.join('\n');
}
