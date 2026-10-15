import { segIntersect } from "./geom.ts";
import type { Vec } from "./types.ts";
import type { CollisionWorld } from "./world.ts";

/** NDU-UPG collide: local grid A* around buildings for straight-line trips (PLAN §5.9). Pure. */
export function needsDetour(world: CollisionWorld, a: Vec, b: Vec): boolean {
  const g = world.grid;
  let hit = false;
  g.segment(a.x, a.y, b.x, b.y, (e) => {
    if (!hit && segIntersect(a.x, a.y, b.x, b.y, g.ax[e], g.ay[e], g.bx[e], g.by[e]) >= 0) hit = true;
  });
  return hit;
}

export function gridAStar(world: CollisionWorld, from: Vec, to: Vec, o: { window?: number; cell?: number; inflate?: number } = {}): Vec[] | null {
  const cell = o.cell ?? 1;
  const win = o.window ?? 80;
  const inflate = o.inflate ?? world.opts.radius;
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;
  if (Math.abs(from.x - to.x) > win - 4 || Math.abs(from.y - to.y) > win - 4) return null;
  const n = Math.ceil(win / cell);
  const x0 = cx - (n * cell) / 2;
  const y0 = cy - (n * cell) / 2;
  const N = n * n;
  const free = new Int8Array(N).fill(-1);
  const isFree = (i: number) => {
    if (free[i] < 0) {
      const x = x0 + ((i % n) + 0.5) * cell;
      const y = y0 + (Math.floor(i / n) + 0.5) * cell;
      free[i] = world.isFree(x, y, inflate) ? 1 : 0;
    }
    return free[i] === 1;
  };
  const idx = (p: Vec) => {
    const ix = Math.floor((p.x - x0) / cell);
    const iy = Math.floor((p.y - y0) / cell);
    return ix < 0 || iy < 0 || ix >= n || iy >= n ? -1 : iy * n + ix;
  };
  const s = idx(from);
  const t = idx(to);
  if (s < 0 || t < 0) return null;
  free[s] = 1;
  free[t] = 1;
  const gs = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: number[] = [];
  const fs = new Float64Array(N);
  const tx = t % n;
  const ty = Math.floor(t / n);
  const h = (i: number) => {
    const dx = Math.abs((i % n) - tx);
    const dy = Math.abs(Math.floor(i / n) - ty);
    return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) * cell;
  };
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (fs[heap[p]] <= fs[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop() as number;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && fs[heap[l]] < fs[heap[m]]) m = l;
        if (r < heap.length && fs[heap[r]] < fs[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  gs[s] = 0;
  fs[s] = h(s);
  push(s);
  while (heap.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === t) break;
    const ix = cur % n;
    const iy = Math.floor(cur / n);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = ix + dx;
        const ny = iy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx;
        if (closed[j] || !isFree(j)) continue;
        if (dx && dy && (!isFree(iy * n + nx) || !isFree(ny * n + ix))) continue; // no corner cutting
        const g = gs[cur] + (dx && dy ? Math.SQRT2 : 1) * cell;
        if (g < gs[j]) {
          gs[j] = g;
          came[j] = cur;
          fs[j] = g + h(j);
          push(j);
        }
      }
  }
  if (!closed[t]) return null;
  const cells: number[] = [];
  for (let k = t; k >= 0; k = came[k]) cells.push(k);
  cells.reverse();
  const pts: Vec[] = [{ x: from.x, y: from.y }];
  for (let k = 1; k < cells.length - 1; k += 1) pts.push({ x: x0 + ((cells[k] % n) + 0.5) * cell, y: y0 + (Math.floor(cells[k] / n) + 0.5) * cell });
  pts.push({ x: to.x, y: to.y });
  // string-pull: drop points whose neighbours see each other
  const out: Vec[] = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && needsDetour(world, pts[a], pts[b])) b -= 1;
    out.push(pts[b]);
    a = b;
  }
  return out;
}
