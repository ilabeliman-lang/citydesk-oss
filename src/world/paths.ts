import { createServerFn } from "@tanstack/react-start";
import { overpassFetch } from "@/world/overpass";

export type Pt = { lat: number; lng: number };
export type Way = { points: Pt[]; name: string; kind: string };

type Vert = { x: number; y: number };
type Seg = { a: number; b: number; len: number };

export type Net = {
  lat0: number;
  lng0: number;
  xy: Vert[];
  ll: Pt[];
  seg: Seg[];
  adj: number[][];
  name?: string[];
  kind?: string[];
};

export type Pose = { seg: number; t: number; dir: 1 | -1 };

const cos = (lat: number) => Math.cos((lat * Math.PI) / 180) || 1;

function thin(points: Pt[]) {
  if (points.length <= 20) return points;
  const step = Math.ceil(points.length / 20);
  const kept = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

export const openPaths = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<Pt[][]> => {
    const query = `[out:json][timeout:18];way["highway"~"^(footway|path|pedestrian|living_street|residential|unclassified|service|tertiary|secondary|primary|track|steps|cycleway)$"]["access"!~"^(private|no)$"]["foot"!~"^(no|private)$"](around:700,${data.lat},${data.lng});out geom 48;`;
    try {
      const body = await overpassFetch<{
        elements?: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[];
      }>(query);
      const lines: Pt[][] = [];
      for (const el of body?.elements ?? []) {
        const tags = el.tags ?? {};
        if (["construction", "proposed", "abandoned", "razed"].includes(tags.highway ?? "")) continue;
        if (["private", "no"].includes(tags.access ?? "")) continue;
        if (["no", "private"].includes(tags.foot ?? "")) continue;
        const points = thin(
          (el.geometry ?? [])
            .map((point) => ({ lat: point.lat, lng: point.lon }))
            .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
        );
        if (points.length < 2) continue;
        lines.push(points);
        if (lines.length >= 36) break;
      }
      return lines;
    } catch {
      return [];
    }
  });

export function buildNet(lines: Pt[][]): Net | null {
  return buildGraph(lines.map((points) => ({ points, name: "", kind: "" })));
}

export function buildWays(ways: Way[]): Net | null {
  return buildGraph(ways);
}

function buildGraph(lines: { points: Pt[]; name: string; kind: string }[]): Net | null {
  if (!lines.length || !lines[0]?.points[0]) return null;
  const lat0 = lines[0].points[0].lat;
  const lng0 = lines[0].points[0].lng;
  const toX = (p: Pt) => (p.lng - lng0) * 111320 * cos(lat0);
  const toY = (p: Pt) => (p.lat - lat0) * 111320;
  const index = new Map<string, number>();
  const xy: Vert[] = [];
  const ll: Pt[] = [];
  const idOf = (p: Pt) => {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const found = index.get(key);
    if (found != null) return found;
    const n = xy.length;
    index.set(key, n);
    xy.push({ x: toX(p), y: toY(p) });
    ll.push(p);
    return n;
  };
  const seg: Seg[] = [];
  const name: string[] = [];
  const kind: string[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.points.length; i += 1) {
      const a = idOf(line.points[i - 1]);
      const b = idOf(line.points[i]);
      if (a === b) continue;
      const len = Math.hypot(xy[b].x - xy[a].x, xy[b].y - xy[a].y);
      if (len < 1.2) continue;
      seg.push({ a, b, len });
      name.push(line.name);
      kind.push(line.kind);
    }
  }
  if (!seg.length) return null;
  const adj = xy.map(() => [] as number[]);
  seg.forEach((piece, i) => {
    adj[piece.a].push(i);
    adj[piece.b].push(i);
  });
  return { lat0, lng0, xy, ll, seg, adj, name, kind };
}

export function posePoint(net: Net, pose: Pose): Pt {
  const piece = net.seg[pose.seg];
  const a = net.xy[piece.a];
  const b = net.xy[piece.b];
  const x = a.x + (b.x - a.x) * pose.t;
  const y = a.y + (b.y - a.y) * pose.t;
  return { lat: net.lat0 + y / 111320, lng: net.lng0 + x / (111320 * cos(net.lat0)) };
}

export function poseBearing(net: Net, pose: Pose) {
  const piece = net.seg[pose.seg];
  const from = pose.dir === 1 ? net.ll[piece.a] : net.ll[piece.b];
  const to = pose.dir === 1 ? net.ll[piece.b] : net.ll[piece.a];
  const east = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  const north = to.lat - from.lat;
  return (Math.atan2(east, north) * 180) / Math.PI;
}

function project(net: Net, lat: number, lng: number) {
  const x = (lng - net.lng0) * 111320 * cos(net.lat0);
  const y = (lat - net.lat0) * 111320;
  let best = { seg: 0, t: 0, dist: Infinity };
  net.seg.forEach((piece, i) => {
    const a = net.xy[piece.a];
    const b = net.xy[piece.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
    if (dist < best.dist) best = { seg: i, t, dist };
  });
  return best;
}

export function snapPoint(net: Net, lat: number, lng: number, maxM = 40): Pt | null {
  const pose = snapPose(net, lat, lng, maxM);
  return pose ? posePoint(net, pose) : null;
}

export function snapPose(net: Net, lat: number, lng: number, maxM = 45): Pose | null {
  const hit = project(net, lat, lng);
  if (hit.dist > maxM) return null;
  return { seg: hit.seg, t: hit.t, dir: 1 };
}

function facing(net: Net, pose: Pose) {
  const piece = net.seg[pose.seg];
  const a = net.xy[piece.a];
  const b = net.xy[piece.b];
  const dx = (b.x - a.x) / piece.len;
  const dy = (b.y - a.y) / piece.len;
  return pose.dir === 1 ? { x: dx, y: dy } : { x: -dx, y: -dy };
}

function pickNext(net: Net, from: number, incoming: number, desire: { x: number; y: number }) {
  let best: { seg: number; dir: 1 | -1; score: number } | null = null;
  for (const index of net.adj[from] ?? []) {
    if (index === incoming && (net.adj[from]?.length ?? 0) > 1) continue;
    const piece = net.seg[index];
    const forward = piece.a === from;
    const a = net.xy[forward ? piece.a : piece.b];
    const b = net.xy[forward ? piece.b : piece.a];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const score = ((b.x - a.x) / len) * desire.x + ((b.y - a.y) / len) * desire.y;
    if (!best || score > best.score) best = { seg: index, dir: forward ? 1 : -1, score };
  }
  if (!best || best.score < 0.12) return null;
  return { seg: best.seg, dir: best.dir };
}

export function walkPose(net: Net, pose: Pose, east: number, north: number, meters: number): Pose {
  const mag = Math.hypot(east, north) || 1;
  const desire = { x: east / mag, y: north / mag };
  const ahead = facing(net, pose);
  const dot = ahead.x * desire.x + ahead.y * desire.y;
  let dir = pose.dir;
  let left = 0;
  if (dot > 0.2) left = meters * dot;
  else if (dot < -0.2) {
    dir = dir === 1 ? -1 : 1;
    left = meters * -dot;
  } else return pose;
  let seg = pose.seg;
  let t = pose.t;
  for (let guard = 0; guard < 6 && left > 0.08; guard += 1) {
    const piece = net.seg[seg];
    const room = dir === 1 ? (1 - t) * piece.len : t * piece.len;
    if (left <= room + 0.02) {
      t = Math.max(0, Math.min(1, t + dir * (left / piece.len)));
      return { seg, t, dir };
    }
    left -= room;
    const vert = dir === 1 ? piece.b : piece.a;
    const next = pickNext(net, vert, seg, desire);
    if (!next) return { seg, t: dir === 1 ? 1 : 0, dir };
    seg = next.seg;
    dir = next.dir;
    t = dir === 1 ? 0 : 1;
  }
  return { seg, t, dir };
}

export function cruise(net: Net, pose: Pose, meters: number): Pose {
  const ahead = facing(net, pose);
  return walkPose(net, pose, ahead.x, ahead.y, meters);
}

export function roadDistance(net: Net, lat: number, lng: number) {
  return project(net, lat, lng).dist;
}

function vertPoint(net: Net, v: number): Pt {
  const p = net.xy[v];
  return { lat: net.lat0 + p.y / 111320, lng: net.lng0 + p.x / (111320 * cos(net.lat0)) };
}

export function netRoute(net: Net, from: Pose, to: Pose): Pt[] | null {
  if (from.seg === to.seg) return [posePoint(net, from), posePoint(net, to)];
  const n = net.xy.length;
  const start = n;
  const goal = n + 1;
  const fs = net.seg[from.seg];
  const gs = net.seg[to.seg];
  const dist = new Float64Array(n + 2).fill(Infinity);
  const prev = new Int32Array(n + 2).fill(-1);
  const done = new Uint8Array(n + 2);
  const edges = (v: number): [number, number][] => {
    if (v === start) return [[fs.a, from.t * fs.len], [fs.b, (1 - from.t) * fs.len]];
    const out: [number, number][] = [];
    for (const i of net.adj[v] ?? []) {
      const piece = net.seg[i];
      out.push([piece.a === v ? piece.b : piece.a, piece.len]);
    }
    if (v === gs.a) out.push([goal, to.t * gs.len]);
    if (v === gs.b) out.push([goal, (1 - to.t) * gs.len]);
    return out;
  };
  dist[start] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n + 2; i += 1) {
      if (!done[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === goal) break;
    done[u] = 1;
    for (const [v, w] of edges(u)) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  if (!Number.isFinite(dist[goal])) return null;
  const chain: number[] = [];
  for (let v = prev[goal]; v !== -1 && v !== start; v = prev[v]) chain.push(v);
  chain.reverse();
  return [posePoint(net, from), ...chain.map((v) => vertPoint(net, v)), posePoint(net, to)];
}

export type Ring = Pt[];

export const openBlocks = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<Ring[]> => {
    const query = `[out:json][timeout:18];way["building"](around:420,${data.lat},${data.lng});out geom 40;`;
    try {
      const body = await overpassFetch<{ elements?: { geometry?: { lat: number; lon: number }[] }[] }>(query);
      const rings: Ring[] = [];
      for (const el of body?.elements ?? []) {
        const ring = (el.geometry ?? [])
          .map((point) => ({ lat: point.lat, lng: point.lon }))
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
        if (ring.length >= 4) rings.push(ring);
        if (rings.length >= 40) break;
      }
      return rings;
    } catch {
      return [];
    }
  });

export function insideBlock(rings: Ring[], lat: number, lng: number) {
  return rings.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i].lat;
      const xi = ring[i].lng;
      const yj = ring[j].lat;
      const xj = ring[j].lng;
      const cross = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
      if (cross) inside = !inside;
    }
    return inside;
  });
}

export function clearPose(net: Net, pose: Pose, rings: Ring[]): Pose | null {
  let next = pose;
  for (let step = 0; step < 12; step += 1) {
    const spot = posePoint(net, next);
    if (!insideBlock(rings, spot.lat, spot.lng)) return next;
    next = cruise(net, next, 14);
  }
  return null;
}

const WARD_KEY = "ndu-ward-roads";

function wardNear(aLat: number, aLng: number, bLat: number, bLng: number) {
  const north = (aLat - bLat) * 111320;
  const east = (aLng - bLng) * 111320 * cos(aLat);
  return Math.hypot(north, east) <= 250;
}

export function readWard(lat: number, lng: number): Way[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(WARD_KEY) || "") as {
      lat?: number;
      lng?: number;
      until?: number;
      ways?: Way[];
    };
    if (typeof raw.until !== "number" || raw.until < Date.now()) return null;
    if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
    if (!wardNear(lat, lng, raw.lat, raw.lng)) return null;
    if (!Array.isArray(raw.ways)) return null;
    const ways = raw.ways.filter(
      (way) => way && Array.isArray(way.points) && way.points.length >= 2 && way.points.every((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng)),
    );
    return ways.length ? ways : null;
  } catch {
    return null;
  }
}

export function writeWard(lat: number, lng: number, ways: Way[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WARD_KEY, JSON.stringify({ lat, lng, until: Date.now() + 60 * 60 * 1000, ways }));
  } catch {
    return;
  }
}

export async function fetchWays(lat: number, lng: number, radius: number): Promise<Way[]> {
  const query = `[out:json][timeout:18];way["highway"~"^(footway|path|pedestrian|living_street|residential|unclassified|service|tertiary|secondary|primary|track|steps|cycleway)$"]["access"!~"^(private|no)$"]["foot"!~"^(no|private)$"](around:${radius},${lat},${lng});out geom 48;`;
  const body = await overpassFetch<{
    elements?: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[];
  }>(query);
  const ways: Way[] = [];
  for (const el of body?.elements ?? []) {
    const tags = el.tags ?? {};
    if (["construction", "proposed", "abandoned", "razed"].includes(tags.highway ?? "")) continue;
    if (["private", "no"].includes(tags.access ?? "")) continue;
    if (["no", "private"].includes(tags.foot ?? "")) continue;
    const points = thin(
      (el.geometry ?? [])
        .map((point) => ({ lat: point.lat, lng: point.lon }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    );
    if (points.length < 2) continue;
    ways.push({ points, name: tags.name ?? "", kind: tags.highway ?? "" });
    if (ways.length >= 36) break;
  }
  return ways;
}

export const openWays = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<Way[]> => {
    try {
      let ways = await fetchWays(data.lat, data.lng, 700);
      if (ways.length < 4) {
        const tighter = await fetchWays(data.lat, data.lng, 280);
        if (tighter.length > ways.length) ways = tighter;
      }
      return ways;
    } catch {
      return [];
    }
  });

export function wayLabel(net: Net, pose: Pose): { name: string; kind: string; dead: boolean } {
  const piece = net.seg[pose.seg];
  const name = net.name?.[pose.seg] ?? "";
  const kind = net.kind?.[pose.seg] ?? "";
  if (!piece) return { name, kind, dead: false };
  const ahead = pose.dir === 1 ? piece.b : piece.a;
  return { name, kind, dead: (net.adj[ahead]?.length ?? 0) <= 1 };
}

export function pace(kind: string): number {
  if (kind === "steps" || kind === "path") return 0.62;
  if (kind === "residential" || kind === "living_street" || kind === "unclassified" || kind === "service") return 1.12;
  if (kind === "primary" || kind === "secondary" || kind === "tertiary") return 1.2;
  return 1;
}

export function traceGoal(net: Net, pose: Pose, lat: number, lng: number): Pt[] {
  const out: Pt[] = [posePoint(net, pose)];
  let cursor = pose;
  for (let step = 0; step < 24; step += 1) {
    const here = posePoint(net, cursor);
    const north = (lat - here.lat) * 111320;
    const east = (lng - here.lng) * 111320 * cos(here.lat);
    const dist = Math.hypot(north, east);
    if (dist < 6) break;
    const next = walkPose(net, cursor, east, north, Math.min(40, dist));
    if (next.seg === cursor.seg && Math.abs(next.t - cursor.t) < 0.001 && next.dir === cursor.dir) break;
    cursor = next;
    const spot = posePoint(net, cursor);
    const prev = out[out.length - 1];
    if (Math.hypot((spot.lat - prev.lat) * 111320, (spot.lng - prev.lng) * 111320 * cos(spot.lat)) > 0.4) out.push(spot);
  }
  return out;
}

export function seedUnit(lat: number, lng: number): () => number {
  let state = (Math.round(lat * 1000) ^ Math.round(lng * 1000)) >>> 0;
  if (state === 0) state = 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}


