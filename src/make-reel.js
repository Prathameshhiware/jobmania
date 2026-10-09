// Builds reels as MP4s, locally.
//
//   npm run reel                 today's pillar, one file
//   npm run reel walkins         a specific pillar
//   npm run reel walkins 2026-10-20
//   npm run reel week            the next seven days, one reel per day
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
import { slideSvg, STORY } from './lib/render.js';
import { reelFrames, REEL_SECONDS, subjectCount } from './lib/reel.js';
import { OVERSCAN, pan, ease, blend, progress } from './lib/reel-motion.js';
import { istDate, istDatePlus } from './lib/ist.js';

const FPS = 30;
const FADE = 0.34;                       // seconds of cross-fade between cards
const OUT_DIR = './.preview-cards/';
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
async function buildReel({ now, faqs, force = null, quiet = false, avoid = [], pick = 0 }) {
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
  if (!force && avoid.includes(plan.kind)) {
    for (const alt of ['openings', 'closing', 'education', 'industry', 'sarkari', 'walkins']) {
      if (avoid.includes(alt) || alt === plan.kind) continue;
      const other = await planRotation({ now, faqs, force: alt });
      if (other && other.kind === alt) { plan = other; break; }
    }
  }

  const cards = reelFrames(plan, { pick });
  const say = (s) => { if (!quiet) process.stdout.write(s); };

  const t0 = Date.now();

  /*
   * Each card is rasterised once, OVERSCAN pixels wider than the frame, so a
   * 1080px window can slide across it afterwards. That is where the motion
   * comes from: every frame becomes a row copy rather than a fresh layout and
   * rasterise, which is four milliseconds instead of a thousand.
   *
   * Tone alternates, starting dark. Pale cards on a pale feed are what a thumb
   * slides past, and a hard cut between dark and light every couple of seconds
   * is most of what makes this read as a video rather than a slideshow. The
   * closing card is forced dark so the call to action lands hardest.
   */
  const WIDE = W + OVERSCAN;
  const buffers = [];
  for (let i = 0; i < cards.length; i++) {
    const tone = (i % 2 === 0 || i === cards.length - 1) ? 'dark' : 'light';
    // total: 1 suppresses the "3 / 8" counter. That is a carousel affordance —
    // it tells a reader how far there is left to swipe — and in a video nobody
    // is swiping, so it is just a number that raises a question.
    const svg = await slideSvg(cards[i].slide, {
      kind: plan.kind, index: i, total: 1, url: plan.url, tone, reel: true,
      size: { width: WIDE, height: H },
    });
    buffers.push(new Resvg(svg, { fitTo: { mode: 'width', value: WIDE } }).render().pixels);
    say(`\r    rasterising ${i + 1}/${cards.length}`);
  }

  const enc = await HME.createH264MP4Encoder();
  enc.width = W;
  enc.height = H;
  enc.frameRate = FPS;
  // Constant rate factor: lower is better quality and a bigger file. 22 keeps
  // fine text crisp, which matters when every frame is words.
  enc.quantizationParameter = 22;
  enc.initialize();

  const fadeFrames = Math.round(FADE * FPS);
  const totalFrames = cards.reduce((a, c) => a + Math.round(c.seconds * FPS), 0);

  // Reused across every frame. Allocating 8MB nine hundred times gives the
  // garbage collector more work than the encoder has.
  const frame = Buffer.allocUnsafe(W * H * 4);
  const next = Buffer.allocUnsafe(W * H * 4);
  const mixed = Buffer.allocUnsafe(W * H * 4);

  // Where the window sits on this card, 0 to 1 through its own duration.
  // Direction alternates so consecutive cards drift opposite ways, which
  // gives the cuts a rhythm instead of a conveyor belt.
  const offsetAt = (i, t) => {
    const travel = ease(Math.max(0, Math.min(1, t))) * OVERSCAN;
    return i % 2 === 0 ? travel : OVERSCAN - travel;
  };

  let written = 0;
  for (let i = 0; i < cards.length; i++) {
    const last = i === cards.length - 1;
    const span = Math.max(2, Math.round(cards[i].seconds * FPS));
    const hold = Math.max(1, span - (last ? 0 : fadeFrames));

    for (let f = 0; f < hold; f++) {
      pan(buffers[i], WIDE, W, H, offsetAt(i, f / (span - 1)), frame);
      progress(frame, W, H, written / totalFrames, PROGRESS_RGB);
      enc.addFrameRgba(frame);
      written++;
    }

    if (!last) {
      for (let f = 1; f <= fadeFrames; f++) {
        pan(buffers[i], WIDE, W, H, offsetAt(i, (hold + f) / (span - 1)), frame);
        pan(buffers[i + 1], WIDE, W, H, offsetAt(i + 1, 0), next);
        blend(frame, next, f / (fadeFrames + 1), mixed);
        progress(mixed, W, H, written / totalFrames, PROGRESS_RGB);
        enc.addFrameRgba(mixed);
        written++;
      }
    }
    say(`\r    encoding ${written} frames   `);
  }

  enc.finalize();
  const mp4 = Buffer.from(enc.FS.readFile(enc.outputFilename));
  enc.delete();

  mkdirSync(OUT_DIR, { recursive: true });
  const suffix = subjectCount(plan) > 1 ? `-${String(pick + 1).padStart(2, '0')}` : '';
  const file = `${OUT_DIR}reel-${plan.today}-${plan.kind}${suffix}.mp4`;
  writeFileSync(file, mp4);
  say(`\r${' '.repeat(40)}\r`);

  return {
    file, plan, cards,
    pick,
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

if (arg1 === 'week') {
  // One reel per day, each following the rotation rather than everything
  // bundled into a single video. Seven days is the whole cycle, so this is a
  // week of posts in one run.
  const days = Number(arg2) || 7;
  console.log(`Building ${days} reels, one per day, ${REEL_SECONDS}s each at ${FPS}fps\n`);

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
    const r = await buildReel({ now, faqs, quiet: false, pick: d,
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
  r.cards.forEach((c) => console.log(`  ${String(c.seconds.toFixed(1)).padStart(4)}s  ${c.slide.type.padEnd(8)} ${String(c.slide.title ?? c.slide.question ?? '').slice(0, 52)}`));
  console.log('\nCaption:\n' + caption(r.plan).split('\n').map((l) => '  ' + l).join('\n'));
  console.log('\nAdd a trending sound in the Instagram app. No API can attach licensed audio.');
}
