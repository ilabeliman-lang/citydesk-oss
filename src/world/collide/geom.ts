import type { Collider, Vec } from "./types.ts";

/** NDU-UPG collide: pure 2D geometry over interleaved xy Float64Array rings (closed: last == first). */
export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, out: Vec): Vec {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = ax + dx * t;
  out.y = ay + dy * t;
  return out;
}

/** Proper or touching intersection of segments p→q and a→b; returns t along p→q or -1. */
export function segIntersect(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): number {
  const rx = qx - px;
  const ry = qy - py;
  const sx = bx - ax;
  const sy = by - ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return -1;
  const t = ((ax - px) * sy - (ay - py) * sx) / den;
  const u = ((ax - px) * ry - (ay - py) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

export function ringArea(r: Float64Array): number {
  let a = 0;
  for (let i = 0; i + 3 < r.length; i += 2) a += r[i] * r[i + 3] - r[i + 2] * r[i + 1];
  return a / 2;
}

export function ensureOrientation(r: Float64Array, ccw: boolean): Float64Array {
  const a = ringArea(r);
  if (a > 0 === ccw || a === 0) return r;
  const n = r.length / 2;
  const out = new Float64Array(r.length);
  for (let i = 0; i < n; i += 1) {
    out[i * 2] = r[(n - 1 - i) * 2];
    out[i * 2 + 1] = r[(n - 1 - i) * 2 + 1];
  }
  return out;
}

export function pointInRing(r: Float64Array, x: number, y: number): boolean {
  let hit = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = r[i * 2];
    const yi = r[i * 2 + 1];
    const xj = r[j * 2];
    const yj = r[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) hit = !hit;
  }
  return hit;
}

export function pointInCollider(c: Collider, x: number, y: number): boolean {
  const b = c.bbox;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  if (!pointInRing(c.rings[0], x, y)) return false;
  for (let i = 1; i < c.rings.length; i += 1) if (pointInRing(c.rings[i], x, y)) return false;
  return true;
}

/** Outward normal of edge i of a CCW outer ring: (dy, -dx)/len. */
export function outwardNormal(r: Float64Array, i: number, out: Vec): Vec {
  const dx = r[i * 2 + 2] - r[i * 2];
  const dy = r[i * 2 + 3] - r[i * 2 + 1];
  const l = Math.hypot(dx, dy) || 1;
  out.x = dy / l;
  out.y = -dx / l;
  return out;
}

/** Ramer–Douglas–Peucker on a closed ring (keeps closure). */
export function rdp(r: Float64Array, tol: number): Float64Array {
  const n = r.length / 2;
  if (n <= 4) return r;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tmp = { x: 0, y: 0 };
  // split closed ring at the farthest point from vertex 0 so the first span isn't degenerate
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n - 1; i += 1) {
    const d = Math.hypot(r[i * 2] - r[0], r[i * 2 + 1] - r[1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  keep[far] = 1;
  stack.length = 0;
  stack.push([0, far], [far, n - 1]);
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i += 1) {
      closestOnSegment(r[i * 2], r[i * 2 + 1], r[a * 2], r[a * 2 + 1], r[b * 2], r[b * 2 + 1], tmp);
      const d = Math.hypot(r[i * 2] - tmp.x, r[i * 2 + 1] - tmp.y);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(r[i * 2], r[i * 2 + 1]);
  return new Float64Array(out);
}
