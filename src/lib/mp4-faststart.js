// Move an MP4's metadata to the front so it can be streamed.
//
// h264-mp4-encoder writes the file in the order it produces it: the frames
// first, then the index describing them. That is a valid MP4 and any desktop
// player handles it, but a browser given a URL reads from the start and gives
// up when it has not found a `moov` box — so the player renders, shows 0:00,
// and sits black. Which is exactly what it did.
//
// What ffmpeg calls `-movflags +faststart`. There is no ffmpeg here, so:
//
//   1. Read the top-level boxes.
//   2. Rebuild as ftyp, moov, then everything else in its original order.
//   3. Fix the chunk offsets, because they are absolute positions in the file
//      and every one of them has just moved.
//
// Step 3 is the part that matters. Skip it and the file still looks right to
// a box parser while playing nothing but noise, because every sample offset
// now points at the wrong bytes.

const SIZE = 8;

/** Top-level boxes, in file order. */
function topLevel(buf) {
  const out = [];
  let o = 0;
  while (o + SIZE <= buf.length) {
    const size = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + SIZE);
    // 0 means "to end of file", 1 means a 64-bit size follows. Neither is
    // produced here, and guessing at them would be worse than stopping.
    if (size < SIZE || o + size > buf.length) break;
    out.push({ type, start: o, size });
    o += size;
  }
  return out;
}

/*
 * Walk a container box and shift every chunk offset by `delta`.
 *
 * stco holds 32-bit offsets, co64 holds 64-bit ones. Both are inside
 * moov > trak > mdia > minf > stbl, but the path is walked generically
 * rather than assumed, because a file with two tracks nests them twice and
 * hard-coding the depth would silently patch only the first.
 */
function shiftChunkOffsets(buf, delta) {
  let patched = 0;

  const walk = (start, end) => {
    let o = start;
    while (o + SIZE <= end) {
      const size = buf.readUInt32BE(o);
      const type = buf.toString('ascii', o + 4, o + SIZE);
      if (size < SIZE || o + size > end) break;

      if (type === 'stco') {
        // version+flags (4), entry count (4), then 32-bit offsets.
        const count = buf.readUInt32BE(o + 12);
        for (let i = 0; i < count; i++) {
          const at = o + 16 + i * 4;
          buf.writeUInt32BE(buf.readUInt32BE(at) + delta, at);
        }
        patched += count;
      } else if (type === 'co64') {
        const count = buf.readUInt32BE(o + 12);
        for (let i = 0; i < count; i++) {
          const at = o + 16 + i * 8;
          buf.writeBigUInt64BE(buf.readBigUInt64BE(at) + BigInt(delta), at);
        }
        patched += count;
      } else if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'].includes(type)) {
        walk(o + SIZE, o + size);
      }

      o += size;
    }
  };

  walk(0, buf.length);
  return patched;
}

/**
 * The same MP4 with `moov` moved in front of the media.
 *
 * Returns the original buffer unchanged when there is nothing to do — the
 * metadata is already first, or the file is not shaped the way this
 * understands. Doing nothing is the right failure here: a file that plays in
 * some places beats one this has rearranged incorrectly.
 */
export function faststart(input) {
  const boxes = topLevel(input);
  const moov = boxes.find((b) => b.type === 'moov');
  const mdat = boxes.find((b) => b.type === 'mdat');
  const ftyp = boxes.find((b) => b.type === 'ftyp');

  if (!moov || !mdat || !ftyp) return input;
  if (moov.start < mdat.start) return input;          // already streamable

  // Chunk offsets are absolute, and everything between ftyp and moov's old
  // position shifts later by exactly the size of moov.
  const moovCopy = Buffer.from(input.subarray(moov.start, moov.start + moov.size));
  const moved = shiftChunkOffsets(moovCopy, moov.size);
  if (!moved) return input;                            // nothing patched: do not risk it

  const rest = boxes.filter((b) => b !== moov && b !== ftyp);
  return Buffer.concat([
    input.subarray(ftyp.start, ftyp.start + ftyp.size),
    moovCopy,
    ...rest.map((b) => input.subarray(b.start, b.start + b.size)),
  ]);
}

/** The top-level box order, for checking a file after the fact. */
export const boxOrder = (buf) => topLevel(buf).map((b) => b.type);
