import type { Frame, Vec } from "./types.ts";

/** NDU-UPG collide: local tangent plane with WGS84 metres-per-degree at the anchor. */
export function makeFrame(lat0: number, lng0: number): Frame {
  const p = (lat0 * Math.PI) / 180;
  const ky = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p);
  const kx = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
  return { lat0, lng0, kx: kx || 1e-6, ky };
}
export function toXY(f: Frame, lat: number, lng: number, out: Vec = { x: 0, y: 0 }): Vec {
  out.x = (lng - f.lng0) * f.kx;
  out.y = (lat - f.lat0) * f.ky;
  return out;
}
export function toLL(f: Frame, x: number, y: number): { lat: number; lng: number } {
  return { lat: f.lat0 + y / f.ky, lng: f.lng0 + x / f.kx };
}
export function needsRecentre(f: Frame, lat: number, lng: number, maxM = 1500): boolean {
  const v = toXY(f, lat, lng);
  return Math.hypot(v.x, v.y) > maxM;
}
