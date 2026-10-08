// Slide plan in, PNG out.
//
// satori lays the card out and produces SVG; resvg rasterises it. That is the
// same pair @vercel/og uses internally. We call them directly because
// @vercel/og could not be made to run here: imported as ESM it fails with
// "Dynamic require of fs is not supported", and through createRequire it
// cannot find itself. It is built for Next.js's bundler, not for Astro.
//
// Fonts are read from disk once and held for the life of the process. On
// Vercel that means once per warm function, which matters: a carousel is
// several cards and re-reading 320KB of fonts per card would dominate the
// render time.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { card, SQUARE, STORY } from './cards.js';
import {
  Sora_Regular, Sora_Bold,
  SchibstedGrotesk_Regular, SchibstedGrotesk_Bold,
} from '../fonts/fonts.generated.js';

export { SQUARE, STORY };

/*
 * Fonts arrive as base64 in a generated module rather than being read off
 * disk, because reading them off disk does not survive deployment: the server
 * bundle is rolled into one file at a different depth, so an import.meta.url
 * path resolves to nothing, and the .ttf files are never copied into the
 * function in the first place. A local build proved it — the bundle contained
 * no .ttf at all, and the route would have thrown on its first real request.
 *
 * They are static instances cut from the variable originals with fonttools.
 * Satori's font parser throws on a variable font's fvar table, which is
 * documented nowhere obvious.
 *
 * See scripts/inline-fonts.mjs, which npm runs before every build.
 */
const FONTS = [
  { name: 'Sora', data: Sora_Regular, weight: 400, style: 'normal' },
  { name: 'Sora', data: Sora_Bold, weight: 700, style: 'normal' },
  { name: 'Grotesk', data: SchibstedGrotesk_Regular, weight: 400, style: 'normal' },
  { name: 'Grotesk', data: SchibstedGrotesk_Bold, weight: 700, style: 'normal' },
];
const loadFonts = () => FONTS;

/** One slide as SVG. */
export async function slideSvg(slide, opts = {}) {
  const size = opts.size ?? SQUARE;
  return satori(card(slide, { ...opts, size }), {
    width: size.width,
    height: size.height,
    fonts: loadFonts(),
  });
}

/** One slide as a PNG buffer. */
export async function slidePng(slide, opts = {}) {
  const size = opts.size ?? SQUARE;
  const svg = await slideSvg(slide, opts);
  return new Resvg(svg, { fitTo: { mode: 'width', value: size.width } }).render().asPng();
}

/**
 * Every slide of a plan, rendered.
 *
 * Sequential on purpose. Rendering four cards at once on a 1-vCPU Vercel
 * function contends for the same core and finishes no sooner, while making
 * peak memory four times larger on a runtime that kills the process for it.
 */
export async function planPngs(plan, { size = SQUARE } = {}) {
  const total = plan.slides.length;
  const out = [];
  for (let i = 0; i < total; i++) {
    out.push(await slidePng(plan.slides[i], {
      kind: plan.kind, index: i, total, size, url: plan.url,
    }));
  }
  return out;
}
