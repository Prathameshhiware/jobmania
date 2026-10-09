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

/**
 * Hard deceleration. Fast at the start, almost stopped at the end.
 *
 * This is what makes an entrance feel snappy rather than floaty: the card
 * arrives nearly instantly and then settles. A smoothstep entrance eases in as
 * well as out, which reads as slow no matter how short you make it.
 */
export const outQuint = (t) => 1 - Math.pow(1 - t, 5);

/**
 * Crop with a zoom, sampling bilinearly. `scale` of 1 is the plain window;
 * above 1 is zoomed in, about the centre of the window.
 *
 * Used only for the handful of frames at each cut, where the card punches
 * down from slightly oversized to its resting position. Running this on all
 * 900 frames would add about a minute and a half a reel for motion nobody
 * would notice; running it on eight frames per card costs nothing and is the
 * whole difference between a cut that lands and a dissolve that drifts.
 */
export function zoomPan(src, srcW, srcH, w, h, scale, dx, out) {
  if (scale === 1) return pan(src, srcW, w, h, dx, out);

  const ox = Math.max(0, Math.min(srcW - w, Math.round(dx)));
  const cx = w / 2;
  const cy = h / 2;
  const inv = 1 / scale;

  for (let y = 0; y < h; y++) {
    // Source row for this output row, clamped inside the buffer.
    const sy = Math.min(srcH - 1.001, Math.max(0, cy + (y - cy) * inv));
    const y0 = sy | 0;
    const fy = sy - y0;
    const r0 = y0 * srcW;
    const r1 = (y0 + 1 < srcH ? y0 + 1 : y0) * srcW;

    let o = y * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const sx = Math.min(srcW - 1.001, Math.max(0, ox + cx + (x - cx) * inv));
      const x0 = sx | 0;
      const fx = sx - x0;
      const x1 = x0 + 1 < srcW ? x0 + 1 : x0;

      const a = (r0 + x0) * 4, b = (r0 + x1) * 4;
      const c = (r1 + x0) * 4, d = (r1 + x1) * 4;

      for (let k = 0; k < 4; k++) {
        const top = src[a + k] + (src[b + k] - src[a + k]) * fx;
        const bot = src[c + k] + (src[d + k] - src[c + k]) * fx;
        out[o + k] = (top + (bot - top) * fy) | 0;
      }
    }
  }
  return out;
}

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
