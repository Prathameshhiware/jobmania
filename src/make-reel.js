// Builds reels as MP4s, locally.
//
//   npm run reel                 today's pillar, one file
//   npm run reel walkins         a specific pillar
//   npm run reel walkins 2026-10-20
//   npm run reel week            the next seven days, one reel per day
//   npm run reel deliver         today's reel, uploaded and linked from the site
//
// Deliberately a local script and a devDependency, not part of the deployed
// site. Vercel Hobby cannot do this: a 60 second function ceiling and no
// ffmpeg. Encoding happens here, on a real machine, and the file is handed
// over to be posted by a person — which is necessary anyway, because Meta's
// publishing API accepts original audio only. The trending sound that
// actually carries a reel can only be added inside the Instagram app.
//
// The pipeline is pure JavaScript and WASM, with no system dependency:
//
//   satori   element tree -> SVG
//   resvg    SVG -> raw RGBA pixels   (not PNG; .pixels avoids a decode step)
//   h264     RGBA -> MP4
//
// Only one image is rasterised per card, not per frame. A held card re-submits
// the same pixel buffer, which the encoder turns into near-empty P-frames, and
// transitions are cross-faded by blending two buffers in JS. Rasterising all
// 900 frames would take about fifteen minutes; this takes a hundred seconds.

import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import HME from 'h264-mp4-encoder';
import { Resvg } from '@resvg/resvg-js';
import { planRotation, istWeekday, PILLAR_BY_WEEKDAY } from './lib/rotation.js';
import { pickSubject, record, allUsed, allRecent, daysSince, load as loadHistory } from './lib/reel-history.js';
import { slideSvg, STORY } from './lib/render.js';
import { reelFrames, reelCaption, subjectCount, NO_REEL } from './lib/reel.js';
import { zoomPan, outQuint, progress } from './lib/reel-motion.js';
import { faststart } from './lib/mp4-faststart.js';
import { istDate, istDatePlus, istLong } from './lib/ist.js';
import { db } from './lib/supabase.js';

// Public bucket, so the site and Instagram can both fetch what is in it.
const BUCKET = 'reels';

const FPS = 30;
const OUT_DIR = './.preview-cards/';
/*
 * Timing is derived, not allotted.
 *
 * STEP is how long one group of words is on screen before the next arrives.
 * READ is roughly how long a word takes to read, and sets the pause after a
 * card has finished appearing. A card therefore costs exactly what its own
 * text costs, and a reel is as long as the sum of its cards.
 *
 * The old way fixed the reel at thirty seconds and divided it up, which meant
 * a six word line revealed in half a second and then sat there for two and a
 * half. Short reels also loop, and a loop counts again.
 */
const STEP = 3;                          // frames per reveal step, 0.1s
const READ_PER_WORD = 0.17;              // seconds
const MIN_HOLD = 0.58;                   // seconds, after the text has landed
const MAX_HOLD = 1.70;                   // seconds

const PROGRESS_RGB = [173, 179, 247];   // --accent dark value: legible on both tones
const { width: W, height: H } = STORY;

// ---------------------------------------------------------------- the FAQs
// astro:content is unavailable outside the Astro runtime, so the frontmatter
// is parsed directly. Read once, not once per reel.
const KIND_SLUG = { blog: 'blogs', playbook: 'playbook', 'thought-leadership': 'thought-leadership' };
function loadFaqs() {
  const dir = './src/content/insights/';
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const fm = readFileSync(dir + file, 'utf8').split(/^---$/m)[1] ?? '';
    const title = (fm.match(/^title:\s*"?(.+?)"?\s*$/m) ?? [])[1] ?? file;
    const kind = (fm.match(/^kind:\s*(\S+)/m) ?? [])[1] ?? 'blog';
    const path = `/insights/${KIND_SLUG[kind] ?? 'blogs'}/${file.replace(/\.md$/, '')}`;
    const block = fm.split(/^faq:\s*$/m)[1];
    if (!block) continue;
    for (const m of block.matchAll(/^\s*-\s*q:\s*"?(.+?)"?\s*\n\s*a:\s*"?([\s\S]+?)"?\s*(?=\n\s*-\s*q:|\n\w|$)/gm)) {
      out.push({ q: m[1].trim(), a: m[2].trim().replace(/\s+/g, ' '), title, path });
    }
  }
  return out;
}

/**
 * One reel, start to finish.
 *
 * Returns what was built, or null when no pillar had material — which is a
 * real outcome on a quiet day and not an error. Nothing is invented to fill
 * the slot.
 */
/*
 * A card, with its text progressively revealed.
 *
 * Every state carries `fit`: the complete text, used only to choose the type
 * size. Without it the size is picked from whatever is revealed so far, so a
 * headline starts huge and shrinks as its own words arrive — the text jumping
 * size on every cut, which looks like a bug because it is one.
 *
 * Returns the states to cut between, ending with the whole thing. The main
 * line arrives a word or two at a time and the supporting line arrives after
 * it, which is the difference between text that lands and text that is merely
 * present.
 *
 * Capped at six states. Beyond that the renders cost more than the effect is
 * worth, and a line revealed in eight steps stops reading as emphasis and
 * starts reading as a stutter.
 */
const MAX_STATES = 6;

function revealSteps(text, max) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.length ? [words.join(' ')] : [];
  // Several words at a time once a line is long, so a sentence does not take
  // eight cuts to appear.
  const per = words.length > 7 ? 3 : words.length > 4 ? 2 : 1;
  const out = [];
  for (let i = per; i < words.length; i += per) out.push(words.slice(0, i).join(' '));
  out.push(words.join(' '));
  return out.slice(-max);
}

function revealStates(slide) {
  // A news card is a quotation with an attribution. Revealing someone else's
  // headline word by word would read as our own sentence being composed.
  if (slide.type === 'news' || slide.type === 'list' || slide.type === 'stat') return [slide];

  if (slide.type === 'qa') {
    const steps = revealSteps(slide.answer, MAX_STATES);
    return steps.length ? steps.map((answer) => ({ ...slide, answer, fit: slide.answer })) : [slide];
  }

  if (slide.type === 'cta') {
    // Title first, then the button. The link arriving last is the beat the
    // whole card exists for.
    const steps = revealSteps(slide.title, MAX_STATES - 1);
    return [...steps.map((title) => ({ ...slide, title, body: '', link: null, fit: slide.title })),
            { ...slide, fit: slide.title }];
  }

  // hero: the headline arrives, then the supporting line under it.
  const steps = revealSteps(slide.title, slide.sub ? MAX_STATES - 1 : MAX_STATES);
  const head = steps.map((title) => ({ ...slide, title, sub: '', fit: slide.title }));
  if (slide.sub) return [...head, { ...slide, fit: slide.title }];
  return head.length ? head : [slide];
}

async function buildReel({ now, faqs, force = null, quiet = false, avoid = [], pick = null, history = [] }) {
  let plan = await planRotation({ now, faqs, force });
  if (!plan) return null;

  /*
   * Do not post the same pillar two days running.
   *
   * The rotation already varies by weekday, but a pillar with no material
   * falls back — and the fallback order is fixed, so a quiet Monday and a
   * quiet Tuesday both land on walk-ins. Building a week in one go made that
   * visible: two walk-in reels inside three days.
   *
   * Re-planning with an explicit force skips past the repeat. If every
   * alternative is also empty we keep the repeat rather than post nothing,
   * because a duplicate subject beats a missing day.
   */
  /*
   * Walk-ins never become reels. A drive is over in a day and a reel keeps
   * being served for weeks, so the format outlives the thing it advertises.
   * They still lead the carousel, the site and the Saturday post.
   */
  const barred = (k) => NO_REEL.has(k) || avoid.includes(k);

  if (!force && barred(plan.kind)) {
    for (const alt of ['openings', 'closing', 'education', 'industry', 'sarkari', 'walkins']) {
      if (barred(alt) || alt === plan.kind) continue;
      const other = await planRotation({ now, faqs, force: alt });
      if (other && other.kind === alt) { plan = other; break; }
    }
  }

  /*
   * The subject is chosen after the pillar is settled, not before.
   *
   * Choosing it against the first plan and then re-planning around `avoid`
   * would index the new pillar's list with the old pillar's position — a
   * silent off-by-whatever that picks an unrelated job.
   */
  /*
   * When the well is dry, go to the news.
   *
   * The recycler never fails — it serves the oldest subject again — but a
   * pillar whose every subject went out in the last fortnight has nothing to
   * say that was not said recently. The news pool is six searches deep and
   * turns over daily, so it is the one source that is reliably new.
   *
   * Only when there is somewhere to go: if the news is also empty, the
   * recycled subject stands, because a repeat beats a missing day.
   */
  if (!force && plan.kind !== 'industry' && allRecent(plan, 14, history)) {
    const fresh = await planRotation({ now, faqs, force: 'industry' });
    if (fresh && !allRecent(fresh, 14, history)) {
      say('every subject used recently; switching to news' + String.fromCharCode(10));
      plan = fresh;
    }
  }

  const chosen = pick ?? pickSubject(plan, history);
  const cards = reelFrames(plan, { pick: chosen });
  const say = (s) => { if (!quiet) process.stdout.write(s); };

  const t0 = Date.now();

  /*
   * Each card is rasterised at several reveal states, not once.
   *
   * Sliding a finished picture around is why this still read as a slideshow:
   * the words themselves never moved. Rendering the card with its text
   * progressively revealed — a few words at a time — and cutting between
   * those states is what actually makes text arrive rather than sit there.
   *
   * It is affordable because the states are per card, not per frame. A dozen
   * cards at five states each is sixty renders, about a minute; a unique
   * render for all 900 frames would be a quarter of an hour.
   *
   *
   * Tone alternates, starting dark. Pale cards on a pale feed are what a thumb
   * slides past, and the closing card is forced dark so the call to action
   * lands hardest.
   */
  const WIDE = W;          // no overscan: nothing pans any more
  const shots = [];                     // { buffers: [...states], card }
  let renders = 0;
  for (let i = 0; i < cards.length; i++) {
    const tone = (i % 2 === 0 || i === cards.length - 1) ? 'dark' : 'light';
    const states = revealStates(cards[i].slide);
    const buffers = [];
    for (const state of states) {
      // total: 1 suppresses the "3 / 8" counter. That is a carousel
      // affordance — it tells a reader how far there is left to swipe — and
      // in a video nobody is swiping, so it is a number that raises a
      // question.
      const svg = await slideSvg(state, {
        kind: plan.kind, index: i, total: 1, url: plan.url, tone, reel: true,
        size: { width: WIDE, height: H },
      });
      buffers.push(new Resvg(svg, { fitTo: { mode: 'width', value: WIDE } }).render().pixels);
      renders++;
      say(`\r    rasterising card ${i + 1}/${cards.length}, ${renders} states`);
    }
    const words = String(
      states.at(-1).title ?? states.at(-1).answer ?? states.at(-1).question ?? ''
    ).trim().split(/\s+/).filter(Boolean).length;
    const revealF = (buffers.length - 1) * STEP;
    const holdS = Math.min(MAX_HOLD, Math.max(MIN_HOLD, words * READ_PER_WORD)) * cards[i].weight;
    const span = Math.max(STEP * 2, revealF + Math.round(holdS * FPS));

    shots.push({ buffers, card: cards[i], span });
  }

  const enc = await HME.createH264MP4Encoder();
  enc.width = W;
  enc.height = H;
  enc.frameRate = FPS;
  // Constant rate factor: lower is better quality and a bigger file. 22 keeps
  // fine text crisp, which matters when every frame is words.
  enc.quantizationParameter = 22;
  enc.initialize();

  /*
   * Hard cuts with a punch-in, not cross-fades.
   *
   * A dissolve between two text cards is the single most dated thing a video
   * can do — it says slideshow before a word is read, and it wastes a third of
   * a second of a two-second beat on mush. A hard cut plus a card that lands
   * slightly oversized and settles in a quarter of a second reads as
   * deliberate, and the deceleration is what makes it feel snappy rather than
   * floaty.
   *
   * Only these few frames per card are resampled. Doing it to all 900 would
   * add about ninety seconds a reel for motion nobody would notice.
   */
  const PUNCH_FRAMES = Math.round(0.22 * FPS);
  const PUNCH_SCALE = 1.1;
  const totalFrames = shots.reduce((a, sh) => a + sh.span, 0);

  // Reused across every frame. Allocating 8MB nine hundred times gives the
  // garbage collector more work than the encoder has.
  const frame = Buffer.allocUnsafe(W * H * 4);

  /*
   * There is no pan.
   *
   * A horizontal drift that reverses direction every card is a pendulum, and
   * it is the single most dated thing here: it says screensaver, it fights
   * the cuts, and it makes a two second beat feel like it is waiting for
   * something. All the movement now comes from the words arriving and from
   * each card landing slightly oversized and settling.
   */

  let written = 0;
  for (let i = 0; i < shots.length; i++) {
    const { buffers, span } = shots[i];

    // The reveal runs at the start of the beat; whatever is left is the hold
    // on the complete card. A card too short to reveal fully just shows the
    // last states it has room for.
    const reveal = buffers.length - 1;
    const first = buffers.length - 1 - reveal;

    for (let f = 0; f < span; f++) {
      const step = Math.min(buffers.length - 1, first + Math.floor(f / STEP));
      const src = buffers[step];

      // Each new word punches in. The scale is small and the easing is hard,
      // so it reads as the word landing rather than as the card zooming.
      const intoStep = f % STEP;
      const growing = f < reveal * STEP;

      if (f < PUNCH_FRAMES) {
        const k = outQuint((f + 1) / PUNCH_FRAMES);
        zoomPan(src, WIDE, H, W, H, 1 + (PUNCH_SCALE - 1) * (1 - k), 0, frame);
      } else if (growing && intoStep < 2) {
        const k = outQuint((intoStep + 1) / 2);
        zoomPan(src, WIDE, H, W, H, 1 + 0.03 * (1 - k), 0, frame);
      } else {
        src.copy(frame);
      }

      progress(frame, W, H, written / totalFrames, PROGRESS_RGB);
      enc.addFrameRgba(frame);
      written++;
    }
    say(`\r    encoding ${written} frames   `);
  }

  enc.finalize();
  const raw = Buffer.from(enc.FS.readFile(enc.outputFilename));
  enc.delete();

  /*
   * The encoder writes the index after the frames. A browser reading the file
   * from a URL never gets that far, so the player renders, shows 0:00 and
   * sits black — which is exactly what it did. This is what ffmpeg calls
   * faststart: the index moves to the front and every chunk offset in it is
   * corrected for having moved.
   */
  const mp4 = faststart(raw);

  mkdirSync(OUT_DIR, { recursive: true });
  const suffix = subjectCount(plan) > 1 ? `-${String(chosen + 1).padStart(2, '0')}` : '';
  const file = `${OUT_DIR}reel-${plan.today}-${plan.kind}${suffix}.mp4`;
  writeFileSync(file, mp4);
  say(`\r${' '.repeat(40)}\r`);

  return {
    file, plan, cards,
    pick: chosen,
    spans: shots.map((sh) => sh.span / FPS),
    bytes: mp4.length,
    seconds: written / FPS,
    ms: Date.now() - t0,
  };
}

const caption = (plan) => `${plan.caption}\n\n${plan.hashtags.map((h) => `#${h}`).join(' ')}`;

// ------------------------------------------------------------------- entry
const arg1 = process.argv[2] || null;
const arg2 = process.argv[3] || null;
const faqs = loadFaqs();

if (arg1 === 'deliver') {
  /*
   * Today's reel, uploaded to Supabase Storage and linked from the site.
   *
   * The project already has Supabase, the bucket is free and the phone page
   * at /social/today already exists — so this adds no service, no account and
   * no token to keep alive. Open the page on a phone, tap the video, post it.
   *
   * The caption goes up beside it, because a caption on a laptop is useless
   * when the posting happens on a phone, and a content table so what has gone
   * out and what is queued lives somewhere other than a terminal.
   */
  const now = new Date();
  const history = loadHistory();

  // Plan first, so the subject is chosen against what has already gone out
  // rather than by date arithmetic that cannot see the history.
  /*
   * Yesterday's pillar is avoided.
   *
   * The weekday rotation varies on its own, but a pillar with nothing to say
   * falls back, and the fallback order is fixed — so a run of quiet days all
   * land on the same place. A simulated week came out with three "closing"
   * reels inside five days, because the two days before it had both fallen
   * through to it.
   *
   * buildReel re-plans around anything named here, and walk-ins are barred
   * from reels regardless.
   */
  const yesterday = [...history].reverse().find((e) => e.pillar)?.pillar;
  const avoid = yesterday ? [yesterday] : [];

  const probe = await planRotation({ now, faqs });
  if (!probe) { console.error('No pillar had material today. Nothing delivered.'); process.exit(1); }

  const r = await buildReel({ now, faqs, avoid, history, quiet: false });
  if (!r) { console.error('Build failed. Nothing delivered.'); process.exit(1); }

  const pick = r.pick;
  const recycled = allUsed(r.plan, history);
  const since = daysSince(r.plan, pick, history);

  const stamp = `${r.plan.today}-${r.plan.kind}`;
  const put = async (path, body, contentType) => {
    const { error } = await db.storage.from(BUCKET).upload(path, body, {
      contentType, upsert: true, cacheControl: '3600',
    });
    if (error) throw new Error(`${path}: ${error.message}`);
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const videoUrl = await put(`${stamp}.mp4`, readFileSync(r.file), 'video/mp4');
  // reelCaption already opens with the hook, so the headline is not
  // prepended again — doing so printed it twice at the top of every caption.
  await put(`${stamp}.txt`, [
    reelCaption(r.plan, pick),
    '',
    '--',
    'Add a trending sound in the Instagram app before posting.',
    "Music cannot be attached by any API, including Meta's own.",
    '',
  ].join('\n'), 'text/plain; charset=utf-8');

  record(r.plan, pick, { file: `${stamp}.mp4` });

  // The content table, rebuilt each run from the history itself so it cannot
  // drift from what actually happened.
  const rows = loadHistory().slice(-30).reverse()
    .map((e) => `| ${e.date} | ${e.pillar} | ${String(e.headline).replace(/\|/g, '/').slice(0, 58)} | ${e.file ?? ''} |`);
  await put('CONTENT.md', [
    '# JoBmania reels',
    '',
    `Updated ${istLong(new Date())}. Newest first.`,
    '',
    '| Date | Pillar | Subject | File |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## How this is chosen',
    '',
    'One pillar per weekday: Monday openings, Tuesday government recruitment,',
    'Wednesday a job term, Thursday closing soon, Friday hiring news, Sunday the',
    'weekly roundup. Walk-ins are never made into reels — a drive is over in a',
    'day and a reel is served for weeks.',
    '',
    'Within a pillar the subject used longest ago is chosen, and never the same',
    'employer two days running. When every subject has been covered the oldest',
    'comes round again. The education slot has 36 glossary terms and 58 article',
    'questions, so it does not repeat for well over a year.',
    '',
    'Every figure comes from the live database or from a named publisher with a',
    'date. Nothing here is written by a generator.',
    '',
  ].join('\n'), 'text/markdown; charset=utf-8');

  console.log('\nUploaded');
  console.log(`  ${videoUrl}`);
  console.log(`  caption and CONTENT.md beside it`);
  console.log(`\n  pillar   ${r.plan.kind}${r.plan.scheduled !== r.plan.kind ? `  (fell back from ${r.plan.scheduled})` : ''}`);
  console.log(`  subject  ${pick + 1} of ${r.plan.subjects?.length ?? 1}` +
    (since === null ? '  — not covered before' : `  — last covered ${since} days ago`));
  if (recycled) console.log('  note     every subject in this pillar has been used; recycling the oldest');
  if (r.plan.needsHumanApproval) console.log('  note     flagged for review before posting');
  console.log('\nOpen jobmania.dpdns.org/social/today on your phone to get it.');
} else if (arg1 === 'week') {
  // One reel per day, each following the rotation rather than everything
  // bundled into a single video. Seven days is the whole cycle, so this is a
  // week of posts in one run.
  const days = Number(arg2) || 7;
  console.log(`Building ${days} reels, one per day, at ${FPS}fps.`);
  console.log('Each runs as long as its own content needs.\n');

  const made = [];
  for (let d = 0; d < days; d++) {
    const date = istDatePlus(d, new Date());
    const now = new Date(`${date}T09:00:00+05:30`);
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][istWeekday(now)];
    const scheduled = PILLAR_BY_WEEKDAY[istWeekday(now)];

    process.stdout.write(`  ${wd} ${date}  ${scheduled} …`);
    // Only the day before counts as a repeat. Over seven days every pillar
    // comes round once anyway, and avoiding all of them would force the last
    // days onto whatever is left rather than onto what is best.
    const r = await buildReel({ now, faqs, quiet: false, pick: d, history: [],
      avoid: made.slice(-1).map((x) => x.plan.kind) });
    if (!r) { console.log(`  ${wd} ${date}  no material, skipped`); continue; }

    const fell = r.plan.kind !== scheduled ? `  (fell back from ${scheduled})` : '';
    const hold = r.plan.needsHumanApproval ? '  [REVIEW BEFORE POSTING]' : '';
    console.log(`  ${wd} ${date}  ${r.plan.kind.padEnd(10)} ${(r.bytes / 1048576).toFixed(2)}MB  ${(r.ms / 1000).toFixed(0)}s${fell}${hold}`);
    console.log(`      ${r.plan.headline}`);
    made.push(r);
  }

  // A manifest, so the captions are in one place rather than scrolled past.
  const manifest = made.map((r) => ({
    date: r.plan.today,
    pillar: r.plan.kind,
    file: r.file.replace(OUT_DIR, ''),
    headline: r.plan.headline,
    needs_human_approval: Boolean(r.plan.needsHumanApproval),
    caption: caption(r.plan),
  }));
  writeFileSync(`${OUT_DIR}reels.json`, JSON.stringify(manifest, null, 2));

  console.log(`\n${made.length} reels in ${OUT_DIR}`);
  console.log(`Captions for all of them: ${OUT_DIR}reels.json`);
  const flagged = made.filter((r) => r.plan.needsHumanApproval);
  if (flagged.length) console.log(`\n${flagged.length} need checking before posting: ${flagged.map((r) => r.plan.kind).join(', ')}`);
  console.log('\nAdd a trending sound in the Instagram app. No API can attach licensed audio.');
} else {
  // Third argument is a date, or a number picking which subject to cover.
  const asNum = /^[0-9]+$/.test(String(arg2 ?? ""));
  const now = (arg2 && !asNum) ? new Date(`${arg2}T09:00:00+05:30`) : new Date();
  const r = await buildReel({ now, faqs, force: arg1, pick: asNum ? Number(arg2) : 0 });
  if (!r) { console.error('No pillar had material. Nothing to build.'); process.exit(1); }

  console.log(`${r.file}`);
  console.log(`  ${(r.bytes / 1048576).toFixed(2)} MB  ${W}x${H}  ${FPS}fps  ${r.seconds.toFixed(1)}s  silent`);
  console.log(`  built in ${(r.ms / 1000).toFixed(1)}s`);
  if (r.plan.needsHumanApproval) console.log('  NOTE: flagged for review before posting.');
  console.log('\nCards:');
  r.spans.forEach((sec, i) => console.log(`  ${String(sec.toFixed(1)).padStart(4)}s  ${r.cards[i].slide.type.padEnd(8)} ${String(r.cards[i].slide.title ?? r.cards[i].slide.question ?? '').slice(0, 52)}`));
  console.log('\nCaption:\n' + caption(r.plan).split('\n').map((l) => '  ' + l).join('\n'));
  console.log('\nAdd a trending sound in the Instagram app. No API can attach licensed audio.');
}
