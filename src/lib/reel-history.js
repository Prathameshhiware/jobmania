// What has already been made into a reel.
//
// Without this the subject is picked by date arithmetic, which is
// reproducible but blind: it will happily cover the same opening twice in a
// fortnight while a dozen others are never touched, because it does not know
// what it has already done.
//
// So every reel records what it was about, and the next one prefers a subject
// that has not been used. When everything has been used — which is the normal
// state for a pillar with five live subjects and a weekly slot — it takes the
// one used longest ago. Content running out is not a failure here, it is
// Tuesday; the only thing that matters is that the same thing does not come
// round while something fresher is waiting.
//
// Explanatory content is the exception that needs no exception. There are 36
// glossary terms and 58 article questions, so the education slot has over a
// year and a half before it repeats anything at all.
//
// A plain JSON file rather than a table: this runs on one machine, next to
// the script, and a migration for a list of strings would be ceremony.

import { readFileSync, writeFileSync } from 'node:fs';
import { db } from './supabase.js';

const FILE = './.reel-history.json';
const BUCKET = 'reels';
const REMOTE = 'history.json';

/*
 * The history lives next to the reels, not on the machine that made them.
 *
 * It started as a local file, which was fine while one laptop built
 * everything. The moment this runs anywhere else — a CI runner, a server, a
 * second machine — a local file means every run starts with no memory, so
 * pickSubject returns 0 every time and the same subject goes out forever
 * while the rotation looks like it is working.
 *
 * Storage is the single source of truth. The local file is kept as a mirror,
 * used only when storage cannot be reached, so a build still runs offline
 * rather than silently losing its place.
 */

/** Everything recorded so far, oldest first. Never throws. */
export async function load() {
  try {
    const url = db.storage.from(BUCKET).getPublicUrl(REMOTE).data.publicUrl;
    const res = await fetch(`${url}?t=${Date.now()}`);   // defeat the CDN cache
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw?.entries)) return raw.entries;
    }
  } catch { /* fall through to the local mirror */ }

  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'));
    return Array.isArray(raw?.entries) ? raw.entries : [];
  } catch {
    return [];
  }
}

async function save(entries) {
  // Trimmed, because the only question ever asked is "how long since this
  // one", and an answer older than a few hundred reels cannot change it.
  const body = JSON.stringify({ entries: entries.slice(-400) }, null, 2);

  try {
    const { error } = await db.storage.from(BUCKET).upload(REMOTE, body, {
      contentType: 'application/json', upsert: true, cacheControl: '0',
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('history: could not write to storage —', err?.message ?? err);
  }

  try { writeFileSync(FILE, body); } catch { /* mirror is best-effort */ }
}

/**
 * A stable identifier for whatever a reel was about.
 *
 * Has to survive the row being re-read tomorrow, so it is the employer's own
 * slug or the headline rather than an array position.
 */
export function subjectKey(plan, pick = 0) {
  if (plan.kind === 'roundup') return `roundup:${plan.today}`;

  const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70);

  /*
   * The list is checked before the single subject, not after.
   *
   * A pillar can carry both: the news pillar sets `subject` to the lead story
   * for the carousel and `subjects` to the whole pool for reels. Reading
   * `subject` first returned the lead story's key whatever the pick was, so
   * every news reel looked already-used after the first one.
   */
  if (plan.subjects?.length) {
    const j = plan.subjects[pick % plan.subjects.length];
    // A job row has a slug; a news story has a headline and a publisher.
    return `${plan.kind}:${slug(j.slug ?? (j.company_name ? `${j.company_name}-${j.title}` : `${j.source}-${j.title}`))}`;
  }
  if (plan.subject) {
    const s = plan.subject;
    return `${plan.kind}:${slug(s.title ?? s.body ?? '')}`;
  }
  // education and anything else single-shot: the headline identifies it.
  return `${plan.kind}:${String(plan.headline).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70)}`;
}

/** The key for subject `i` of a plan, without committing to it. */
const keyAt = (plan, i) => subjectKey(plan, i);

/** The employer behind subject `i`, where there is one. */
const companyAt = (plan, i) =>
  String(plan.subjects?.[i]?.company_name ?? '').toLowerCase().trim();

/**
 * Which subject to cover: the one not used for longest, or never used.
 *
 * Returns an index into plan.subjects, or 0 for a pillar that only ever has
 * one subject.
 */
export function pickSubject(plan, entries = []) {
  const n = plan.subjects?.length ?? 0;
  if (n <= 1) return 0;

  const lastUsed = new Map();
  entries.forEach((e, order) => lastUsed.set(e.key, order));

  /*
   * One employer should not carry three days running.
   *
   * Least-recently-used alone walked straight down the list, and because a
   * company with several openings sits together in it, a simulated week came
   * out as Twilio, Twilio, Twilio, Elastic. Different roles, but it reads as
   * the same post three times.
   *
   * So a subject from the employer that went out last is pushed behind every
   * other candidate. It still wins if it is the only thing left, which is the
   * right answer for a pillar with one employer in it.
   */
  const recent = [...entries].reverse().find((e) => e.company);
  const lastCompany = recent?.company ?? '';
  const PENALTY = 1e6;

  let best = 0;
  let bestRank = Infinity;
  for (let i = 0; i < n; i++) {
    // Never used sorts before everything; otherwise, older sorts first.
    const used = lastUsed.has(keyAt(plan, i)) ? lastUsed.get(keyAt(plan, i)) : -1;
    const sameCo = lastCompany && companyAt(plan, i) === lastCompany;
    const rank = used + (sameCo ? PENALTY : 0);
    if (rank < bestRank) { bestRank = rank; best = i; }
  }
  return best;
}

/**
 * True when every subject in this plan was covered within `days`.
 *
 * Distinct from allUsed: a pillar whose twelve openings were all covered
 * three months ago is fine to come round again, while one whose subjects all
 * went out last week is stale even though the recycler would happily serve
 * the oldest. This is the test for "reach for something fresher instead".
 */
export function allRecent(plan, days = 14, entries = []) {
  const n = plan.subjects?.length ?? 0;
  if (!n) return false;
  const cutoff = Date.now() - days * 864e5;
  const recent = new Set(
    entries.filter((e) => Date.parse(e.at) >= cutoff).map((e) => e.key),
  );
  for (let i = 0; i < n; i++) if (!recent.has(keyAt(plan, i))) return false;
  return true;
}

/** True when every subject in this plan has been covered before. */
export function allUsed(plan, entries = []) {
  const n = plan.subjects?.length ?? 0;
  if (!n) return false;
  const seen = new Set(entries.map((e) => e.key));
  for (let i = 0; i < n; i++) if (!seen.has(keyAt(plan, i))) return false;
  return true;
}

/** Note that a reel was made, so the next run avoids repeating it. */
export async function record(plan, pick, { file, entries = null } = {}) {
  const current = entries ?? (await load());
  current.push({
    key: subjectKey(plan, pick),
    company: companyAt(plan, pick) || null,
    pillar: plan.kind,
    date: plan.today,
    headline: plan.headline,
    file: file ?? null,
    at: new Date().toISOString(),
  });
  await save(current);
  return current;
}

/** How many days since this exact subject last went out, or null. */
export function daysSince(plan, pick = 0, entries = []) {
  const key = subjectKey(plan, pick);
  const hit = [...entries].reverse().find((e) => e.key === key);
  if (!hit) return null;
  return Math.round((Date.now() - Date.parse(hit.at)) / 864e5);
}
