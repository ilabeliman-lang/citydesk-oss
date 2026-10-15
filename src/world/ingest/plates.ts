// NDU-UPG 901
/**
 * On-device licence-plate bands. No model file.
 *
 * A band is kept only when all of these hold:
 *  - height is between 4% and 18% of the image
 *  - width / height >= 2.2
 *  - it is a luminance extremum versus the strips directly above and below:
 *    both differences share a sign and each is at least PLATE_MIN_CONTRAST
 *    (40, mean luma on 0–255)
 *
 * At most 3 boxes. A flat image, or a canvas with either side under 32px, returns [].
 * Detection never throws; a miss returns [] so the photo can still be saved.
 */
export const PLATE_MIN_CONTRAST = 40;

export type PlateBox = { x: number; y: number; w: number; h: number };

const MIN_SIDE = 32;
const MIN_ASPECT = 2.2;
const MIN_H_FRAC = 0.04;
const MAX_H_FRAC = 0.18;
const MAX_BOXES = 3;
/** Search on a proxy no wider/taller than this, then scale boxes back. */
const PROXY_MAX = 320;

type Cand = PlateBox & { score: number };

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

function iou(a: PlateBox, b: PlateBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function findBands(w: number, h: number, lum: Float64Array): Cand[] {
  const minH = Math.ceil(h * MIN_H_FRAC);
  const maxH = Math.floor(h * MAX_H_FRAC);
  if (maxH < 2 || minH > maxH) return [];

  let lo = 255;
  let hi = 0;
  const sample = Math.max(1, Math.floor(lum.length / 480));
  for (let i = 0; i < lum.length; i += sample) {
    const v = lum[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < PLATE_MIN_CONTRAST) return [];

  const pref = new Float64Array((h + 1) * w);
  for (let y = 0; y < h; y += 1) {
    const src = y * w;
    const dst = (y + 1) * w;
    const prev = y * w;
    for (let x = 0; x < w; x += 1) pref[dst + x] = pref[prev + x] + lum[src + x];
  }
  const colMean = (x: number, y0: number, y1: number) => {
    const n = y1 - y0;
    return n > 0 ? (pref[y1 * w + x] - pref[y0 * w + x]) / n : 0;
  };

  const marks = new Uint8Array(w);
  const kept: Cand[] = [];
  const consider = (c: Cand) => {
    for (let i = 0; i < kept.length; i += 1) {
      if (iou(kept[i], c) > 0.4) {
        if (c.score > kept[i].score) kept[i] = c;
        return;
      }
    }
    kept.push(c);
  };

  for (let hh = minH; hh <= maxH; hh += 1) {
    const strip = Math.max(2, Math.round(hh * 0.5));
    const minW = Math.ceil(MIN_ASPECT * hh);
    if (minW > w) continue;
    const gapMax = Math.min(8, Math.max(1, Math.round(hh * 0.2)));
    for (let y = strip; y + hh + strip <= h; y += 1) {
      marks.fill(0);
      let marked = 0;
      for (let x = 0; x < w; x += 1) {
        const mid = colMean(x, y, y + hh);
        const above = colMean(x, y - strip, y);
        const below = colMean(x, y + hh, y + hh + strip);
        const da = mid - above;
        const db = mid - below;
        if (
          da * db > 0 &&
          Math.abs(da) >= PLATE_MIN_CONTRAST &&
          Math.abs(db) >= PLATE_MIN_CONTRAST
        ) {
          marks[x] = 1;
          marked += 1;
        }
      }
      if (marked < minW) continue;

      let i = 0;
      while (i < w) {
        while (i < w && !marks[i]) i += 1;
        if (i >= w) break;
        let j = i;
        let trueCount = 0;
        while (j < w) {
          if (marks[j]) {
            trueCount += 1;
            j += 1;
            continue;
          }
          let look = j;
          let gap = 0;
          while (look < w && !marks[look] && gap < gapMax) {
            look += 1;
            gap += 1;
          }
          if (look < w && marks[look] && gap <= gapMax) {
            j = look;
            continue;
          }
          break;
        }
        const rw = j - i;
        if (rw >= minW && trueCount / rw >= 0.55) {
          let acc = 0;
          for (let x = i; x < j; x += 1) {
            if (!marks[x]) continue;
            const mid = colMean(x, y, y + hh);
            const above = colMean(x, y - strip, y);
            const below = colMean(x, y + hh, y + hh + strip);
            acc += Math.min(Math.abs(mid - above), Math.abs(mid - below));
          }
          consider({ x: i, y, w: rw, h: hh, score: acc / trueCount });
        }
        i = j + 1;
      }
    }
  }

  kept.sort((a, b) => b.score - a.score);
  const out: Cand[] = [];
  for (const c of kept) {
    if (out.some((k) => iou(k, c) > 0.35)) continue;
    out.push(c);
    if (out.length === MAX_BOXES) break;
  }
  return out;
}

export function plateBoxes(width: number, height: number, rgba: Uint8ClampedArray): PlateBox[] {
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
    return findBands(sw, sh, lum)
      .map((b) => {
        const x = Math.max(0, Math.floor(b.x * sx));
        const y = Math.max(0, Math.floor(b.y * sy));
        const x2 = Math.min(w, Math.ceil((b.x + b.w) * sx));
        const y2 = Math.min(h, Math.ceil((b.y + b.h) * sy));
        return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
      })
      .filter((b) => b.w > 0 && b.h > 0 && b.w / b.h >= MIN_ASPECT);
  } catch {
    return [];
  }
}
