import { resolveHeight, type Tags } from "./heights.ts";
import { materialColour } from "./material.ts";
import { fromOsm } from "../render/materialCatalog.ts"; // NDU-UPG inspect (#04)
import { parseStartDate } from "../inspect/dates.ts"; // NDU-UPG inspect (#04)

/**
 * NDU-UPG #51 #56 #62 #41 #58 #70: turn raw Overpass elements (buildings, building:parts, landuse)
 * into compact GeoJSON features with resolved heights. Pure — runs on the server, unit-testable.
 */

export type OverpassEl = { type: string; id: number; tags?: Tags; geometry?: { lat: number; lon: number }[]; lat?: number; lon?: number };

/** NDU-UPG collide: an OSM entrance/door node (CD-COL-05). */
export type EntranceNode = { id: number; lat: number; lng: number; tags: Record<string, string> };
const ENTRANCE_TAGS = ["entrance", "door", "access", "name", "ref", "level", "wheelchair", "width"];

/** NDU-UPG collide: entrance/door nodes from the same Overpass answer (drops entrance=no). */
export function toEntrances(elements: OverpassEl[]): EntranceNode[] {
  const out: EntranceNode[] = [];
  for (const el of elements) {
    if (el.type !== "node" || !el.tags) continue;
    const e = el.tags.entrance;
    if (!(e && e !== "no") && !el.tags.door) continue;
    if (e === "no") continue;
    if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
    const tags: Record<string, string> = {};
    for (const k of ENTRANCE_TAGS) if (typeof el.tags[k] === "string") tags[k] = el.tags[k] as string;
    out.push({ id: el.id, lat: el.lat as number, lng: el.lon as number, tags });
  }
  return out;
}

export type BuildingProps = {
  /** OSM way id; the vector-tile building with id floor(tileId/10) is hidden where this one draws. */
  osm: number;
  h: number;
  b: number;
  lv: number;
  src: string;
  /** "1" when the height is tagged (not inferred). */
  tg: number;
  /** building:colour / roof:colour if tagged, else "". */
  c: string;
  rc: string;
  /** roof:shape (flat if untagged) for later roof meshes (#57). */
  rs: string;
  kind: string;
  name: string;
  /** Simple 3D Buildings part (1) vs outline (0). */
  part: number;
  // NDU-UPG inspect (#04): tagged wall / roof material key ("" = not mapped) and start year (0 = unknown).
  m?: string;
  rm?: string;
  y?: number;
};

export type BuildingFeature = { type: "Feature"; id: number; properties: BuildingProps; geometry: { type: "Polygon"; coordinates: number[][][] } };
export type BuildingCollection = { type: "FeatureCollection"; features: BuildingFeature[] };

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

function ringOf(el: OverpassEl): [number, number][] | null {
  const g = el.geometry ?? [];
  if (g.length < 4) return null;
  const ring = g.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => [r6(p.lon), r6(p.lat)] as [number, number]);
  if (ring.length < 4) return null;
  const [a, z] = [ring[0], ring[ring.length - 1]];
  if (a[0] !== z[0] || a[1] !== z[1]) ring.push([a[0], a[1]]);
  return ring;
}

function centroid(ring: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i += 1) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

/** Ray-casting point-in-polygon on a closed ring. */
export function inside(pt: [number, number], ring: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi) hit = !hit;
  }
  return hit;
}

const colour = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s) || /^[a-z]{3,20}$/i.test(s) ? s : "";
};

export function toBuildings(elements: OverpassEl[], limit = 4000): BuildingCollection {
  const landuse: { ring: [number, number][]; value: string }[] = [];
  const outlines: { el: OverpassEl; ring: [number, number][] }[] = [];
  const parts: { el: OverpassEl; ring: [number, number][] }[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.tags) continue;
    const ring = ringOf(el);
    if (!ring) continue;
    if (el.tags["building:part"]) parts.push({ el, ring });
    else if (el.tags.building) outlines.push({ el, ring });
    else if (el.tags.landuse) landuse.push({ ring, value: el.tags.landuse });
  }
  // #62: an outline that has building:parts inside it is drawn by its parts (Simple 3D Buildings).
  const partCentres = parts.map((p) => centroid(p.ring));
  const features: BuildingFeature[] = [];
  const push = (el: OverpassEl, ring: [number, number][], part: boolean) => {
    if (features.length >= limit) return;
    const tags = el.tags ?? {};
    const c = centroid(ring);
    const lu = landuse.find((l) => inside(c, l.ring))?.value;
    const r = resolveHeight(tags, lu);
    features.push({
      type: "Feature",
      id: el.id,
      properties: {
        osm: el.id,
        h: r.height,
        b: r.base,
        lv: r.levels,
        src: r.source,
        tg: r.tagged ? 1 : 0,
        c: colour(tags["building:colour"]) || materialColour(tags["building:material"]),
        rc: colour(tags["roof:colour"]),
        rs: tags["roof:shape"] ?? "flat",
        kind: tags.building ?? tags["building:part"] ?? "yes",
        name: tags.name ?? tags["name:en"] ?? "",
        part: part ? 1 : 0,
        // NDU-UPG inspect (#04)
        m: fromOsm(tags["building:material"] ?? tags["building:facade:material"]) ?? "",
        rm: fromOsm(tags["roof:material"]) ?? "",
        y: parseStartDate(tags.start_date ?? tags["building:start_date"] ?? tags.construction_date)?.year ?? 0,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  };
  for (const o of outlines) {
    const hasParts = partCentres.some((pc) => inside(pc, o.ring));
    if (!hasParts) push(o.el, o.ring, false);
  }
  for (const p of parts) push(p.el, p.ring, true);
  return { type: "FeatureCollection", features };
}

/** OSM way ids whose vector-tile twin should be hidden (outlines replaced by parts included). */
export function coveredIds(elements: OverpassEl[]): number[] {
  return elements.filter((el) => el.type === "way" && (el.tags?.building || el.tags?.["building:part"])).map((el) => el.id);
}

// ── vector-tile fallback (no network): fix the tile heights we know are wrong ───────────────────
/**
 * When Overpass is down/rate-limited, re-derive heights from the basemap's own OpenMapTiles
 * `building` layer: `render_height` = height, else levels × 3.66, else 5 (untagged). A 0 (OSM
 * `height=0`) or the untagged 5 m default gets a landuse prior instead (#56); real tagged heights stay.
 */
export type TileBuilding = { id: number; props: { render_height?: unknown; render_min_height?: unknown; colour?: unknown; hide_3d?: unknown }; rings: number[][][] };
export type TileLanduse = { cls: string; rings: number[][][] };

const TILE_LANDUSE: Record<string, string> = { school: "education", university: "education", college: "education", kindergarten: "education", hospital: "institutional", railway: "railway", military: "military", farmyard: "farmyard" };

export function fromTileFeatures(buildings: TileBuilding[], landuse: TileLanduse[], skip: Set<number> = new Set(), limit = 6000): { features: BuildingFeature[]; covered: number[] } {
  const features: BuildingFeature[] = [];
  const covered = new Set<number>();
  const seen = new Set<string>();
  // bbox per landuse ring so most point-in-polygon tests are skipped cheaply
  const lands = landuse
    .filter((l) => l.rings[0]?.length)
    .map((l) => {
      const ring = l.rings[0] as [number, number][];
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return { cls: l.cls, ring, x0, y0, x1, y1 };
    });
  for (const tb of buildings) {
    if (features.length >= limit) break;
    if (tb.props.hide_3d === true || tb.props.hide_3d === "true") continue;
    const osm = Math.floor(tb.id / 10);
    if (!Number.isSafeInteger(osm) || skip.has(osm)) continue;
    const rh = Number(tb.props.render_height);
    const isDefault = !Number.isFinite(rh) || rh <= 0 || rh === 5;
    if (!isDefault) continue; // tagged height: the tile already has it right
    const ring = tb.rings[0] as [number, number][] | undefined;
    if (!ring || ring.length < 4) continue;
    // Overscaled tiles repeat the same z14 piece; neighbouring tiles' clipped pieces differ, so keep those.
    const key = `${osm}:${ring[0][0].toFixed(7)},${ring[0][1].toFixed(7)}:${ring.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = centroid(ring);
    const lu = lands.find((l) => c[0] >= l.x0 && c[0] <= l.x1 && c[1] >= l.y0 && c[1] <= l.y1 && inside(c, l.ring));
    const cls = lu ? (TILE_LANDUSE[lu.cls] ?? lu.cls) : undefined;
    const r = resolveHeight({ building: "yes", min_height: String(Number(tb.props.render_min_height) || "") }, cls);
    covered.add(osm);
    features.push({
      type: "Feature",
      id: osm,
      properties: { osm, h: r.height, b: r.base, lv: r.levels, src: r.source, tg: 0, c: colour(typeof tb.props.colour === "string" ? tb.props.colour : ""), rc: "", rs: "flat", kind: "yes", name: "", part: 0, m: "", rm: "", y: 0 }, // NDU-UPG inspect (#04): m/rm/y
      geometry: { type: "Polygon", coordinates: tb.rings as number[][][] },
    });
  }
  return { features, covered: [...covered] };
}

// NDU-UPG inspect (#04): per-cell distribution so the inspect card can say what stands out nearby.
export type CellStats = { n: number; hP50: number; hP90: number; hP99: number; hMax: number; yearN: number; yearP05: number | null };

const pct = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : 0);

export function cellStats(features: { properties: Pick<BuildingProps, "h"> & { y?: number } }[]): CellStats {
  const hs = features.map((f) => f.properties.h).filter((h) => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
  const ys = features.map((f) => f.properties.y ?? 0).filter((y) => y > 0).sort((a, b) => a - b);
  return { n: hs.length, hP50: pct(hs, 0.5), hP90: pct(hs, 0.9), hP99: pct(hs, 0.99), hMax: hs.length ? hs[hs.length - 1] : 0, yearN: ys.length, yearP05: ys.length ? pct(ys, 0.05) : null };
}
