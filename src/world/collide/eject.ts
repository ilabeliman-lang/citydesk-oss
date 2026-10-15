import { closestOnSegment } from "./geom.ts";
import type { Collider, Vec } from "./types.ts";
import type { CollisionWorld } from "./world.ts";

/** NDU-UPG collide: step an avatar that spawned inside a footprint back out (PLAN §5.10). */
export function ejectPoint(world: CollisionWorld, x: number, y: number): { x: number; y: number; via: "door" | "edge"; collider: Collider } | null {
  const c = world.pointInBlocking(x, y);
  if (!c) return null;
  const doors = world.doors
    .filter((d) => d.colliderKey === c.key && !d.locked && Math.hypot(d.approach.x - x, d.approach.y - y) < 60)
    .sort((a, b) => Math.hypot(a.approach.x - x, a.approach.y - y) - Math.hypot(b.approach.x - x, b.approach.y - y));
  for (const d of doors) if (world.isFree(d.approach.x, d.approach.y)) return { x: d.approach.x, y: d.approach.y, via: "door", collider: c };
  // nearest outer-ring points, pushed out by r + 0.3, first one that is free
  const r = c.rings[0];
  const tmp: Vec = { x: 0, y: 0 };
  const cands: { x: number; y: number; d: number }[] = [];
  const push = world.opts.radius + 0.3;
  for (let i = 0; i + 3 < r.length; i += 2) {
    closestOnSegment(x, y, r[i], r[i + 1], r[i + 2], r[i + 3], tmp);
    const ex = r[i + 2] - r[i];
    const ey = r[i + 3] - r[i + 1];
    const l = Math.hypot(ex, ey) || 1;
    cands.push({ x: tmp.x + (ey / l) * push, y: tmp.y + (-ex / l) * push, d: Math.hypot(tmp.x - x, tmp.y - y) });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const k of cands) if (world.isFree(k.x, k.y)) return { x: k.x, y: k.y, via: "edge", collider: c };
  for (const k of cands)
    for (const extra of [0.5, 1, 2, 4]) {
      const ox = k.x + (k.x - x) / (k.d || 1) * extra;
      const oy = k.y + (k.y - y) / (k.d || 1) * extra;
      if (world.isFree(ox, oy)) return { x: ox, y: oy, via: "edge", collider: c };
    }
  return null;
}
