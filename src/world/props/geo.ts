/**
 * NDU-UPG props: tiny local-metre geometry (equirectangular around an origin). Pure, alias-free.
 * x = east metres, y = north metres. Compass yaw: 0 = north, clockwise.
 */

const R = 6378137;
const RAD = Math.PI / 180;

export type Proj = { toXY: (lng: number, lat: number) => [number, number]; toLL: (x: number, y: number) => [number, number] };

export function projAt(lng0: number, lat0: number): Proj {
  const kx = R * RAD * Math.cos(lat0 * RAD);
  const ky = R * RAD;
  return {
    toXY: (lng, lat) => [(lng - lng0) * kx, (lat - lat0) * ky],
    toLL: (x, y) => [lng0 + x / kx, lat0 + y / ky],
  };
}

/** Compass bearing of the vector (dx east, dy north). */
export function bearingOf(dx: number, dy: number): number {
  return ((Math.atan2(dx, dy) / RAD) % 360 + 360) % 360;
}

export const norm360 = (d: number) => ((d % 360) + 360) % 360;

export type Nearest = { d: number; t: number; seg: number; px: number; py: number; bearing: number; side: 1 | -1 };

/** Nearest point on a polyline (local metres). side = +1 when the point is to the RIGHT of the line direction. */
export function nearestOnLine(x: number, y: number, line: [number, number][]): Nearest | null {
  let best: Nearest | null = null;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) {
      const cross = dx * (y - ay) - dy * (x - ax); // >0 → left (math CCW)
      best = { d, t, seg: i, px, py, bearing: bearingOf(dx, dy), side: cross > 0 ? -1 : 1 };
    }
  }
  return best;
}

/** Even-odd point-in-polygon. */
export function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

export function lineLength(line: [number, number][]): number {
  let L = 0;
  for (let i = 0; i + 1 < line.length; i += 1) L += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return L;
}

/** Point + tangent bearing at distance s along a polyline. */
export function alongLine(line: [number, number][], s: number): { x: number; y: number; bearing: number } | null {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-9) continue;
    if (acc + L >= s) {
      const t = (s - acc) / L;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, bearing: bearingOf(bx - ax, by - ay) };
    }
    acc += L;
  }
  return null;
}

/** Offset (east, north) for a compass bearing and distance. */
export function offsetFor(bearing: number, dist: number): [number, number] {
  return [Math.sin(bearing * RAD) * dist, Math.cos(bearing * RAD) * dist];
}
