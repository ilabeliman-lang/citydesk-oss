import { toXY } from "./enu.ts";
import { closestOnSegment, outwardNormal, ringArea } from "./geom.ts";
import { APPROACH_M, DOOR_RANK, type Collider, type Door, type DoorKind, type EntranceNode, type Vec } from "./types.ts";
import type { CollisionWorld } from "./world.ts";

/** NDU-UPG collide: tagged OSM entrances + deterministic synthetic doors (PLAN §5.5). Pure. */
const KINDS = new Set<DoorKind>(["main", "yes", "secondary", "service", "entrance", "exit", "emergency", "garage", "home", "staircase"]);

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function kindOf(tags: Record<string, string>): DoorKind {
  const e = (tags.entrance ?? "").toLowerCase();
  if (KINDS.has(e as DoorKind)) return e as DoorKind;
  if (e === "service" || e === "delivery") return "service";
  if ((tags.door ?? "") === "overhead") return "garage";
  return "yes";
}

function approachFor(world: CollisionWorld, c: Collider, edge: number, at: Vec, n: Vec): Vec | null {
  const r = c.rings[0];
  const ex = r[edge * 2 + 2] - r[edge * 2];
  const ey = r[edge * 2 + 3] - r[edge * 2 + 1];
  const l = Math.hypot(ex, ey) || 1;
  for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const x = at.x + n.x * APPROACH_M + (ex / l) * off;
    const y = at.y + n.y * APPROACH_M + (ey / l) * off;
    if (world.isFree(x, y)) return { x, y };
  }
  return null;
}

export function doorsFromEntrances(world: CollisionWorld, nodes: EntranceNode[], debug = false): Door[] {
  const out: Door[] = [];
  const tmp: Vec = { x: 0, y: 0 };
  for (const node of nodes) {
    const tags = node.tags ?? {};
    if ((tags.entrance ?? "") === "no") continue;
    const kind = kindOf(tags);
    if (kind === "emergency" && !debug) continue;
    const p = toXY(world.frame, node.lat, node.lng);
    let best: { c: Collider; edge: number; d: number; x: number; y: number } | null = null;
    for (const c of world.colliders) {
      if (!c.blocking) continue;
      const b = c.bbox;
      if (p.x < b[0] - 1.5 || p.x > b[2] + 1.5 || p.y < b[1] - 1.5 || p.y > b[3] + 1.5) continue;
      const r = c.rings[0];
      for (let i = 0; i + 3 < r.length; i += 2) {
        closestOnSegment(p.x, p.y, r[i], r[i + 1], r[i + 2], r[i + 3], tmp);
        const d = Math.hypot(p.x - tmp.x, p.y - tmp.y);
        if (d <= 1.0 && (!best || d < best.d)) best = { c, edge: i / 2, d, x: tmp.x, y: tmp.y };
      }
    }
    if (!best) continue;
    const n = outwardNormal(best.c.rings[0], best.edge, { x: 0, y: 0 });
    const at = { x: best.x, y: best.y };
    const approach = approachFor(world, best.c, best.edge, at, n);
    if (!approach) continue;
    const access = (tags.access ?? "").toLowerCase();
    const w = Number(tags.width);
    out.push({
      id: `n:${node.id}`,
      colliderKey: best.c.key,
      edge: best.edge,
      at,
      normal: n,
      approach,
      widthM: Number.isFinite(w) && w > 0 ? w : kind === "garage" ? 2.6 : 1.0,
      kind,
      synthetic: false,
      locked: access === "private" || access === "no",
      doorType: tags.door ?? "",
      name: tags.name ?? tags.ref ?? best.c.name ?? "",
      level: tags.level ?? null,
      wheelchair: tags.wheelchair ?? null,
    });
  }
  return out;
}

export type RoadDistance = (x: number, y: number) => { d: number; px: number; py: number } | null;

export function synthDoors(world: CollisionWorld, roadDistance: RoadDistance | null, tagged: Door[] = []): Door[] {
  const has = new Set(tagged.map((d) => d.colliderKey));
  const out: Door[] = [];
  for (const c of world.colliders) {
    if (!c.blocking || has.has(c.key) || c.height < 2) continue;
    const r = c.rings[0];
    const area = Math.abs(ringArea(r));
    if (area < 12) continue;
    const h = fnv1a(c.key);
    type Cand = { edge: number; score: number; mx: number; my: number; n: Vec; len: number; road: { px: number; py: number } | null };
    const cands: Cand[] = [];
    for (let i = 0; i + 3 < r.length; i += 2) {
      const ex = r[i + 2] - r[i];
      const ey = r[i + 3] - r[i + 1];
      const len = Math.hypot(ex, ey);
      if (len < 1.4) continue;
      const mx = (r[i] + r[i + 2]) / 2;
      const my = (r[i + 1] + r[i + 3]) / 2;
      const n = outwardNormal(r, i / 2, { x: 0, y: 0 });
      const rd = roadDistance ? roadDistance(mx, my) : null;
      let score: number;
      if (rd) {
        const vx = rd.px - mx;
        const vy = rd.py - my;
        const vl = Math.hypot(vx, vy) || 1;
        const facing = (n.x * vx + n.y * vy) / vl;
        if (facing < 0.2) continue;
        score = facing * 2 - rd.d / 20 + (Math.min(len, 6) / 6) * 0.3;
      } else score = (Math.min(len, 6) / 6) * 0.3;
      // tiny deterministic tie-break
      score += (((h ^ (i * 2654435761)) >>> 0) % 1000) * 1e-7;
      cands.push({ edge: i / 2, score, mx, my, n, len, road: rd ? { px: rd.px, py: rd.py } : null });
    }
    if (!cands.length) {
      // fallback: most free space in front (probe 2 m out)
      for (let i = 0; i + 3 < r.length; i += 2) {
        const len = Math.hypot(r[i + 2] - r[i], r[i + 3] - r[i + 1]);
        if (len < 1.4) continue;
        const mx = (r[i] + r[i + 2]) / 2;
        const my = (r[i + 1] + r[i + 3]) / 2;
        const n = outwardNormal(r, i / 2, { x: 0, y: 0 });
        const free = world.clearance(mx + n.x * 2, my + n.y * 2, 2);
        if (free > 0.5) cands.push({ edge: i / 2, score: Math.min(free, 2) + ((h + i) % 97) * 1e-6, mx, my, n, len, road: null });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const picked: Cand[] = [];
    for (const k of cands) {
      if (!picked.length) picked.push(k);
      else if (area > 1500 && picked.length < 2 && k.road && picked[0].road && Math.hypot(k.road.px - picked[0].road.px, k.road.py - picked[0].road.py) > 30) picked.push(k);
      if (picked.length >= (area > 1500 ? 2 : 1)) break;
    }
    for (const k of picked) {
      let at = { x: k.mx, y: k.my };
      if (k.len > 12 && k.road) {
        const ax = r[k.edge * 2];
        const ay = r[k.edge * 2 + 1];
        const bx = r[k.edge * 2 + 2];
        const by = r[k.edge * 2 + 3];
        const ux = (bx - ax) / k.len;
        const uy = (by - ay) / k.len;
        const nearA = Math.hypot(ax - k.road.px, ay - k.road.py) <= Math.hypot(bx - k.road.px, by - k.road.py);
        at = nearA ? { x: ax + ux * 1.5, y: ay + uy * 1.5 } : { x: bx - ux * 1.5, y: by - uy * 1.5 };
      }
      const approach = approachFor(world, c, k.edge, at, k.n);
      if (!approach) continue;
      out.push({ id: `s:${c.key}:${k.edge}`, colliderKey: c.key, edge: k.edge, at, normal: k.n, approach, widthM: 1.0, kind: "synthetic", synthetic: true, locked: false, doorType: "", name: c.name, level: null, wheelchair: null });
    }
  }
  return out;
}

/** Drop doors closer than 1.2 m to a higher-ranked one. */
export function mergeDoors(list: Door[]): Door[] {
  const sorted = [...list].sort((a, b) => DOOR_RANK[b.kind] - DOOR_RANK[a.kind] || (a.id < b.id ? -1 : 1));
  const out: Door[] = [];
  for (const d of sorted) if (!out.some((o) => Math.hypot(o.at.x - d.at.x, o.at.y - d.at.y) < 1.2)) out.push(d);
  return out;
}

export function bestDoor(doors: Door[], key: string, from: Vec): Door | null {
  const list = doors.filter((d) => d.colliderKey === key && d.kind !== "exit" && d.kind !== "emergency");
  list.sort((a, b) => Number(a.locked) - Number(b.locked) || DOOR_RANK[b.kind] - DOOR_RANK[a.kind] || Math.hypot(a.approach.x - from.x, a.approach.y - from.y) - Math.hypot(b.approach.x - from.x, b.approach.y - from.y));
  return list[0] ?? null;
}
