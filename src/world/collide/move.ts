import { closestOnSegment, segIntersect } from "./geom.ts";
import { MAG_K, MAG_M, STUCK_S, type CollideOptions, type MoveResult, type Vec } from "./types.ts";
import type { CollisionWorld } from "./world.ts";

/** NDU-UPG collide: collide-and-slide for a disc avatar (PLAN §5.3). No allocation per call. */
const tmp: Vec = { x: 0, y: 0 };
const nrm: Vec = { x: 0, y: 0 };
let worstD = 0;
let worstE = -1;
let qx = 0;
let qy = 0;

export function newResult(): MoveResult {
  return { pos: { x: 0, y: 0 }, moved: 0, blocked: false, normal: { x: 0, y: 0 }, hitKey: null, substeps: 0, iterations: 0 };
}

function deepest(world: CollisionWorld, r: number): void {
  const g = world.grid;
  worstD = 0;
  worstE = -1;
  g.near(qx, qy, r + world.opts.skin, (e) => {
    closestOnSegment(qx, qy, g.ax[e], g.ay[e], g.bx[e], g.by[e], tmp);
    const dx = qx - tmp.x;
    const dy = qy - tmp.y;
    const d = Math.hypot(dx, dy);
    if (d < r && r - d > worstD) {
      worstD = r - d;
      worstE = e;
      if (d > 1e-9) {
        nrm.x = dx / d;
        nrm.y = dy / d;
      } else {
        // on the line: use the edge's left-hand normal (outer rings are CCW → outward)
        const ex = g.bx[e] - g.ax[e];
        const ey = g.by[e] - g.ay[e];
        const l = Math.hypot(ex, ey) || 1;
        nrm.x = ey / l;
        nrm.y = -ex / l;
      }
    }
  });
}

function crosses(world: CollisionWorld, px: number, py: number, x: number, y: number): number {
  const g = world.grid;
  let hit = -1;
  g.segment(px, py, x, y, (e) => {
    if (hit >= 0) return;
    if (segIntersect(px, py, x, y, g.ax[e], g.ay[e], g.bx[e], g.by[e]) >= 0) hit = e;
  });
  return hit;
}

export function slideMove(world: CollisionWorld, pos: Vec, delta: Vec, opts: CollideOptions, out: MoveResult): MoveResult {
  const r = opts.radius;
  let px = pos.x;
  let py = pos.y;
  const len = Math.hypot(delta.x, delta.y);
  const n = Math.max(1, Math.ceil(len / opts.maxSub));
  let dx = delta.x / n;
  let dy = delta.y / n;
  out.blocked = false;
  out.hitKey = null;
  out.iterations = 0;
  out.substeps = n;
  let hadNormal = false;
  const sx = px;
  const sy = py;
  for (let s = 0; s < n; s += 1) {
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) break;
    qx = px + dx;
    qy = py + dy;
    let contact = false;
    let it = 0;
    let ok = false;
    for (; it < opts.maxIter; it += 1) {
      deepest(world, r);
      if (worstE < 0) {
        ok = true;
        break;
      }
      contact = true;
      qx += nrm.x * (worstD + opts.skin);
      qy += nrm.y * (worstD + opts.skin);
      if (out.normal) {
        out.normal.x = nrm.x;
        out.normal.y = nrm.y;
      }
      hadNormal = true;
      out.hitKey = world.colliders[world.grid.collider[worstE]]?.key ?? null;
    }
    if (!ok) {
      deepest(world, r);
      ok = worstE < 0;
    }
    out.iterations += it;
    if (!ok) {
      qx = px;
      qy = py;
      out.blocked = true;
      break;
    }
    if (crosses(world, px, py, qx, qy) >= 0 || world.pointInBlocking(qx, qy)) {
      qx = px;
      qy = py;
      out.blocked = true;
      break;
    }
    if (contact) {
      out.blocked = true;
      // slide: remove the into-wall component of the remaining substep delta
      const dn = dx * nrm.x + dy * nrm.y;
      if (dn < 0) {
        dx -= nrm.x * dn;
        dy -= nrm.y * dn;
      }
    }
    px = qx;
    py = qy;
  }
  out.pos.x = px;
  out.pos.y = py;
  out.moved = Math.hypot(px - sx, py - sy);
  if (!hadNormal && out.normal) {
    out.normal.x = 0;
    out.normal.y = 0;
  }
  return out;
}

/** Stuck detector (PLAN §7.13): input held but < 5% of the wanted distance moved for STUCK_S. */
export type StuckState = { t: number };
export function tickStuck(state: StuckState, input: number, moved: number, dt: number): boolean {
  if (input > 1e-6 && moved < input * 0.05) state.t += dt;
  else state.t = 0;
  if (state.t >= STUCK_S) {
    state.t = 0;
    return true;
  }
  return false;
}

/** Soft magnetism toward a path direction (PLAN §5.4). segDir unit; dist = metres from the segment. */
export function magnetise(east: number, north: number, segDir: Vec | null, dist: number, magM = MAG_M, k = MAG_K): { east: number; north: number } {
  const m = Math.hypot(east, north);
  if (!segDir || m < 1e-9 || dist > magM) return { east, north };
  const cos = (east * segDir.x + north * segDir.y) / m;
  if (Math.abs(cos) < 0.7) return { east, north };
  const sgn = cos < 0 ? -1 : 1;
  const w = k * (1 - dist / magM);
  const ex = east / m + (segDir.x * sgn - east / m) * w;
  const ny = north / m + (segDir.y * sgn - north / m) * w;
  const l = Math.hypot(ex, ny) || 1;
  return { east: (ex / l) * m, north: (ny / l) * m };
}
