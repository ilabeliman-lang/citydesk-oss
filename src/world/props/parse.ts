import { DRIVABLE, KIND_DEFAULTS, WALKABLE, clampFor, hashSeed, kelvinFor, lampHeightForRoad, parseDirection, parseHeight, roadWidthFor, treeSize, rand01 } from "./dimensions.ts";
import { bearingOf, nearestOnLine, norm360, offsetFor, projAt, type Proj } from "./geo.ts";
import type { AreaPoly, CellBox, OsmEl, PropKind, PropRecord, RoadWay } from "./types.ts";

/**
 * NDU-UPG props: Overpass query + parser (PLAN §4.1, §4.3, §7). OSM elements → PropRecord[] with real
 * sizes and server-resolved orientation. Pure, alias-free, deterministic.
 * Data © OpenStreetMap contributors (ODbL).
 */

export const PROPS_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

export function propsQuery(cell: CellBox): string {
  const bbox = [cell.south, cell.west, cell.north, cell.east].map((v) => v.toFixed(5)).join(",");
  return [
    `[out:json][timeout:25][bbox:${bbox}];`,
    "(",
    'node["highway"~"^(street_lamp|traffic_signals|bus_stop|stop|give_way)$"];',
    'node["natural"="tree"];',
    'node["amenity"~"^(bench|waste_basket|recycling|post_box|drinking_water|fast_food)$"];',
    'node["emergency"="fire_hydrant"];',
    'node["traffic_sign"];',
    'node["power"="pole"];',
    'node["man_made"~"^(street_cabinet|water_tap)$"];',
    'node["barrier"="bollard"];',
    'node["shop"="kiosk"];',
    ");",
    "out body qt 6000;",
    "(",
    'way["natural"="tree_row"];',
    'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|footway|path|pedestrian|cycleway)(_link)?$"];',
    'way["leisure"="park"];',
    'way["landuse"~"^(grass|village_green)$"];',
    'way["amenity"="parking"];',
    ");",
    "out body geom qt 6000;",
  ].join("");
}

const TAG_KEYS = ["name", "ref", "operator", "species", "genus", "height", "lamp_mount", "light:method", "shelter", "backrest", "material", "colour"];
export function whitelistTags(tags: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!tags) return undefined;
  const out: Record<string, string> = {};
  let n = 0;
  for (const k of TAG_KEYS) {
    const v = tags[k];
    if (v == null || v === "") continue;
    out[k] = String(v).slice(0, 60);
    if (++n >= 12) break;
  }
  return n ? out : undefined;
}

export type TreeRow = { id: number; pts: [number, number][]; tags: Record<string, string> };
export type Parsed = { records: PropRecord[]; ways: RoadWay[]; areas: AreaPoly[]; rows: TreeRow[]; osmBase: string | null; zone: string; origin: [number, number] };

/** Right-hand traffic unless the zone drives on the left. */
export function leftHandTraffic(zone: string): boolean {
  return /London|Europe\/Dublin|Asia\/Tokyo|Australia|Africa\/(Nairobi|Johannesburg|Harare|Lusaka|Kampala|Dar_es_Salaam)|Asia\/(Kolkata|Karachi|Dhaka|Bangkok|Singapore|Hong_Kong)/.test(zone);
}

function kindOf(t: Record<string, string>): PropKind | null {
  const hw = t.highway;
  if (hw === "street_lamp") return "lamp";
  if (hw === "traffic_signals") return "traffic_signals";
  if (hw === "bus_stop") return "bus_stop";
  if (hw === "stop") return "stop_sign";
  if (hw === "give_way") return "give_way_sign";
  if (t.natural === "tree") return "tree";
  if (t.emergency === "fire_hydrant") return "fire_hydrant";
  switch (t.amenity) {
    case "bench":
      return "bench";
    case "waste_basket":
      return "waste_basket";
    case "recycling":
      return t.recycling_type === "centre" ? null : "recycling";
    case "post_box":
      return "post_box";
    case "drinking_water":
      return "standpipe";
    case "fast_food":
      return "food_stall";
  }
  if (t.power === "pole" || t.utility === "pole") return "utility_pole";
  if (t.man_made === "street_cabinet") return "street_cabinet";
  if (t.man_made === "water_tap") return "standpipe";
  if (t.barrier === "bollard") return "bollard";
  if (t.shop === "kiosk") return "food_stall";
  if (t.traffic_sign) return "traffic_sign";
  return null;
}

function signArchetype(code: string): string {
  const c = code.toLowerCase();
  if (/stop|:206\b|r1-1/.test(c)) return "sign_octagon";
  if (/give_way|yield|:205\b|r1-2|warning|:1\d\d\b/.test(c)) return "sign_triangle";
  if (/maxspeed|:274|:670|no_|prohibit|:2[5-9]\d\b|:6\d\d\b/.test(c)) return "sign_round";
  return "sign_rect";
}

type Ctx = { proj: Proj; ways: { w: RoadWay; xy: [number, number][] }[]; zone: string; lht: boolean };

function nearestWay(ctx: Ctx, x: number, y: number, filter: (w: RoadWay) => boolean, maxD = 40) {
  let best: { w: RoadWay; n: NonNullable<ReturnType<typeof nearestOnLine>> } | null = null;
  for (const it of ctx.ways) {
    if (!filter(it.w)) continue;
    const n = nearestOnLine(x, y, it.xy);
    if (n && n.d <= maxD && (!best || n.d < best.n.d)) best = { w: it.w, n };
  }
  return best;
}

const isDrivable = (w: RoadWay) => DRIVABLE.test(w.cls);

function base(kind: PropKind, el: OsmEl, lng: number, lat: number, archetype: string): PropRecord {
  const [w, d, h] = KIND_DEFAULTS[kind];
  return {
    kind,
    archetype,
    osmId: el.id,
    osmType: el.type === "way" ? "w" : "n",
    lng,
    lat,
    heightM: h,
    widthM: w,
    depthM: d,
    yawDeg: 0,
    src: "osm",
    variant: hashSeed(`v${el.id}`) % 8,
    tags: whitelistTags(el.tags),
  };
}

export function parseProps(elements: OsmEl[], cell: CellBox, zone: string, osmBase: string | null = null): Parsed {
  const lng0 = (cell.west + cell.east) / 2;
  const lat0 = (cell.south + cell.north) / 2;
  const proj = projAt(lng0, lat0);
  const ways: RoadWay[] = [];
  const areas: AreaPoly[] = [];
  const rows: TreeRow[] = [];
  const wayXY: Ctx["ways"] = [];
  const nodeWays = new Map<number, { w: RoadWay; idx: number }[]>();
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const t = el.tags ?? {};
    const pts = el.geometry.map((g) => [g.lon, g.lat] as [number, number]);
    if (t.natural === "tree_row") {
      rows.push({ id: el.id, pts, tags: t });
      continue;
    }
    if (t.highway) {
      const lanes = Number(t.lanes);
      const w: RoadWay = {
        id: el.id,
        cls: t.highway,
        lit: t.lit === "yes" || t.lit === "24/7" || t.lit === "automatic" ? true : t.lit === "no" ? false : null,
        lanes: Number.isFinite(lanes) && lanes > 0 ? lanes : DRIVABLE.test(t.highway) && !/^(service|living_street)/.test(t.highway) && t.oneway !== "yes" ? 2 : 1,
        oneway: t.oneway === "yes" || t.junction === "roundabout",
        pts,
        tags: t,
      };
      ways.push(w);
      wayXY.push({ w, xy: pts.map(([a, b]) => proj.toXY(a, b)) });
      (el.nodes ?? []).forEach((nid, idx) => {
        const list = nodeWays.get(nid) ?? [];
        list.push({ w, idx });
        nodeWays.set(nid, list);
      });
      continue;
    }
    const closed = pts.length >= 4 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    if (!closed) continue;
    if (t.leisure === "park") areas.push({ id: el.id, kind: "park", ring: pts, tags: t });
    else if (t.landuse === "grass" || t.landuse === "village_green") areas.push({ id: el.id, kind: "grass", ring: pts, tags: t });
    else if (t.amenity === "parking") areas.push({ id: el.id, kind: "parking", ring: pts, tags: t });
  }
  const ctx: Ctx = { proj, ways: wayXY, zone, lht: leftHandTraffic(zone) };
  const records: PropRecord[] = [];
  const push = (r: PropRecord) => records.push(r);

  for (const el of elements) {
    if (el.type !== "node" || el.lat == null || el.lon == null) continue;
    const t = el.tags ?? {};
    const kind = kindOf(t);
    if (!kind) continue;
    let lng = el.lon;
    let lat = el.lat;
    const [x, y] = proj.toXY(lng, lat);
    const dir = parseDirection(t.direction);
    const tagH = clampFor(kind, parseHeight(t.height));

    switch (kind) {
      case "lamp": {
        const mount = t.lamp_mount ?? t["light:mount"] ?? "bent_mast";
        const count = Number(t["light:count"]) >= 2 ? 2 : 1;
        const arch = /wall/.test(mount) ? "lamp_wall" : /post_top|straight/.test(mount) ? "lamp_post_top" : count === 2 ? "lamp_double" : "lamp_bent";
        const r = base(kind, el, lng, lat, arch);
        const near = nearestWay(ctx, x, y, () => true, 15);
        r.heightM = tagH ?? lampHeightForRoad(near?.w.cls);
        let yaw = dir;
        if (near) {
          // arm over the road: face the road (perpendicular)
          const toRoad = bearingOf(near.n.px - x, near.n.py - y);
          if (yaw == null) yaw = near.n.d > 0.05 ? toRoad : norm360(near.n.bearing + 90);
          // kerb snap (§7.6): a lamp on the carriageway goes to the nearest kerb
          const half = roadWidthFor(near.w.cls) / 2;
          if (isDrivable(near.w) && near.n.d < half) {
            const side = near.n.side;
            const [ox, oy] = offsetFor(norm360(near.n.bearing + 90 * side), half + 0.6);
            [lng, lat] = proj.toLL(near.n.px + ox, near.n.py + oy);
            yaw = norm360(near.n.bearing - 90 * side);
          }
        }
        r.lng = lng;
        r.lat = lat;
        r.yawDeg = yaw ?? 0;
        r.lit = t.lit !== "no";
        const schedule = t.lit === "no" ? "off" : t.lit === "24/7" || t.tunnel === "yes" ? "always" : "dusk_dawn";
        r.lamp = { kelvin: kelvinFor(t, zone), mount, count: count as 1 | 2, schedule };
        push(r);
        break;
      }
      case "traffic_signals": {
        const inc = (nodeWays.get(el.id) ?? []).filter((e) => isDrivable(e.w)).slice(0, 4);
        const major = inc.some((e) => /^(primary|trunk|motorway|secondary)/.test(e.w.cls));
        const arch = major ? "signal_mast" : "signal_post";
        const approaches: { bearing: number; cls: string }[] = [];
        for (const { w, idx } of inc) {
          const xy = w.pts.map(([a, b]) => proj.toXY(a, b));
          const dirTag = t["traffic_signals:direction"];
          if (idx > 0 && dirTag !== "backward") approaches.push({ bearing: bearingOf(xy[idx][0] - xy[idx - 1][0], xy[idx][1] - xy[idx - 1][1]), cls: w.cls });
          if (idx < xy.length - 1 && dirTag !== "forward" && !w.oneway) approaches.push({ bearing: bearingOf(xy[idx][0] - xy[idx + 1][0], xy[idx][1] - xy[idx + 1][1]), cls: w.cls });
        }
        if (!approaches.length) {
          const near = nearestWay(ctx, x, y, isDrivable, 20);
          approaches.push({ bearing: near ? near.n.bearing : (dir ?? 0), cls: near?.w.cls ?? "residential" });
        }
        approaches.slice(0, 4).forEach((ap, i) => {
          const r = base(kind, el, lng, lat, arch);
          // stand at the kerb on the traffic side, before the junction, facing the oncoming driver
          const side = ctx.lht ? -1 : 1;
          const half = roadWidthFor(ap.cls) / 2 + 0.6;
          const [bx, by] = offsetFor(norm360(ap.bearing + 180), 4);
          const [ox, oy] = offsetFor(norm360(ap.bearing + 90 * side), major ? 0 : half);
          [r.lng, r.lat] = proj.toLL(x + bx + ox, y + by + oy);
          r.yawDeg = norm360(ap.bearing + 180);
          r.heightM = tagH ?? (major ? 6 : 3.2);
          r.variant = i;
          r.lit = true;
          push(r);
        });
        break;
      }
      case "stop_sign":
      case "give_way_sign":
      case "traffic_sign": {
        const code = t.traffic_sign ?? (kind === "stop_sign" ? "stop" : kind === "give_way_sign" ? "give_way" : "");
        const arch = kind === "stop_sign" ? "sign_octagon" : kind === "give_way_sign" ? "sign_triangle" : signArchetype(code);
        const r = base(kind, el, lng, lat, arch);
        r.heightM = tagH ?? KIND_DEFAULTS[kind][2];
        const near = nearestWay(ctx, x, y, isDrivable, 25);
        if (dir != null) r.yawDeg = dir;
        else if (near) {
          // the traffic that uses the lane on this side travels with (RHT, right side) or against the way
          const withWay = ctx.lht ? near.n.side === -1 : near.n.side === 1;
          r.yawDeg = norm360(near.n.bearing + (withWay ? 180 : 0));
          const half = roadWidthFor(near.w.cls) / 2;
          if (near.n.d < half) {
            const side = ctx.lht ? -1 : 1;
            const [ox, oy] = offsetFor(norm360(near.n.bearing + 90 * side), half + 0.6);
            [r.lng, r.lat] = proj.toLL(near.n.px + ox, near.n.py + oy);
            r.yawDeg = norm360(near.n.bearing + 180);
          }
        }
        push(r);
        break;
      }
      case "bus_stop": {
        const r = base(kind, el, lng, lat, "stop_pole");
        const near = nearestWay(ctx, x, y, isDrivable, 30);
        const roadBearing = near ? near.n.bearing : (dir ?? 0);
        // shelter/bench face the road
        const face = near ? bearingOf(near.n.px - x, near.n.py - y) : roadBearing;
        r.yawDeg = dir ?? face;
        r.heightM = 2.8;
        r.shelter = t.shelter === "yes";
        r.lit = t.lit === "yes";
        push(r);
        const along = (m: number): [number, number] => {
          const [ox, oy] = offsetFor(roadBearing, m);
          return proj.toLL(x + ox, y + oy);
        };
        if (r.shelter) {
          const s = base("bus_stop", el, lng, lat, "shelter");
          [s.lng, s.lat] = along(-2.2);
          s.widthM = 3.2;
          s.depthM = 1.4;
          s.heightM = 2.5;
          s.yawDeg = r.yawDeg;
          s.shelter = true;
          s.lit = r.lit;
          s.variant = 1;
          push(s);
        }
        if (t.bench === "yes" && !r.shelter) {
          const b = base("bench", el, lng, lat, "bench_back");
          [b.lng, b.lat] = along(-2);
          b.yawDeg = r.yawDeg;
          b.backrest = true;
          b.variant = 2;
          push(b);
        }
        if (t.bin === "yes") {
          const b = base("waste_basket", el, lng, lat, "bin_post");
          [b.lng, b.lat] = along(1.2);
          b.variant = 3;
          push(b);
        }
        break;
      }
      case "bench": {
        const back = t.backrest !== "no";
        const r = base(kind, el, lng, lat, back ? "bench_back" : "bench_flat");
        r.backrest = back;
        const near = nearestWay(ctx, x, y, () => true, 25);
        r.yawDeg = dir ?? (near && near.n.d > 0.1 ? bearingOf(near.n.px - x, near.n.py - y) : (near ? norm360(near.n.bearing + 90) : 0));
        const len = parseHeight(t.length);
        if (len && len > 0.6 && len < 10) r.widthM = len;
        push(r);
        break;
      }
      case "tree": {
        const ts = treeSize(t, el.id, zone);
        const r = base(kind, el, lng, lat, `crown_${ts.shape}`);
        r.heightM = ts.heightM;
        r.widthM = r.depthM = ts.crownM;
        r.yawDeg = rand01(el.id, 7) * 360;
        r.tree = { genus: ts.genus, leaf: ts.leaf, crownM: ts.crownM, crownShape: ts.shape, trunkM: ts.trunkM };
        push(r);
        break;
      }
      case "fire_hydrant": {
        const ty = t["fire_hydrant:type"] ?? "pillar";
        const arch = ty === "underground" ? "hydrant_plate" : ty === "wall" ? "hydrant_wall" : "hydrant_pillar";
        const r = base(kind, el, lng, lat, arch);
        if (arch === "hydrant_plate") {
          r.heightM = 0.05;
          r.widthM = r.depthM = 0.5;
        }
        const near = nearestWay(ctx, x, y, isDrivable, 25);
        r.yawDeg = dir ?? (near ? bearingOf(near.n.px - x, near.n.py - y) : 0);
        push(r);
        break;
      }
      case "utility_pole": {
        const r = base(kind, el, lng, lat, /concrete|steel|metal/.test(t.material ?? "") ? "pole_concrete" : "pole_wood");
        r.heightM = tagH ?? 7 + rand01(el.id, 3) * 4;
        const near = nearestWay(ctx, x, y, () => true, 30);
        r.yawDeg = dir ?? (near ? near.n.bearing : 0); // cross-arm along the road
        push(r);
        break;
      }
      default: {
        const arch: Partial<Record<PropKind, string>> = {
          waste_basket: t.support === "pole" ? "bin_post" : "bin_standing",
          recycling: "container",
          post_box: "postbox_pillar",
          bollard: "bollard",
          street_cabinet: "cabinet",
          standpipe: "standpipe",
          food_stall: "stall",
        };
        const r = base(kind, el, lng, lat, arch[kind] ?? kind);
        if (tagH != null) r.heightM = tagH;
        const near = nearestWay(ctx, x, y, () => true, 25);
        r.yawDeg = dir ?? (near && near.n.d > 0.1 ? bearingOf(near.n.px - x, near.n.py - y) : 0);
        push(r);
      }
    }
  }
  // round yaw for stable payloads
  for (const r of records) r.yawDeg = Math.round(norm360(r.yawDeg) * 10) / 10;
  return { records, ways, areas, rows, osmBase, zone, origin: [lng0, lat0] };
}
