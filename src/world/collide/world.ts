import { makeFrame, toXY } from "./enu.ts";
import { closestOnSegment, ensureOrientation, pointInCollider, rdp, ringArea } from "./geom.ts";
import { EdgeGrid, type EdgeInput } from "./grid.ts";
import { DEFAULT_OPTS, GRID_CELL, INDEX_R, NON_BLOCKING, type Collider, type CollideOptions, type Door, type EntranceNode, type Frame, type Vec } from "./types.ts";

/** NDU-UPG collide: blocking footprints in a local metric frame + an edge grid (PLAN §5.2). */
type FeatureLike = { id?: number | string; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
type TileLike = { id: number; props?: Record<string, unknown>; rings: number[][][] };
export type IngestInput = { buildings?: unknown[]; tileFootprints?: unknown[]; entrances?: EntranceNode[]; net?: unknown };

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export function isBlocking(base: number, height: number, kind: string, clearM = DEFAULT_OPTS.clearM): boolean {
  return base < clearM && height - base > 0.5 && !NON_BLOCKING.has(kind);
}

function cleanRing(frame: Frame, ll: number[][], ccw: boolean): Float64Array | null {
  const pts: number[] = [];
  const v: Vec = { x: 0, y: 0 };
  for (const p of ll) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    toXY(frame, p[1], p[0], v);
    const n = pts.length;
    if (n >= 2 && Math.hypot(v.x - pts[n - 2], v.y - pts[n - 1]) < 0.05) continue;
    pts.push(v.x, v.y);
  }
  if (pts.length >= 4 && (pts[0] !== pts[pts.length - 2] || pts[1] !== pts[pts.length - 1])) {
    if (Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]) < 0.05) {
      pts[pts.length - 2] = pts[0];
      pts[pts.length - 1] = pts[1];
    } else pts.push(pts[0], pts[1]);
  }
  if (pts.length < 8) return null;
  let r: Float64Array = new Float64Array(pts);
  if (Math.abs(ringArea(r)) < 0.05) return null;
  if (r.length / 2 > 1500) r = rdp(r, 0.2);
  return ensureOrientation(r, ccw);
}

function bboxOf(r: Float64Array): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    if (r[i] < x0) x0 = r[i];
    if (r[i] > x1) x1 = r[i];
    if (r[i + 1] < y0) y0 = r[i + 1];
    if (r[i + 1] > y1) y1 = r[i + 1];
  }
  return [x0, y0, x1, y1];
}

export class CollisionWorld {
  readonly opts: CollideOptions;
  frame: Frame = makeFrame(0, 0);
  colliders: Collider[] = [];
  doors: Door[] = [];
  grid: EdgeGrid = new EdgeGrid([]);
  /** edge → [collider index, ring index, vertex index] */
  edgeRing: Int32Array = new Int32Array(0);
  edgeVert: Int32Array = new Int32Array(0);
  private input: IngestInput = {};
  private all: Collider[] = [];
  private dirty = true;
  index: Map<string, number> = new Map();

  constructor(opts: Partial<CollideOptions> = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  setFrame(lat: number, lng: number): void {
    this.frame = makeFrame(lat, lng);
    this.dirty = true;
  }

  ingest(input: IngestInput): void {
    this.input = { ...this.input, ...input };
    this.dirty = true;
  }

  private convert(): Collider[] {
    const out: Collider[] = [];
    const seen = new Set<string>();
    const osmIds = new Set<number>();
    const add = (key: string, osm: number | null, source: Collider["source"], polys: number[][][], base: number, height: number, levels: number, kind: string, name: string) => {
      if (seen.has(key)) return;
      const outer = polys[0] ? cleanRing(this.frame, polys[0], true) : null;
      if (!outer) return;
      seen.add(key);
      const rings = [outer];
      for (let i = 1; i < polys.length; i += 1) {
        const h = cleanRing(this.frame, polys[i], false);
        if (h) rings.push(h);
      }
      out.push({ key, osm, source, rings, bbox: bboxOf(outer), base, height, levels, kind, name, blocking: isBlocking(base, height, kind, this.opts.clearM), passages: [] });
    };
    for (const raw of this.input.buildings ?? []) {
      const f = raw as FeatureLike;
      const p = f.properties ?? {};
      const g = f.geometry;
      if (!g || g.type !== "Polygon") continue;
      const osm = num(p.osm ?? f.id, NaN);
      if (Number.isSafeInteger(osm)) osmIds.add(osm);
      const src = String(p.src ?? "");
      const source: Collider["source"] = num(p.part, 0) === 1 ? "osm-part" : src.startsWith("tile") ? "tile-reheight" : "osm";
      add(Number.isSafeInteger(osm) ? `osm:${osm}` : `f:${String(f.id)}`, Number.isSafeInteger(osm) ? osm : null, source, g.coordinates as number[][][], num(p.b, 0), num(p.h, 5), num(p.lv, 0), String(p.kind ?? "yes"), String(p.name ?? ""));
    }
    for (const raw of this.input.tileFootprints ?? []) {
      const t = raw as TileLike;
      if (typeof t?.id !== "number" || !Array.isArray(t.rings)) continue;
      const osm = Math.floor(t.id / 10);
      if (osmIds.has(osm)) continue;
      const p = t.props ?? {};
      if (p.hide_3d === true || p.hide_3d === "true") continue;
      const r0 = t.rings[0]?.[0];
      const key = `tile:${t.id}:${r0 ? `${Number(r0[0]).toFixed(7)},${Number(r0[1]).toFixed(7)}` : "?"}:${t.rings[0]?.length ?? 0}`;
      add(key, Number.isSafeInteger(osm) ? osm : null, "tile", t.rings, num(p.render_min_height, 0) || 0, num(p.render_height, 5) || 5, 0, "yes", "");
    }
    return out;
  }

  /** Rebuild the window around centreLL; returns timing + sizes. */
  rebuild(centre: { lat: number; lng: number }, radius = INDEX_R): { buildMs: number; colliders: number; edges: number } {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.dirty) {
      this.all = this.convert();
      this.dirty = false;
    }
    const c = toXY(this.frame, centre.lat, centre.lng);
    this.colliders = this.all.filter((k) => k.bbox[2] >= c.x - radius && k.bbox[0] <= c.x + radius && k.bbox[3] >= c.y - radius && k.bbox[1] <= c.y + radius);
    this.index = new Map(this.colliders.map((k, i) => [k.key, i]));
    const edges: EdgeInput[] = [];
    const er: number[] = [];
    const ev: number[] = [];
    this.colliders.forEach((k, ci) => {
      if (!k.blocking) return;
      k.rings.forEach((r, ri) => {
        for (let i = 0; i + 3 < r.length; i += 2) {
          edges.push({ ax: r[i], ay: r[i + 1], bx: r[i + 2], by: r[i + 3], collider: ci });
          er.push(ri);
          ev.push(i / 2);
        }
      });
    });
    this.grid = new EdgeGrid(edges, GRID_CELL, this.opts.radius + this.opts.skin);
    this.edgeRing = Int32Array.from(er);
    this.edgeVert = Int32Array.from(ev);
    const passages = new Set<number>();
    this.grid.skipEdges(passages);
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return { buildMs: t1 - t0, colliders: this.colliders.length, edges: edges.length };
  }

  pointInBlocking(x: number, y: number): Collider | null {
    let found: Collider | null = null;
    // candidate colliders via the grid (edges near the point within a cell), then PIP; fall back to bbox scan
    for (const k of this.colliders) {
      if (!k.blocking) continue;
      if (pointInCollider(k, x, y)) {
        found = k;
        break;
      }
    }
    return found;
  }

  byKey(key: string): Collider | null {
    const i = this.index.get(key);
    return i === undefined ? null : this.colliders[i];
  }

  byOsm(osm: number): Collider | null {
    return this.byKey(`osm:${osm}`) ?? this.colliders.find((k) => k.osm === osm) ?? null;
  }

  /** Nearest point on any blocking edge within r: returns distance or Infinity. */
  clearance(x: number, y: number, r: number): number {
    let best = Infinity;
    const g = this.grid;
    const tmp = { x: 0, y: 0 };
    g.near(x, y, r, (e) => {
      closestOnSegment(x, y, g.ax[e], g.ay[e], g.bx[e], g.by[e], tmp);
      const d = Math.hypot(x - tmp.x, y - tmp.y);
      if (d < best) best = d;
    });
    return best;
  }

  /** Free for an avatar disc of radius r? */
  isFree(x: number, y: number, r = this.opts.radius): boolean {
    return this.clearance(x, y, r + this.opts.skin) >= r && !this.pointInBlocking(x, y);
  }
}
