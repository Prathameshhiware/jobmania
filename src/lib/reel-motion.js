// Motion, without rasterising every frame.
//
// A reel of static cards reads as a slideshow and gets scrolled past. Real
// motion normally means laying out and rasterising all 900 frames, which at
// about a second each is fifteen minutes per reel.
//
// So the card is rendered once, wider than the frame, and a 1080px window
// slides across it. Every frame is then a row-wise memory copy rather than a
// layout and a rasterise: about four milliseconds instead of a thousand.
//
// Horizontal rather than vertical, deliberately. Panning vertically would
// carry the footer and the wordmark off the bottom of the frame for most of
// the card; panning sideways keeps the full height visible the whole time and
// only shifts things a few per cent across, which reads as a slow drift.

/** How much wider than the frame a card is rendered, in pixels. */
export const OVERSCAN = 120;

/**
 * Crop a `w`x`h` window out of an oversized RGBA buffer at horizontal offset
 * `dx`, writing into `out`.
 *
 * Reuses the output buffer across frames. Allocating 8MB per frame 900 times
 * gives the garbage collector more work than the encoder.
 */
export function pan(src, srcW, w, h, dx, out) {
  const rowBytes = w * 4;
  const srcRow = srcW * 4;
  const x = Math.max(0, Math.min(srcW - w, Math.round(dx))) * 4;
  for (let y = 0; y < h; y++) {
    src.copy(out, y * rowBytes, y * srcRow + x, y * srcRow + x + rowBytes);
  }
  return out;
}

/**
 * Ease in and out, so a card drifts rather than starting and stopping dead.
 *
 * Linear motion across a cut looks mechanical; this is the standard smoothstep
 * and costs nothing.
 */
export const ease = (t) => t * t * (3 - 2 * t);

/** Cross-fade two equally sized RGBA buffers into `out`. */
export function blend(a, b, k, out) {
  const inv = 1 - k;
  for (let i = 0; i < a.length; i++) out[i] = (a[i] * inv + b[i] * k) | 0;
  return out;
}

/**
 * A progress bar along the bottom edge.
 *
 * Small thing, real effect: a viewer who can see how much is left is more
 * likely to stay to the end, and a reel that is watched to the end is shown to
 * more people. Drawn straight into the frame buffer, which is far cheaper than
 * laying it out as part of the card.
 */
export function progress(buf, w, h, fraction, rgb, thickness = 8) {
  const done = Math.max(0, Math.min(w, Math.round(w * fraction)));
  const [r, g, b] = rgb;
  for (let y = h - thickness; y < h; y++) {
    let i = (y * w) * 4;
    for (let x = 0; x < w; x++, i += 4) {
      if (x < done) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; }
      else {
        // Unfilled track: darken whatever is behind it rather than painting a
        // flat colour, so it sits on both the light and the dark cards.
        buf[i] = (buf[i] * 0.78) | 0;
        buf[i + 1] = (buf[i + 1] * 0.78) | 0;
        buf[i + 2] = (buf[i + 2] * 0.78) | 0;
      }
    }
  }
  return buf;
}
