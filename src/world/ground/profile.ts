import type { Edge, Graph } from "../life/graph.ts";
import type { HeightSample } from "./types.ts";

/**
 * NDU realism 02 T5: bake DEM heights onto the street graph (PLAN §5.3). Pure.
 *   nodeZ   DEM height per node (NaN = unknown)
 *   zs      samples every ≤ 10 m on edges > 12 m, corrected so their ends meet the smoothed nodes
 *   smooth  median (≤ 12 m) then Gaussian (σ = 8 m) over nodes joined by ground edges; dead ends,
 *           deck abutments and steps keep their raw DEM height
 */

export const SIGMA_M = 8;
const STEP_M = 10;
const LONG_M = 12;

const isGround = (e: Edge) => (e.deck ?? "ground") === "ground" || e.deck === "passage";

export function bakeGraph(
  g: Graph,
  sample: (lng: number, lat: number) => HeightSample,
  toLL: (x: number, y: number) => [number, number],
  version = 0,
): { ms: number; unknown: number } {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const n = g.nodes.length;
  const raw = new Float32Array(n);
  let unknown = 0;
  for (let i = 0; i < n; i += 1) {
    const [lng, lat] = toLL(g.nodes[i].x, g.nodes[i].y);
    const s = sample(lng, lat);
    raw[i] = s.ok && Number.isFinite(s.h) ? s.h : NaN;
    if (!Number.isFinite(raw[i])) unknown += 1;
  }
  // ground adjacency (undirected) with edge lengths
  const nb: { to: number; len: number }[][] = Array.from({ length: n }, () => []);
  const pinned = new Uint8Array(n);
  for (const e of [...g.drive, ...g.walk]) {
    if (isGround(e) && e.cls !== "steps") {
      if (!nb[e.a].some((q) => q.to === e.b)) {
        nb[e.a].push({ to: e.b, len: e.len });
        nb[e.b].push({ to: e.a, len: e.len });
      }
    } else {
      pinned[e.a] = 1;
      pinned[e.b] = 1;
    }
  }
  const within = (start: number, maxM: number) => {
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const u = queue.shift() as number;
      const du = dist.get(u) as number;
      for (const { to, len } of nb[u]) {
        const d = du + len;
        if (d > maxM) continue;
        const old = dist.get(to);
        if (old === undefined || d < old) {
          dist.set(to, d);
          queue.push(to);
        }
      }
    }
    return dist;
  };
  const fixed = (i: number) => pinned[i] === 1 || nb[i].length < 2 || !Number.isFinite(raw[i]);
  const med = new Float32Array(raw);
  for (let i = 0; i < n; i += 1) {
    if (fixed(i)) continue;
    const vals = [...within(i, 12).keys()].map((j) => raw[j]).filter(Number.isFinite).sort((a, b) => a - b);
    if (vals.length >= 3) med[i] = vals[Math.floor(vals.length / 2)];
  }
  const out = new Float32Array(med);
  for (let i = 0; i < n; i += 1) {
    if (fixed(i)) continue;
    let sw = 0;
    let sz = 0;
    for (const [j, d] of within(i, 3 * SIGMA_M)) {
      if (!Number.isFinite(med[j])) continue;
      const w = Math.exp(-(d * d) / (2 * SIGMA_M * SIGMA_M));
      sw += w;
      sz += w * med[j];
    }
    if (sw > 0) out[i] = sz / sw;
  }
  // decks: interior nodes that only touch bridge (or tunnel) edges relax to the line between their
  // abutments (Laplace, ≤ 20 passes); bridges stay ≥ dem + 0.5 m, tunnels ≤ dem − 3 m (PLAN §5.4 lite)
  const deckNb: { to: number }[][] = Array.from({ length: n }, () => []);
  const kind = new Array<string | null>(n).fill(null);
  const touchesGround = new Uint8Array(n);
  for (const e of [...g.drive, ...g.walk]) {
    const d = e.deck ?? "ground";
    if (d === "bridge" || d === "tunnel") {
      deckNb[e.a].push({ to: e.b });
      deckNb[e.b].push({ to: e.a });
      kind[e.a] = kind[e.a] ?? d;
      kind[e.b] = kind[e.b] ?? d;
    } else {
      touchesGround[e.a] = 1;
      touchesGround[e.b] = 1;
    }
  }
  const interior: number[] = [];
  for (let i = 0; i < n; i += 1) if (kind[i] && !touchesGround[i] && deckNb[i].length >= 2) interior.push(i);
  if (interior.length) {
    for (let pass = 0; pass < 20; pass += 1) {
      for (const i of interior) {
        let s = 0;
        let c = 0;
        for (const { to } of deckNb[i])
          if (Number.isFinite(out[to])) {
            s += out[to];
            c += 1;
          }
        if (c) out[i] = s / c;
      }
    }
    for (const i of interior) {
      if (!Number.isFinite(raw[i]) || !Number.isFinite(out[i])) continue;
      out[i] = kind[i] === "bridge" ? Math.max(out[i], raw[i] + 0.5) : Math.min(out[i], raw[i] - 3);
    }
  }
  g.nodeZ = out;
  for (const e of [...g.drive, ...g.walk]) {
    e.zs = undefined;
    if (e.len <= LONG_M) continue;
    const k = Math.ceil(e.len / STEP_M);
    const zs = new Float32Array(k + 1);
    const a = g.nodes[e.a];
    const za = out[e.a];
    const zb = out[e.b];
    const ra = raw[e.a];
    const rb = raw[e.b];
    let good = Number.isFinite(za) && Number.isFinite(zb);
    for (let i = 0; i <= k && good; i += 1) {
      const t = i / k;
      const s = e.len * t;
      const [lng, lat] = toLL(a.x + e.dx * s, a.y + e.dy * s);
      const h = sample(lng, lat);
      if (!h.ok || !Number.isFinite(h.h)) {
        good = false;
        break;
      }
      // shift the raw profile so its ends meet the smoothed node heights
      const corr = Number.isFinite(ra) && Number.isFinite(rb) ? (za - ra) * (1 - t) + (zb - rb) * t : 0;
      zs[i] = h.h + corr;
    }
    if (good && isGround(e) && e.cls !== "steps") e.zs = zs;
  }
  g.zVersion = version;
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { ms: t1 - t0, unknown };
}

/** Height (m) `s` metres along edge e: lerp over zs, else nodeZ a → b; NaN when unbaked. */
export function alongZ(g: Graph, e: Edge, s: number): number {
  const nz = g.nodeZ;
  if (!nz) return NaN;
  const t = e.len > 0 ? Math.max(0, Math.min(1, s / e.len)) : 0;
  const zs = e.zs;
  if (zs && zs.length > 1) {
    const f = t * (zs.length - 1);
    const i = Math.min(zs.length - 2, Math.floor(f));
    return zs[i] + (zs[i + 1] - zs[i]) * (f - i);
  }
  return nz[e.a] + (nz[e.b] - nz[e.a]) * t;
}
