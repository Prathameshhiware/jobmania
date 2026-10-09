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

const FILE = './.reel-history.json';

/** Everything recorded so far, oldest first. Never throws. */
export function load() {
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'));
    return Array.isArray(raw?.entries) ? raw.entries : [];
  } catch {
    return [];
  }
}

function save(entries) {
  // Trimmed, because the only question ever asked is "how long since this
  // one", and an answer older than a few hundred reels cannot change it.
  const keep = entries.slice(-400);
  writeFileSync(FILE, JSON.stringify({ entries: keep }, null, 2));
}

/**
 * A stable identifier for whatever a reel was about.
 *
 * Has to survive the row being re-read tomorrow, so it is the employer's own
 * slug or the headline rather than an array position.
 */
export function subjectKey(plan, pick = 0) {
  if (plan.kind === 'roundup') return `roundup:${plan.today}`;
  if (plan.subject) {
    const s = plan.subject;
    return `${plan.kind}:${String(s.title ?? s.body ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70)}`;
  }
  if (plan.subjects?.length) {
    const j = plan.subjects[pick % plan.subjects.length];
    return `${plan.kind}:${j.slug ?? `${j.company_name}-${j.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70)}`;
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
export function pickSubject(plan, entries = load()) {
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

/** True when every subject in this plan has been covered before. */
export function allUsed(plan, entries = load()) {
  const n = plan.subjects?.length ?? 0;
  if (!n) return false;
  const seen = new Set(entries.map((e) => e.key));
  for (let i = 0; i < n; i++) if (!seen.has(keyAt(plan, i))) return false;
  return true;
}

/** Note that a reel was made, so the next run avoids repeating it. */
export function record(plan, pick, { file } = {}) {
  const entries = load();
  entries.push({
    key: subjectKey(plan, pick),
    company: companyAt(plan, pick) || null,
    pillar: plan.kind,
    date: plan.today,
    headline: plan.headline,
    file: file ?? null,
    at: new Date().toISOString(),
  });
  save(entries);
  return entries;
}

/** How many days since this exact subject last went out, or null. */
export function daysSince(plan, pick = 0, entries = load()) {
  const key = subjectKey(plan, pick);
  const hit = [...entries].reverse().find((e) => e.key === key);
  if (!hit) return null;
  return Math.round((Date.now() - Date.parse(hit.at)) / 864e5);
}
