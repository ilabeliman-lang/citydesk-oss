/**
 * NDU-UPG u-090 — licence-plate blur patches for the street-scan ingest path.
 *
 * Companion to src/world/ingest/plates.ts. That detector hunts a band whose *mean* luminance is an
 * extremum versus the strips above and below it. This one hunts a *text-dense rectangle*: a run of
 * columns that each carry edge pixels across a band of rows, where the band height and the run width sit
 * inside plate proportions and the band stands out from the ring of pixels around it. The two miss
 * different photos, so a caller that runs both catches more plates than either alone.
 *
 * HEURISTIC, in order:
 *   1. luma plane, computed on a proxy no longer than PROXY_MAX on its long side (boxes are scaled back).
 *   2. edge magnitude per pixel = |dluma/dx| + |dluma/dy| by central difference, undefined at the border.
 *      A pixel is an edge when that magnitude reaches PLATE_EDGE_MIN (24 luma steps on 0-255).
 *   3. rowCount[y] = edge pixels in that row. A row band is a contiguous run of rows reaching
 *      MIN_ROW_EDGES, gaps of up to gapMax rows bridged, length inside [MIN_H_FRAC, MAX_H_FRAC] of the
 *      proxy height — 3% to 22%, so a plate-sized band and nothing the size of a window or a wall.
 *   4. inside a band, colCount[x] = edge pixels in that column *within the band*. A run is contiguous
 *      columns reaching MIN_COL_EDGES (gaps bridged), width >= MIN_ASPECT * bandHeight.
 *   5. the box must stand out: |mean luma inside - mean luma in a 1px ring just outside| >= 40.
 *   6. the box *interior* — inset by INSET_FRAC (15%) on each side, so its own outline cannot count —
 *      must be edge-dense enough to be text rather than a blank stripe: MIN_EDGE_DENSITY (5%) of the
 *      remaining pixels are edges. This is what rejects a plain bright rectangle, whose only edges are
 *      its own border.
 *   7. score = interior edge density (0-1). Non-max suppression at IoU > 0.4, at most MAX_BOXES.
 *
 * Output is the same patch shape the ingest pipeline already consumes: an {x, y, w, h} rectangle with a
 * score, clamped to the frame and integer-valued, ready for blurBox() -> pixelate().
 *
 * INTEGRATION (NDU-UPG u-090, left as a TODO by the worktree's file scope):
 *   TODO(upg-u-090): wire platePatches() into the ingest path next to the existing plate detector at
 *   src/world/ingest/safePhoto.ts:214 — `plates = plateBoxes(work.width, work.height, data.data)`,
 *   inside finishPhoto(). Merge both patch sets there (e.g. `[...blur, ...platePatches(...)]`) so a
 *   text-dense plate the luminance-extremum detector misses is still mosaicked before the bytes leave.
 *   safePhoto.ts is outside src/world/leaks/, so it is untouched in this commit.
 *
 * A flat canvas, a canvas with either side under MIN_SIDE px, or a canvas with no run that fits plate
 * proportions returns []. Detection never throws; a miss returns [] so the scan can still be stored.
 */

/** Edge magnitude (0-255 scale) a pixel must reach to count as an edge. */
export const PLATE_EDGE_MIN = 24;

/** A plate band must differ from its surroundings by at least this much mean luma. */
export const PLATE_MIN_CONTRAST = 40;

/**
 * A blur patch. Structurally assignable to the Box that vision.ts pixelate() takes and to the
 * {x, y, w, h} that plates/region.ts blurBox() takes, so it drops straight into either.
 */
export type PlatePatch = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Interior edge density, 0-1. Higher means more text-like. */
  score: number;
};

const MIN_SIDE = 32;
const MIN_ASPECT = 1.8;
const MAX_ASPECT = 7;
const MIN_H_FRAC = 0.03;
const MAX_H_FRAC = 0.22;
const MIN_ROW_EDGES = 2;
const MIN_COL_EDGES = 2;
/** Fraction of a box's height/width trimmed from each side before scoring, so its own outline cannot carry it. */
const INSET_FRAC = 0.15;
/** Fraction of a box's inset interior that must be edge pixels for it to read as text, not a blank stripe. */
const MIN_EDGE_DENSITY = 0.05;
const MAX_BOXES = 3;
/** Search on a proxy no wider/taller than this, then scale boxes back. */
const PROXY_MAX = 320;
const NMS_IOU = 0.4;

function lumaOf(rgba: Uint8ClampedArray, w: number, h: number): Float64Array {
  const lum = new Float64Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i += 1, p += 4) {
    lum[i] = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
  }
  return lum;
}

function downscale(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  sw: number,
  sh: number,
): Float64Array {
  const lum = new Float64Array(sw * sh);
  for (let y = 0; y < sh; y += 1) {
    const y0 = Math.floor((y * h) / sh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / sh));
    for (let x = 0; x < sw; x += 1) {
      const x0 = Math.floor((x * w) / sw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / sw));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * w;
        for (let xx = x0; xx < x1; xx += 1) {
          const p = (row + xx) * 4;
          sum += rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
          n += 1;
        }
      }
      lum[y * sw + x] = sum / n;
    }
  }
  return lum;
}

function iou(a: PlatePatch, b: PlatePatch): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

type Span = { start: number; end: number };

/**
 * Contiguous runs of `counts[i] >= min`, with gaps of up to gapMax short positions bridged, kept only
 * when the run is at least minLen long.
 */
function runs(counts: Uint16Array | Float64Array, min: number, minLen: number, gapMax: number): Span[] {
  const out: Span[] = [];
  let i = 0;
  while (i < counts.length) {
    if (counts[i] < min) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < counts.length) {
      if (counts[j] >= min) {
        j += 1;
        continue;
      }
      let look = j;
      let gap = 0;
      while (look < counts.length && counts[look] < min && gap < gapMax) {
        look += 1;
        gap += 1;
      }
      if (look < counts.length && counts[look] >= min) {
        j = look;
        continue;
      }
      break;
    }
    if (j - i >= minLen) out.push({ start: i, end: j });
    i = j + 1;
  }
  return out;
}

function meanOf(lum: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(lum.length / w, y1); y += 1) {
    const row = y * w;
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x += 1) {
      sum += lum[row + x];
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

function patchesOnProxy(w: number, h: number, lum: Float64Array): PlatePatch[] {
  // 2. binary edge mask, central difference (undefined on the outermost ring).
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    const row = y * w;
    for (let x = 1; x < w - 1; x += 1) {
      const i = row + x;
      const gx = Math.abs(lum[i + 1] - lum[i - 1]);
      const gy = Math.abs(lum[i + w] - lum[i - w]);
      if (gx + gy >= PLATE_EDGE_MIN) edge[i] = 1;
    }
  }

  // 3. rows carrying at least MIN_ROW_EDGES edge pixels, run together, form the band candidates.
  const rowCount = new Uint16Array(h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    let c = 0;
    for (let x = 0; x < w; x += 1) c += edge[row + x];
    rowCount[y] = c;
  }
  const anyEdge = rowCount.some((c) => c > 0);
  if (!anyEdge) return [];

  const minH = Math.max(2, Math.ceil(h * MIN_H_FRAC));
  const maxH = Math.max(minH, Math.floor(h * MAX_H_FRAC));
  const rowGap = Math.max(1, Math.round(h * 0.05));
  const bands = runs(rowCount, MIN_ROW_EDGES, minH, rowGap).filter((b) => b.end - b.start <= maxH);
  if (!bands.length) return [];

  const colBuf = new Uint16Array(w);
  const found: PlatePatch[] = [];

  for (const band of bands) {
    for (let hh = minH; hh <= Math.min(maxH, band.end - band.start); hh += 1) {
      const minW = Math.ceil(MIN_ASPECT * hh);
      if (minW > w) continue;
      const colGap = Math.max(1, Math.round(hh * 0.15));
      for (let y = band.start; y + hh <= band.end; y += 1) {
        // 4. column edge counts restricted to this exact band.
        colBuf.fill(0);
        for (let yy = y; yy < y + hh; yy += 1) {
          const row = yy * w;
          for (let x = 0; x < w; x += 1) {
            if (edge[row + x]) colBuf[x] += 1;
          }
        }
        for (const run of runs(colBuf, MIN_COL_EDGES, minW, colGap)) {
          const rw = run.end - run.start;
          if (rw > MAX_ASPECT * hh) continue;
          // 5. the band has to stand out from the ring of pixels around it.
          const inside = meanOf(lum, w, run.start, y, run.end, y + hh);
          const ring =
            meanOf(lum, w, run.start - 1, y - 1, run.end + 1, y) +
            meanOf(lum, w, run.start - 1, y + hh, run.end + 1, y + hh + 1) +
            meanOf(lum, w, run.start - 1, y, run.start, y + hh) +
            meanOf(lum, w, run.end, y, run.end + 1, y + hh);
          if (Math.abs(inside - ring / 4) < PLATE_MIN_CONTRAST) continue;
          // 6. the interior must be edge-dense: inset by INSET_FRAC on each side so the box's own
          // outline cannot carry the score, then require MIN_EDGE_DENSITY of what is left to be edges.
          const insetY = Math.max(1, Math.floor(hh * INSET_FRAC));
          const insetX = Math.max(1, Math.floor(rw * INSET_FRAC));
          const iy0 = y + insetY;
          const ih = hh - 2 * insetY;
          const ix0 = run.start + insetX;
          const iw = rw - 2 * insetX;
          if (iw <= 0 || ih <= 0) continue;
          let hits = 0;
          for (let yy = iy0; yy < iy0 + ih; yy += 1) {
            const row = yy * w;
            for (let xx = ix0; xx < ix0 + iw; xx += 1) hits += edge[row + xx];
          }
          const density = hits / (iw * ih);
          if (density < MIN_EDGE_DENSITY) continue;
          found.push({ x: run.start, y, w: rw, h: hh, score: density });
        }
      }
    }
  }

  // 6. keep the strongest, drop near-duplicates.
  found.sort((a, b) => b.score - a.score);
  const out: PlatePatch[] = [];
  for (const c of found) {
    if (out.some((k) => iou(k, c) > NMS_IOU)) continue;
    out.push(c);
    if (out.length === MAX_BOXES) break;
  }
  return out;
}

/**
 * Blur patches for licence-plate-looking regions in an RGBA frame, in frame coordinates.
 * Pure: reads only the buffer it is given, touches no canvas, DOM, or network. Never throws.
 */
export function platePatches(width: number, height: number, rgba: Uint8ClampedArray): PlatePatch[] {
  try {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return [];
    const w = Math.floor(width);
    const h = Math.floor(height);
    if (w < MIN_SIDE || h < MIN_SIDE) return [];
    if (!rgba || rgba.length < w * h * 4) return [];

    const long = Math.max(w, h);
    const scale = long > PROXY_MAX ? PROXY_MAX / long : 1;
    const sw = Math.max(1, Math.round(w * scale));
    const sh = Math.max(1, Math.round(h * scale));
    if (sw < MIN_SIDE || sh < MIN_SIDE) return [];
    const lum = scale === 1 ? lumaOf(rgba, w, h) : downscale(rgba, w, h, sw, sh);
    const sx = w / sw;
    const sy = h / sh;
    return patchesOnProxy(sw, sh, lum)
      .map((b) => {
        // Scale back to frame pixels and clamp inside the frame.
        const x = Math.max(0, Math.floor(b.x * sx));
        const y = Math.max(0, Math.floor(b.y * sy));
        const x2 = Math.min(w, Math.ceil((b.x + b.w) * sx));
        const y2 = Math.min(h, Math.ceil((b.y + b.h) * sy));
        return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y), score: b.score };
      })
      .filter((b) => b.w > 0 && b.h > 0 && b.w / b.h >= MIN_ASPECT && b.w / b.h <= MAX_ASPECT);
  } catch {
    return [];
  }
}
