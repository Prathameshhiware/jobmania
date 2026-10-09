// Builds the daily reel as an MP4, locally.
//
//   npm run reel              today's pillar
//   npm run reel walkins      a specific pillar
//   npm run reel walkins 2026-10-20
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
// 900 frames would take about fifteen minutes; this takes seconds.

import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import HME from 'h264-mp4-encoder';
import { planRotation } from './lib/rotation.js';
import { slideSvg, STORY } from './lib/render.js';
import { reelFrames, REEL_SECONDS } from './lib/reel.js';
import { Resvg } from '@resvg/resvg-js';

const FPS = 30;
const FADE = 0.34;                       // seconds of cross-fade between cards
const OUT_DIR = './.preview-cards/';

// ---------------------------------------------------------------- the plan
// Same FAQ reader the preview script uses: astro:content is unavailable
// outside the Astro runtime, so the frontmatter is parsed directly.
const KIND_SLUG = { blog: 'blogs', playbook: 'playbook', 'thought-leadership': 'thought-leadership' };
const dir = './src/content/insights/';
const faqs = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  const fm = readFileSync(dir + file, 'utf8').split(/^---$/m)[1] ?? '';
  const title = (fm.match(/^title:\s*"?(.+?)"?\s*$/m) ?? [])[1] ?? file;
  const kind = (fm.match(/^kind:\s*(\S+)/m) ?? [])[1] ?? 'blog';
  const path = `/insights/${KIND_SLUG[kind] ?? 'blogs'}/${file.replace(/\.md$/, '')}`;
  const block = fm.split(/^faq:\s*$/m)[1];
  if (!block) continue;
  for (const m of block.matchAll(/^\s*-\s*q:\s*"?(.+?)"?\s*\n\s*a:\s*"?([\s\S]+?)"?\s*(?=\n\s*-\s*q:|\n\w|$)/gm)) {
    faqs.push({ q: m[1].trim(), a: m[2].trim().replace(/\s+/g, ' '), title, path });
  }
}

const force = process.argv[2] || null;
const date = process.argv[3] || null;
const now = date ? new Date(`${date}T09:00:00+05:30`) : new Date();

const plan = await planRotation({ now, faqs, force });
if (!plan) { console.error('No pillar had material. Nothing to build.'); process.exit(1); }

const cards = reelFrames(plan);
console.log(`${plan.kind}: ${cards.length} cards, ${REEL_SECONDS}s at ${FPS}fps`);
if (plan.needsHumanApproval) console.log('  NOTE: this pillar is flagged for review before posting.');

// ------------------------------------------------------------- rasterising
const { width: W, height: H } = STORY;
const t0 = Date.now();
const buffers = [];
for (let i = 0; i < cards.length; i++) {
  // total: 1 suppresses the "3 / 8" counter. That is a carousel affordance —
  // it tells a reader how far there is left to swipe — and in a video nobody
  // is swiping, so it is just a number that raises a question.
  const svg = await slideSvg(cards[i].slide, {
    kind: plan.kind, index: i, total: 1, size: STORY, url: plan.url,
  });
  // .pixels is straight RGBA, so there is no PNG encode and decode in the middle.
  buffers.push(new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().pixels);
  process.stdout.write(`\r  rasterising ${i + 1}/${cards.length}`);
}
console.log(`\r  rasterised ${cards.length} cards in ${Date.now() - t0}ms   `);

// ---------------------------------------------------------------- encoding
const enc = await HME.createH264MP4Encoder();
enc.width = W;
enc.height = H;
enc.frameRate = FPS;
// Constant rate factor: lower is better quality and a bigger file. 22 keeps
// fine text crisp, which matters when every frame is words.
enc.quantizationParameter = 22;
enc.initialize();

/** Cross-fade two RGBA buffers. `k` is 0 at `a`, 1 at `b`. */
const blend = (a, b, k) => {
  const out = Buffer.allocUnsafe(a.length);
  const inv = 1 - k;
  for (let i = 0; i < a.length; i++) out[i] = (a[i] * inv + b[i] * k) | 0;
  return out;
};

const fadeFrames = Math.round(FADE * FPS);
let written = 0;

for (let i = 0; i < cards.length; i++) {
  const hold = Math.max(1, Math.round(cards[i].seconds * FPS) - (i < cards.length - 1 ? fadeFrames : 0));
  for (let f = 0; f < hold; f++) { enc.addFrameRgba(buffers[i]); written++; }

  if (i < cards.length - 1) {
    for (let f = 1; f <= fadeFrames; f++) {
      enc.addFrameRgba(blend(buffers[i], buffers[i + 1], f / (fadeFrames + 1)));
      written++;
    }
  }
  process.stdout.write(`\r  encoding ${written} frames`);
}

enc.finalize();
const mp4 = Buffer.from(enc.FS.readFile(enc.outputFilename));
enc.delete();

mkdirSync(OUT_DIR, { recursive: true });
const name = `${OUT_DIR}reel-${plan.today}-${plan.kind}.mp4`;
writeFileSync(name, mp4);

console.log(`\r  encoded ${written} frames (${(written / FPS).toFixed(1)}s)        `);
console.log(`\n${name}`);
console.log(`  ${(mp4.length / 1024 / 1024).toFixed(2)} MB  ${W}x${H}  ${FPS}fps  silent`);
console.log(`  total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('\nCards:');
cards.forEach((c, i) => console.log(`  ${String(c.seconds.toFixed(1)).padStart(4)}s  ${c.slide.type.padEnd(8)} ${String(c.slide.title ?? c.slide.question ?? '').slice(0, 52)}`));
console.log('\nCaption:\n' + plan.caption.split('\n').map((l) => '  ' + l).join('\n'));
console.log('\n  ' + plan.hashtags.map((h) => '#' + h).join(' '));
console.log('\nAdd a trending sound in the Instagram app. No API can attach licensed audio.');
