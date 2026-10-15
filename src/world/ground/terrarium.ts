import type { Encoding, Normal } from "./types.ts";

/** NDU realism 02 T1: pure DEM maths (PLAN §5.1). Alias-free so node --experimental-strip-types can test it. */

export const EARTH_CIRC = 40075016.686;

export const decodeTerrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;
export const decodeMapbox = (r: number, g: number, b: number) => -10000 + (r * 65536 + g * 256 + b) * 0.1;

export function decodeTile(rgba: Uint8ClampedArray | Uint8Array, size: number, enc: Encoding = "terrarium"): Float32Array {
  const out = new Float32Array(size * size);
  const dec = enc === "mapbox" ? decodeMapbox : decodeTerrarium;
  for (let i = 0; i < out.length; i += 1) out[i] = dec(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  return out;
}

/** Global pixel coordinates at zoom z (tile = floor(px / size)). */
export function lngLatToTilePx(lng: number, lat: number, z: number, size = 256) {
  const n = 2 ** z * size;
  const x = ((lng + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y, tx: Math.floor(x / size), ty: Math.floor(y / size), px: x - Math.floor(x / size) * size, py: y - Math.floor(y / size) * size };
}

export function tilePxToLngLat(x: number, y: number, z: number, size = 256): [number, number] {
  const n = 2 ** z * size;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng, lat];
}

export const metresPerPixel = (lat: number, z: number, size = 256) => (EARTH_CIRC * Math.cos((lat * Math.PI) / 180)) / (size * 2 ** z);

/** Bilinear sample with pixel centres at +0.5 and clamped edges (matches MapLibre getDEMElevation). */
export function sampleBilinear(tile: { h: Float32Array; size: number }, px: number, py: number): number {
  const n = tile.size;
  const fx = Math.max(0, Math.min(n - 1, px - 0.5));
  const fy = Math.max(0, Math.min(n - 1, py - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const h = tile.h;
  const a = h[y0 * n + x0];
  const b = h[y0 * n + x1];
  const c = h[y1 * n + x0];
  const d = h[y1 * n + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/** Surface normal by central differences over ±1 px (x east, y north, z up). */
export function normalAt(tile: { h: Float32Array; size: number }, px: number, py: number, mpp: number): Normal {
  const dzdx = (sampleBilinear(tile, px + 1, py) - sampleBilinear(tile, px - 1, py)) / (2 * mpp);
  // pixel y grows southwards
  const dzdy = (sampleBilinear(tile, px, py - 1) - sampleBilinear(tile, px, py + 1)) / (2 * mpp);
  const len = Math.hypot(dzdx, dzdy, 1);
  const nz = 1 / len;
  return { nx: -dzdx / len, ny: -dzdy / len, nz, slopeDeg: (Math.acos(Math.min(1, nz)) * 180) / Math.PI };
}

export function minMax(h: Float32Array): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < h.length; i += 1) {
    const v = h[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
