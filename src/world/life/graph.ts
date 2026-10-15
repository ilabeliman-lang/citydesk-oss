import type { Deck, LPoi, Streets } from "./parse.ts";


/**
 * NDU-UPG life (#202-lite #203 #214 #215 #248): street graphs in local metres around an origin.
 *   drive: DIRECTED lane edges (oneway respected), right-hand traffic, lane offsets from lanes tags
 *   walk:  undirected edges; footways run on their line, roads get a sidewalk offset each side
 * Pure (no DOM / three), unit tested in graph.test.ts.
 */

export const LANE_M = 3.2;
const M_PER_DEG = 111320;

export type XY = { x: number; y: number };

export type Edge = {
  a: number;
  b: number;
  len: number;
  /** unit direction a -> b (x east, y north) */
  dx: number;
  dy: number;
  /** drive: lanes in this direction; walk: unused (1) */
  lanes: number;
  /** drive: first-lane offset to the right of travel (m); walk: sidewalk offset each side (0 = on the line) */
  off: number;
  /** speed cap m/s */
  vmax: number;
  /** index into Streets.roads (drive / road sidewalks) or -1 */
  road: number;
  cls: string;
  /** NDU realism 02: vertical kind (default "ground") and OSM layer (default 0). */
  deck?: Deck;
  layer?: number;
  /** baked heights (m) every ≤ 10 m along the edge (ground/profile.ts) */
  zs?: Float32Array;
};

export type Graph = {
  lat0: number;
  lng0: number;
  nodes: XY[];
  drive: Edge[];
  /** outgoing drive edges per node */
  out: number[][];
  walk: Edge[];
  /** walk edges touching each node */
  adj: number[][];
  /** traffic-signal nodes */
  signals: Set<number>;
  /** stop and give-way nodes. Same stop line as a red light, and they never turn green. */
  halts: Set<number>;
  /** bus stops snapped to a drive edge: edge -> distance along it (m) */
  stops: Map<number, number[]>;
  pois: (LPoi & XY)[];
  /** NDU realism 02: DEM height per node (m, NaN unknown) and the DEM version it was baked from. */
  nodeZ?: Float32Array;
  zVersion?: number;
};

/** Typical carriageway half-width in metres by class (used for sidewalks and #201 widths). */
export const ROAD_WIDTH_M: Record<string, number> = {
  motorway: 14,
  trunk: 13,
  primary: 12,
  secondary: 10,
  tertiary: 8.5,
  unclassified: 7,
  residential: 7,
  living_street: 5.5,
  service: 4.5,
};

export const roadWidth = (cls: string, lanes: number) =>
  Math.max(ROAD_WIDTH_M[cls.replace(/_link$/, "")] ?? 6, Math.min(lanes, 8) * LANE_M);

export function projector(lat0: number, lng0: number) {
  const kx = M_PER_DEG * (Math.cos((lat0 * Math.PI) / 180) || 1);
  return {
    toXY: (lng: number, lat: number): XY => ({ x: (lng - lng0) * kx, y: (lat - lat0) * M_PER_DEG }),
    toLL: (x: number, y: number): [number, number] => [lng0 + x / kx, lat0 + y / M_PER_DEG],
  };
}

const NO_WALK_SIDEWALK = new Set(["motorway", "motorway_link", "trunk", "trunk_link"]);

export function buildGraph(st: Streets): Graph {
  const { toXY } = projector(st.lat, st.lng);
  const nodes: XY[] = [];
  const index = new Map<string, number>();
  const nodeOf = (p: [number, number]) => {
    const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    let n = index.get(key);
    if (n == null) {
      n = nodes.length;
      index.set(key, n);
      nodes.push(toXY(p[0], p[1]));
    }
    return n;
  };
  const drive: Edge[] = [];
  const walk: Edge[] = [];
  const mk = (a: number, b: number, extra: Omit<Edge, "a" | "b" | "len" | "dx" | "dy">): Edge | null => {
    const ax = nodes[a];
    const bx = nodes[b];
    const len = Math.hypot(bx.x - ax.x, bx.y - ax.y);
    if (len < 0.8) return null;
    return { a, b, len, dx: (bx.x - ax.x) / len, dy: (bx.y - ax.y) / len, ...extra };
  };
  st.roads.forEach((road, ri) => {
    const ids = road.pts.map(nodeOf);
    const vmax = road.maxKmh / 3.6;
    const two = road.oneway === 0;
    const perDir = two ? Math.max(1, Math.floor(road.lanes / 2)) : road.lanes;
    // right-hand traffic: two-way lanes start half a lane right of the centre line; one-way roads are centred
    const off = two ? LANE_M / 2 : -((perDir - 1) * LANE_M) / 2;
    const side = NO_WALK_SIDEWALK.has(road.cls) ? -1 : roadWidth(road.cls, road.lanes) / 2 + 1.4;
    for (let i = 1; i < ids.length; i += 1) {
      const a = ids[i - 1];
      const b = ids[i];
      if (a === b) continue;
      const vert = { deck: road.deck ?? "ground", layer: road.layer ?? 0 };
      const extra = { lanes: perDir, off, vmax, road: ri, cls: road.cls, ...vert };
      if (road.oneway !== -1) {
        const e = mk(a, b, extra);
        if (e) drive.push(e);
      }
      if (road.oneway !== 1) {
        const e = mk(b, a, extra);
        if (e) drive.push(e);
      }
      if (side > 0) {
        const w = mk(a, b, { lanes: 1, off: side, vmax: 1.4, road: ri, cls: road.cls, ...vert });
        if (w) walk.push(w);
      }
    }
  });
  for (const way of st.walks) {
    const ids = way.pts.map(nodeOf);
    for (let i = 1; i < ids.length; i += 1) {
      if (ids[i - 1] === ids[i]) continue;
      const w = mk(ids[i - 1], ids[i], { lanes: 1, off: 0, vmax: way.kind === "steps" ? 0.7 : 1.4, road: -1, cls: way.kind, deck: way.deck ?? (way.kind === "steps" ? "steps" : "ground"), layer: way.layer ?? 0 });
      if (w) walk.push(w);
    }
  }
  const out = nodes.map(() => [] as number[]);
  drive.forEach((e, i) => out[e.a].push(i));
  const adj = nodes.map(() => [] as number[]);
  walk.forEach((e, i) => {
    adj[e.a].push(i);
    adj[e.b].push(i);
  });
  const placed = st.pois.map((p) => ({ ...p, ...toXY(p.lng, p.lat) }));
  const pois = placed.filter((p) => keptOffCarriageway(p, drive, nodes, st.roads));
  const signals = new Set<number>();
  const halts = new Set<number>();
  const stops = new Map<number, number[]>();
  for (const p of pois) {
    if (p.kind === "signal") {
      const n = nearestNode(nodes, p, 12);
      if (n >= 0) signals.add(n);
    } else if (p.kind === "stop" || p.kind === "yield") {
      const n = nearestNode(nodes, p, 12);
      if (n >= 0) halts.add(n);
    } else if (p.kind === "bus") {
      // a stop serves both directions of the nearest carriageway within 25 m
      const hit = nearestEdge(drive, nodes, p, 25);
      if (hit) {
        for (const [i, e] of drive.entries()) {
          if (i === hit.edge || (e.a === drive[hit.edge].b && e.b === drive[hit.edge].a)) {
            const s = i === hit.edge ? hit.s : e.len - hit.s;
            const list = stops.get(i) ?? [];
            list.push(Math.max(2, Math.min(e.len - 2, s)));
            stops.set(i, list);
          }
        }
      }
    }
  }
  return { lat0: st.lat, lng0: st.lng, nodes, drive, out, walk, adj, signals, halts, stops, pois };
}

const ASIDE = new Set(["tree", "board", "cave", "bench", "bin"]);

function keptOffCarriageway(
  p: XY & { kind: string },
  drive: Edge[],
  nodes: XY[],
  roads: Streets["roads"],
): boolean {
  if (!ASIDE.has(p.kind)) return true;
  const hit = nearestEdge(drive, nodes, p, 40);
  if (!hit) return true;
  const road = roads[drive[hit.edge].road];
  if (!road) return true;
  const half = roadWidth(road.cls, road.lanes) / 2;
  const sidewalk = p.kind === "bench" || p.kind === "bin" ? 0.3 : p.kind === "cave" ? 0 : 1.5;
  const clearance = road.deck === "bridge" ? half + 0.4 : half + sidewalk;
  return hit.dist >= clearance;
}

function nearestNode(nodes: XY[], p: XY, maxM: number): number {
  let best = -1;
  let bestD = maxM;
  nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Closest point on any edge (projection) within maxM, or null. */
export function nearestEdge(edges: Edge[], nodes: XY[], p: XY, maxM: number): { edge: number; s: number; dist: number } | null {
  let best: { edge: number; s: number; dist: number } | null = null;
  edges.forEach((e, i) => {
    const a = nodes[e.a];
    const t = Math.max(0, Math.min(e.len, (p.x - a.x) * e.dx + (p.y - a.y) * e.dy));
    const d = Math.hypot(a.x + e.dx * t - p.x, a.y + e.dy * t - p.y);
    if (d <= maxM && (!best || d < best.dist)) best = { edge: i, s: t, dist: d };
  });
  return best;
}

/** Point `s` metres along edge, shifted `lateral` metres to the right of the edge direction. */
export function along(g: Graph, e: Edge, s: number, lateral: number): XY {
  const a = g.nodes[e.a];
  return { x: a.x + e.dx * s + e.dy * lateral, y: a.y + e.dy * s - e.dx * lateral };
}

/** Lane offset (m, right of travel) for lane index `lane` on a drive edge. */
export function laneOffset(e: Edge, lane: number): number {
  return e.off + Math.min(lane, e.lanes - 1) * LANE_M;
}

/** Compass heading (radians, clockwise from north) of a direction. */
export const headingOf = (dx: number, dy: number) => Math.atan2(dx, dy);

/** Choose the next drive edge at the end of `from` (never a U-turn unless it is a dead end). */
export function nextDrive(g: Graph, from: number, rnd: () => number): number {
  const e = g.drive[from];
  const options = g.out[e.b].filter((i) => g.drive[i].b !== e.a);
  if (!options.length) {
    const back = g.out[e.b].find((i) => g.drive[i].b === e.a);
    return back ?? -1;
  }
  // prefer going straight-ish, with some randomness
  const weights = options.map((i) => {
    const n = g.drive[i];
    const dot = n.dx * e.dx + n.dy * e.dy;
    return Math.max(0.15, 0.6 + dot);
  });
  return options[pick(weights, rnd)];
}

/** Next walk edge at node `at` arriving on edge `from`; returns [edge, dir]. */
export function nextWalk(g: Graph, from: number, at: number, rnd: () => number): [number, 1 | -1] {
  const options = g.adj[at].filter((i) => i !== from);
  const list = options.length ? options : [from];
  const i = list[Math.floor(rnd() * list.length) % list.length];
  return [i, g.walk[i].a === at ? 1 : -1];
}

export function pick(weights: number[], rnd: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** Seeded RNG (mulberry32) so a ward's street life is reproducible (#239). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
