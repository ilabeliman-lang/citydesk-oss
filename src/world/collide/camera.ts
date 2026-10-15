import { segIntersect } from "./geom.ts";
import type { Vec } from "./types.ts";
import type { CollisionWorld } from "./world.ts";

/** NDU-UPG collide: camera occlusion probe (PLAN §5.12). Pure. bearing: degrees clockwise from north. */
export function probeCamera(world: CollisionWorld, at: Vec, bearingDeg: number, eyeM: number, backM: number): { occluders: number[]; boomScale: number } {
  const b = (bearingDeg * Math.PI) / 180;
  const cx = at.x - Math.sin(b) * backM;
  const cy = at.y - Math.cos(b) * backM;
  const g = world.grid;
  const occ = new Set<number>();
  let tHit = 1;
  g.segment(at.x, at.y, cx, cy, (e) => {
    const t = segIntersect(at.x, at.y, cx, cy, g.ax[e], g.ay[e], g.bx[e], g.by[e]);
    if (t < 0) return;
    const c = world.colliders[g.collider[e]];
    if (!c) return;
    const hRay = eyeM * t;
    if (c.height > hRay + 0.5) {
      if (c.osm !== null) occ.add(c.osm);
      if (t < tHit) tHit = t;
    }
  });
  const boomScale = tHit >= 1 ? 1 : Math.max(0.8 / Math.max(backM, 0.8), Math.min(1, (tHit * backM - 0.3) / backM));
  return { occluders: [...occ].sort((p, q) => p - q), boomScale };
}
