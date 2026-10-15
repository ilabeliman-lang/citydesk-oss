// NDU-FP (FPXR-05): building footprints for FP wall push-out. Pure index + a thin map adapter.
// Until realism-01 (collision) lands, it is fed from rendered building layers. Coordinate with
// feat/collision-doors: if that branch exports a shared collider, swap refreshFromMap for it.
import { M_PER_DEG } from "./rig.ts";

type Pt = [number, number];
type Poly = { ring: Pt[]; minX: number; minY: number; maxX: number; maxY: number };
const RAD = Math.PI / 180;

export class FootprintIndex {
  private cos = 1;
  private polys: Poly[] = [];
  private grid = new Map<string, number[]>();
  private cellM: number;
  constructor(cellM = 10) {
    this.cellM = cellM;
  }
  private toXY(lng: number, lat: number): Pt {
    return [lng * M_PER_DEG * this.cos, lat * M_PER_DEG];
  }
  private toLL(x: number, y: number): Pt {
    return [x / (M_PER_DEG * this.cos), y / M_PER_DEG];
  }
  get size() {
    return this.polys.length;
  }
  load(rings: [number, number][][], originLat: number) {
    this.cos = Math.cos(originLat * RAD) || 1;
    this.polys = [];
    this.grid.clear();
    for (const r of rings) {
      if (!r || r.length < 3) continue;
      const ring = r.map(([lng, lat]) => this.toXY(lng, lat));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of ring) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      const id = this.polys.push({ ring, minX, minY, maxX, maxY }) - 1;
      for (let cx = Math.floor(minX / this.cellM); cx <= Math.floor(maxX / this.cellM); cx++)
        for (let cy = Math.floor(minY / this.cellM); cy <= Math.floor(maxY / this.cellM); cy++) {
          const k = cx + ":" + cy;
          const l = this.grid.get(k);
          if (l) l.push(id);
          else this.grid.set(k, [id]);
        }
    }
  }
  private near(x: number, y: number, r: number): number[] {
    const out = new Set<number>();
    for (let cx = Math.floor((x - r) / this.cellM); cx <= Math.floor((x + r) / this.cellM); cx++)
      for (let cy = Math.floor((y - r) / this.cellM); cy <= Math.floor((y + r) / this.cellM); cy++)
        for (const id of this.grid.get(cx + ":" + cy) ?? []) out.add(id);
    return [...out];
  }
  private static inside(ring: Pt[], x: number, y: number) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  insideAny(lng: number, lat: number): boolean {
    const [x, y] = this.toXY(lng, lat);
    return this.near(x, y, 0).some((id) => FootprintIndex.inside(this.polys[id].ring, x, y));
  }
  /** Push a circle of radius r out of every footprint it overlaps (wall slide: only the normal part moves). */
  pushOut(lng: number, lat: number, r = 0.25): { lng: number; lat: number; pushed: boolean } {
    let [x, y] = this.toXY(lng, lat);
    let pushed = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const id of this.near(x, y, r)) {
        const p = this.polys[id];
        if (x < p.minX - r || x > p.maxX + r || y < p.minY - r || y > p.maxY + r) continue;
        const ins = FootprintIndex.inside(p.ring, x, y);
        let best = Infinity, bx = 0, by = 0;
        for (let i = 0, j = p.ring.length - 1; i < p.ring.length; j = i++) {
          const [ax, ay] = p.ring[j];
          const [ex, ey] = p.ring[i];
          const dx = ex - ax, dy = ey - ay;
          const l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
          const qx = ax + t * dx, qy = ay + t * dy;
          const d = Math.hypot(x - qx, y - qy);
          if (d < best) { best = d; bx = qx; by = qy; }
        }
        if (!ins && best >= r) continue;
        let nx = x - bx, ny = y - by;
        const nl = Math.hypot(nx, ny);
        if (nl < 1e-9) continue;
        nx /= nl; ny /= nl;
        if (ins) { nx = -nx; ny = -ny; }
        x = bx + nx * r;
        y = by + ny * r;
        moved = pushed = true;
      }
      if (!moved) break;
    }
    const [olng, olat] = this.toLL(x, y);
    return pushed ? { lng: olng, lat: olat, pushed } : { lng, lat, pushed };
  }
}

type GeoFeature = { geometry?: { type: string; coordinates: unknown } };
type QueryMap = {
  queryRenderedFeatures: (opts: { layers: string[] }) => GeoFeature[];
};
/** Outer rings of rendered building features within radiusM of center. */
export function ringsFromFeatures(features: GeoFeature[], center: { lng: number; lat: number }, radiusM = 150): [number, number][][] {
  const cos = Math.cos(center.lat * RAD) || 1;
  const out: [number, number][][] = [];
  const near = (ring: [number, number][]) =>
    ring.some(([lng, lat]) => Math.hypot((lng - center.lng) * M_PER_DEG * cos, (lat - center.lat) * M_PER_DEG) <= radiusM);
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      const r = (g.coordinates as [number, number][][])[0];
      if (r && near(r)) out.push(r);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as [number, number][][][]) if (poly[0] && near(poly[0])) out.push(poly[0]);
    }
  }
  return out;
}
export function refreshFromMap(index: FootprintIndex, map: QueryMap, layers: string[], center: { lng: number; lat: number }, radiusM = 150) {
  if (!layers.length) return 0;
  try {
    const rings = ringsFromFeatures(map.queryRenderedFeatures({ layers }), center, radiusM);
    index.load(rings, center.lat);
    return rings.length;
  } catch {
    return index.size;
  }
}
