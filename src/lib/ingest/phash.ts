/**
 * NDU-AI safe ingest #2: perceptual hash (pHash, DCT-based, 64 bits) + Hamming matching. Isomorphic, no deps.
 *
 * Same algorithm as the widely used `imagehash.phash`: luminance -> 32x32 -> 2-D DCT-II -> top-left 8x8 ->
 * bit = coefficient > median. Survives re-encoding, resizing, mild crops/brightness changes, and metadata
 * stripping; a different photo lands ~32 bits away on average. Written from the published algorithm
 * (no third-party code or model), so no licence strings attached.
 */
export const PHASH_SIZE = 32;
export const PHASH_LOW = 8;
/** <= this many differing bits (of 64) counts as "the same picture". */
export const SAME_PICTURE_BITS = 10;

/** RGBA (canvas ImageData layout) -> BT.601 luma. */
export function rgbaToGray(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i += 1, p += 4)
    g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

/** Area-average resize (good enough and deterministic on both sides). */
export function resizeGray(
  src: ArrayLike<number>,
  w: number,
  h: number,
  ow = PHASH_SIZE,
  oh = PHASH_SIZE,
): Float32Array {
  const out = new Float32Array(ow * oh);
  for (let oy = 0; oy < oh; oy += 1) {
    const y0 = (oy * h) / oh;
    const y1 = ((oy + 1) * h) / oh;
    for (let ox = 0; ox < ow; ox += 1) {
      const x0 = (ox * w) / ow;
      const x1 = ((ox + 1) * w) / ow;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y += 1) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1)); x += 1) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          sum += src[y * w + x] * wx * wy;
          area += wx * wy;
        }
      }
      out[oy * ow + ox] = area > 0 ? sum / area : 0;
    }
  }
  return out;
}

let cosTable: Float64Array | null = null;
function cosines(): Float64Array {
  if (cosTable) return cosTable;
  const n = PHASH_SIZE;
  cosTable = new Float64Array(n * n);
  for (let k = 0; k < n; k += 1)
    for (let i = 0; i < n; i += 1) cosTable[k * n + i] = Math.cos((Math.PI / n) * (i + 0.5) * k);
  return cosTable;
}

/** 64-bit pHash of a 32x32 luminance block, as 16 hex chars. */
export function phash32(gray32: ArrayLike<number>): string {
  const n = PHASH_SIZE;
  if (gray32.length !== n * n) throw new Error("phash32 needs a 32x32 block");
  const c = cosines();
  // separable DCT-II: rows then columns, only the 8 lowest frequencies are needed
  const rows = new Float64Array(n * PHASH_LOW);
  for (let y = 0; y < n; y += 1) {
    for (let u = 0; u < PHASH_LOW; u += 1) {
      let s = 0;
      for (let x = 0; x < n; x += 1) s += gray32[y * n + x] * c[u * n + x];
      rows[y * PHASH_LOW + u] = s;
    }
  }
  const coeffs = new Float64Array(PHASH_LOW * PHASH_LOW);
  for (let v = 0; v < PHASH_LOW; v += 1) {
    for (let u = 0; u < PHASH_LOW; u += 1) {
      let s = 0;
      for (let y = 0; y < n; y += 1) s += rows[y * PHASH_LOW + u] * c[v * n + y];
      coeffs[v * PHASH_LOW + u] = s;
    }
  }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = (sorted[31] + sorted[32]) / 2;
  let hex = "";
  for (let nib = 0; nib < 16; nib += 1) {
    let v = 0;
    for (let b = 0; b < 4; b += 1) v = (v << 1) | (coeffs[nib * 4 + b] > median ? 1 : 0);
    hex += v.toString(16);
  }
  return hex;
}

/** Convenience: pHash straight from RGBA pixels. */
export function phashRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): string {
  return phash32(resizeGray(rgbaToGray(rgba, w, h), w, h));
}

const POP = Array.from(
  { length: 16 },
  (_, i) => (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1),
);

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

export const isPhash = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{16}$/.test(v);

/** A flat phash -> id index (linear scan; fine into the hundreds of thousands). */
export type PhashEntry = { h: string; id: string; item?: string; user?: string; at?: number };
export type PhashMatch = PhashEntry & { distance: number };

export function findMatches(
  entries: Iterable<PhashEntry>,
  h: string,
  maxBits = SAME_PICTURE_BITS,
): PhashMatch[] {
  const out: PhashMatch[] = [];
  for (const e of entries) {
    const distance = hamming(e.h, h);
    if (distance <= maxBits) out.push({ ...e, distance });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export type DedupeVerdict = {
  status: "new" | "same-item" | "reused-own" | "someone-else";
  matches: number;
  closest: number | null;
};

/**
 * What a match means for one upload. Replacing the photo of the SAME item is fine; reusing your own photo
 * for a different item is worth a nudge; someone else's evidence is a review flag (or a block if the
 * dedupeBlock flag is on). Never decides ownership.
 */
export function dedupeVerdict(
  matches: PhashMatch[],
  me: { user: string; item: string },
): DedupeVerdict {
  const others = matches.filter((m) => m.user && m.user !== me.user);
  const mineElsewhere = matches.filter((m) => m.user === me.user && m.item !== me.item);
  const closest = matches.length ? matches[0].distance : null;
  if (others.length) return { status: "someone-else", matches: others.length, closest };
  if (mineElsewhere.length) return { status: "reused-own", matches: mineElsewhere.length, closest };
  if (matches.length) return { status: "same-item", matches: matches.length, closest };
  return { status: "new", matches: 0, closest };
}
