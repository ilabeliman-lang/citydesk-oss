import { DRIVABLE, KIND_DEFAULTS, WALKABLE, hashSeed, kelvinFor, lampHeightForRoad, roadWidthFor, treeSize } from "./dimensions.ts";
import { alongLine, lineLength, nearestOnLine, norm360, offsetFor, pointInRing, projAt, ringArea, bearingOf } from "./geo.ts";
import type { Parsed } from "./parse.ts";
import type { PropKind, PropRecord } from "./types.ts";

/**
 * NDU-UPG props: deterministic inference (PLAN §4.4) on top of what OSM maps:
 *  1 lamps on lit roads · 2 (opt-in, default OFF) lamps on unlit primaries · 3 tree rows · 4 park scatter
 *  5 street-parking / car-park slots (occupancy is decided client-side) · 6 exclusions + dedupe + cap.
 * Pure, alias-free; the same input always yields the same output.
 */

export type InferOpts = { unlitRoads: boolean; maxProps?: number };
export type BuildingRings = { rings: number[][][] }[];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Negative stable id for an inferred item. */
export const inferredId = (wayId: number, i: number) => -((hashSeed(`${wayId}:${i}`) % 2147483646) + 1);

const BUCKET: Record<PropKind, number> = {
  lamp: 1, utility_pole: 1, traffic_signals: 2, stop_sign: 2, give_way_sign: 2, traffic_sign: 2, bus_stop: 3, bench: 4,
  tree: 5, parked_car: 6, waste_basket: 7, recycling: 7, fire_hydrant: 7, post_box: 7, bollard: 7, street_cabinet: 7, standpipe: 7, food_stall: 7,
};
/** Server cap priority (§7.2): lamps > signals > trees > benches > kit. Lower = kept first. */
const PRIORITY: Record<PropKind, number> = {
  lamp: 0, traffic_signals: 1, stop_sign: 2, give_way_sign: 2, traffic_sign: 3, bus_stop: 2, tree: 4, bench: 5, utility_pole: 5,
  parked_car: 7, waste_basket: 6, recycling: 6, fire_hydrant: 6, post_box: 6, bollard: 6, street_cabinet: 6, standpipe: 6, food_stall: 6,
};

const WALL_MOUNTED = new Set(["lamp_wall", "hydrant_wall"]);

/** Simple uniform grid for neighbour queries in local metres. */
class Grid {
  private cells = new Map<string, [number, number][]>();
  private size: number;
  constructor(size: number) {
    this.size = size;
  }
  private key(x: number, y: number) {
    return `${Math.floor(x / this.size)}:${Math.floor(y / this.size)}`;
  }
  add(x: number, y: number) {
    const k = this.key(x, y);
    const l = this.cells.get(k);
    if (l) l.push([x, y]);
    else this.cells.set(k, [[x, y]]);
  }
  near(x: number, y: number, r: number): boolean {
    const cx = Math.floor(x / this.size);
    const cy = Math.floor(y / this.size);
    const span = Math.ceil(r / this.size);
    for (let i = -span; i <= span; i += 1)
      for (let j = -span; j <= span; j += 1) {
        const l = this.cells.get(`${cx + i}:${cy + j}`);
        if (l) for (const [px, py] of l) if ((px - x) ** 2 + (py - y) ** 2 < r * r) return true;
      }
    return false;
  }
}

export function inferProps(parsed: Parsed, buildings: BuildingRings, opts: InferOpts): PropRecord[] {
  const [lng0, lat0] = parsed.origin;
  const proj = projAt(lng0, lat0);
  const zone = parsed.zone;
  // building outer rings in local metres + bbox for a cheap reject
  const blds = buildings
    .map((b) => b.rings[0])
    .filter((r) => r && r.length >= 3)
    .map((r) => {
      const xy = r.map(([a, b]) => proj.toXY(a, b));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of xy) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      return { xy, x0, y0, x1, y1 };
    });
  const inBuilding = (x: number, y: number) => blds.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && pointInRing(x, y, b.xy));

  const out: PropRecord[] = [];
  const osmLamps = new Grid(25);
  const lampTagged = parsed.records.some((r) => r.kind === "lamp");
  for (const r of parsed.records) {
    const [x, y] = proj.toXY(r.lng, r.lat);
    if (!WALL_MOUNTED.has(r.archetype) && inBuilding(x, y)) continue; // §7.5
    if (r.kind === "lamp") osmLamps.add(x, y);
    out.push(r);
  }

  const mk = (kind: PropKind, archetype: string, id: number, x: number, y: number, yaw: number, extra: Partial<PropRecord> = {}): PropRecord => {
    const [lng, lat] = proj.toLL(x, y);
    const [w, d, h] = KIND_DEFAULTS[kind];
    return { kind, archetype, osmId: id, osmType: "x", lng, lat, heightM: h, widthM: w, depthM: d, yawDeg: Math.round(norm360(yaw) * 10) / 10, src: "inferred", variant: hashSeed(`v${id}`) % 8, ...extra };
  };

  // 1 + 2: lamps along roads
  const anyLit = parsed.ways.some((w) => w.lit === true);
  const unlitMode = opts.unlitRoads && !lampTagged && !anyLit;
  const walkXY: [number, number][][] = [];
  for (const w of parsed.ways) {
    const xy = w.pts.map(([a, b]) => proj.toXY(a, b));
    if (WALKABLE.test(w.cls)) walkXY.push(xy);
    const drivable = DRIVABLE.test(w.cls);
    let low = false;
    if (w.lit !== true) {
      if (!(unlitMode && /^(primary|secondary)/.test(w.cls))) continue;
      low = true;
    }
    if (!drivable && !WALKABLE.test(w.cls)) continue;
    const H = lampHeightForRoad(w.cls);
    const spacing = low ? 40 : Math.min(45, Math.max(18, 3.5 * H));
    const half = drivable ? roadWidthFor(w.cls) / 2 + 0.6 : 1.2;
    const L = lineLength(xy);
    const alternate = drivable && w.lanes >= 2;
    let i = 0;
    for (let s = spacing / 2; s < L; s += spacing, i += 1) {
      const at = alongLine(xy, s);
      if (!at) break;
      const side = alternate && i % 2 ? -1 : 1;
      const [ox, oy] = offsetFor(norm360(at.bearing + 90 * side), half);
      const x = at.x + ox;
      const y = at.y + oy;
      if (osmLamps.near(x, y, 20) || inBuilding(x, y)) continue;
      out.push(
        mk("lamp", drivable ? "lamp_bent" : "lamp_post_top", inferredId(w.id, i), x, y, at.bearing - 90 * side, {
          heightM: H,
          lit: true,
          lowConfidence: low || undefined,
          lamp: { kelvin: kelvinFor(w.tags, zone), mount: drivable ? "bent_mast" : "straight_mast", count: 1, schedule: "dusk_dawn" },
        }),
      );
    }
  }

  // tree occupancy grid (OSM trees first)
  const trees = new Grid(10);
  for (const r of out) if (r.kind === "tree") trees.add(...proj.toXY(r.lng, r.lat));
  const tree = (id: number, x: number, y: number, tags: Record<string, string>) => {
    const ts = treeSize(tags, id, zone);
    trees.add(x, y);
    return mk("tree", `crown_${ts.shape}`, id, x, y, (hashSeed(`y${id}`) % 360), {
      heightM: ts.heightM,
      widthM: ts.crownM,
      depthM: ts.crownM,
      tree: { genus: ts.genus, leaf: ts.leaf, crownM: ts.crownM, crownShape: ts.shape, trunkM: ts.trunkM },
    });
  };

  // 3: tree rows at 8 m ± 1.5 m
  for (const row of parsed.rows) {
    const xy = row.pts.map(([a, b]) => proj.toXY(a, b));
    const L = lineLength(xy);
    const rnd = mulberry32(hashSeed(`row${row.id}`));
    let i = 0;
    for (let s = 4 + (rnd() - 0.5) * 3; s < L; s += 8 + (rnd() - 0.5) * 3, i += 1) {
      const at = alongLine(xy, s);
      if (!at || inBuilding(at.x, at.y) || trees.near(at.x, at.y, 3)) continue;
      out.push(tree(inferredId(row.id, i), at.x, at.y, row.tags));
    }
  }

  // 4: park scatter, Poisson-disk r = 9 m, 60/ha × 0.35, areas < 5 ha, 3 m clear of paths
  const R = 9;
  for (const a of parsed.areas) {
    if (a.kind === "parking") continue;
    const ring = a.ring.map(([p, q]) => proj.toXY(p, q));
    const area = ringArea(ring);
    if (area <= 0 || area > 50_000) continue;
    const want = Math.floor((area / 10_000) * 60 * 0.35);
    if (want <= 0) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const rnd = mulberry32(hashSeed(`park${a.id}`));
    let placed = 0;
    for (let tries = 0; tries < want * 30 && placed < want; tries += 1) {
      const x = x0 + rnd() * (x1 - x0);
      const y = y0 + rnd() * (y1 - y0);
      if (!pointInRing(x, y, ring) || trees.near(x, y, R) || inBuilding(x, y)) continue;
      if (walkXY.some((l) => (nearestOnLine(x, y, l)?.d ?? Infinity) < 3)) continue;
      out.push(tree(inferredId(a.id, tries), x, y, a.tags));
      placed += 1;
    }
  }

  // 5: street parking slots + surface car-park stalls (occupancy is client-side)
  for (const w of parsed.ways) {
    if (!DRIVABLE.test(w.cls)) continue;
    const t = w.tags;
    const sides: (1 | -1)[] = [];
    const ok = (v?: string) => v != null && /^(lane|street_side|on_kerb|half_on_kerb|yes)$/.test(v);
    if (ok(t["parking:both"]) || ok(t["parking:lane:both"])) sides.push(1, -1);
    else {
      if (ok(t["parking:right"]) || ok(t["parking:lane:right"])) sides.push(1);
      if (ok(t["parking:left"]) || ok(t["parking:lane:left"])) sides.push(-1);
    }
    if (!sides.length) continue;
    const xy = w.pts.map(([a, b]) => proj.toXY(a, b));
    const L = lineLength(xy);
    const half = roadWidthFor(w.cls) / 2 - 1.1;
    for (const side of sides) {
      const orient = t[`parking:${side === 1 ? "right" : "left"}:orientation`] ?? t["parking:both:orientation"] ?? "parallel";
      const slot = orient === "parallel" ? 5.5 : 2.5;
      let i = 0;
      for (let s = slot; s < L - slot; s += slot, i += 1) {
        const at = alongLine(xy, s);
        if (!at) break;
        const [ox, oy] = offsetFor(norm360(at.bearing + 90 * side), half);
        const x = at.x + ox;
        const y = at.y + oy;
        if (inBuilding(x, y)) continue;
        const yaw = orient === "parallel" ? at.bearing + (side === 1 ? 0 : 180) : at.bearing + 90 * side;
        out.push(mk("parked_car", "car", inferredId(w.id * 2 + (side === 1 ? 0 : 1), i), x, y, yaw));
      }
    }
  }
  for (const a of parsed.areas) {
    if (a.kind !== "parking" || (a.tags.parking && a.tags.parking !== "surface")) continue;
    const ring = a.ring.map(([p, q]) => proj.toXY(p, q));
    if (ringArea(ring) > 20_000) continue;
    // align the stall grid to the longest edge
    let best = 0, ang = 0;
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const L = Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
      if (L > best) {
        best = L;
        ang = bearingOf(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
      }
    }
    const rad = (ang * Math.PI) / 180;
    const ux = Math.sin(rad), uy = Math.cos(rad); // along rows
    const vx = uy, vy = -ux; // across
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    let i = 0;
    for (let v = -150; v <= 150; v += 6.5) // 5 m stall + aisle share
      for (let u = -150; u <= 150; u += 2.5) {
        const x = cx + ux * u + vx * v;
        const y = cy + uy * u + vy * v;
        if (!pointInRing(x, y, ring) || inBuilding(x, y)) continue;
        out.push(mk("parked_car", "car", inferredId(a.id, i++), x, y, ang + 90));
      }
  }

  // 6: dedupe within 0.5 m per bucket, then cap by priority
  const seen = new Map<number, Grid>();
  const deduped: PropRecord[] = [];
  for (const r of out) {
    const b = BUCKET[r.kind];
    let g = seen.get(b);
    if (!g) seen.set(b, (g = new Grid(2)));
    const [x, y] = proj.toXY(r.lng, r.lat);
    // multi-head signals and bus-stop children share a node: dedupe only true duplicates
    if (g.near(x, y, 0.5) && r.kind !== "traffic_signals") continue;
    g.add(x, y);
    deduped.push(r);
  }
  const cap = opts.maxProps ?? 4000;
  if (deduped.length <= cap) return deduped;
  return deduped
    .map((r, i) => ({ r, i }))
    .sort((a, b) => PRIORITY[a.r.kind] - PRIORITY[b.r.kind] || a.i - b.i)
    .slice(0, cap)
    .sort((a, b) => a.i - b.i)
    .map((e) => e.r);
}
