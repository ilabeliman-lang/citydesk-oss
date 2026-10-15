/**
 * NDU-UPG life (#201 #205 #214 #215 #250 #258): Overpass answer -> the compact street data the life
 * layer needs (drivable roads with class/oneway/lanes/maxspeed, walkable ways, and the POIs that
 * attract people: bus stops, markets, churches, shops, food, traffic signals). Pure and alias-free so
 * node --experimental-strip-types can test it. OSM data: (c) OpenStreetMap contributors, ODbL.
 */

export type LngLat = [number, number];

/** NDU realism 02 T8: vertical tags (same vocabulary as src/world/ground/types.ts DeckKind). */
export type Deck = "ground" | "bridge" | "tunnel" | "steps" | "passage";
export type Vertical = { deck?: Deck; layer?: number; incline?: string; stepCount?: number };

export type LRoad = {
  cls: string;
  /** 1 = drawn direction only, -1 = reverse only, 0 = both ways (#215). */
  oneway: 0 | 1 | -1;
  lanes: number;
  /** Speed cap from maxspeed, else a class default (#250). */
  maxKmh: number;
  name: string;
  pts: LngLat[];
} & Vertical;

export type LWalk = { kind: string; pts: LngLat[] } & Vertical;

/** OSM bridge/tunnel/layer/incline/step_count → Vertical (only keys that carry information). */
export function verticalOf(tags: Record<string, string>): Vertical {
  const v: Vertical = {};
  const bridge = tags.bridge ?? "";
  const tunnel = tags.tunnel ?? "";
  if (bridge && bridge !== "no") v.deck = "bridge";
  else if (tunnel === "building_passage") v.deck = "passage";
  else if (tunnel && tunnel !== "no") v.deck = "tunnel";
  else if (tags.highway === "steps") v.deck = "steps";
  const layer = Number.parseInt(tags.layer ?? "", 10);
  if (Number.isFinite(layer) && layer !== 0) v.layer = Math.max(-5, Math.min(5, layer));
  if (tags.incline) v.incline = tags.incline;
  const steps = Number.parseInt(tags.step_count ?? "", 10);
  if (Number.isFinite(steps) && steps > 0) v.stepCount = Math.min(500, steps);
  return v;
}

export type PoiKind = "bus" | "signal" | "stop" | "yield" | "market" | "church" | "shop" | "food" | "station" | "cave" | "board" | "tree" | "door" | "lamp" | "bench" | "bin";

export type LPoi = { kind: PoiKind; name: string; lng: number; lat: number };

export type Streets = { lat: number; lng: number; roads: LRoad[]; walks: LWalk[]; pois: LPoi[] };

type El = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

export const DRIVE_CLASSES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
];
export const WALK_CLASSES = ["footway", "path", "pedestrian", "steps"];

const DEFAULT_KMH: Record<string, number> = {
  motorway: 90,
  trunk: 70,
  primary: 50,
  secondary: 45,
  tertiary: 40,
  unclassified: 35,
  residential: 30,
  living_street: 15,
  service: 15,
};

export function classKmh(cls: string): number {
  return DEFAULT_KMH[cls.replace(/_link$/, "")] ?? 30;
}

/** "50", "30 mph", "50;40", "walk", "none" -> km/h (or null). */
export function parseMaxspeed(raw: string | undefined): number | null {
  if (!raw) return null;
  if (raw === "walk") return 7;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(mph|knots)?/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? "").toLowerCase();
  return Math.round(unit === "mph" ? n * 1.609 : unit === "knots" ? n * 1.852 : n);
}

export function parseOneway(tags: Record<string, string>): 0 | 1 | -1 {
  const v = (tags.oneway ?? "").toLowerCase();
  if (v === "yes" || v === "true" || v === "1") return 1;
  if (v === "-1" || v === "reverse") return -1;
  if (v === "no" || v === "false" || v === "0") return 0;
  if (tags.junction === "roundabout" || tags.junction === "circular") return 1;
  if (tags.highway === "motorway" || tags.highway === "motorway_link") return 1;
  return 0;
}

function defaultLanes(cls: string, oneway: number): number {
  const base = cls.replace(/_link$/, "");
  if (oneway) return base === "primary" || base === "trunk" || base === "motorway" ? 2 : 1;
  return base === "primary" || base === "trunk" || base === "motorway" ? 4 : 2;
}

/** Keep long ways light: ~40 points, never dropping the ends. */
function thin(points: LngLat[], max = 40): LngLat[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

function line(el: El): LngLat[] {
  return thin(
    (el.geometry ?? [])
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => [r6(p.lon), r6(p.lat)] as LngLat),
  );
}

function tunnelled(tags: Record<string, string>): boolean {
  const v = (tags.tunnel ?? "").toLowerCase();
  return v !== "" && v !== "no" && v !== "false" && v !== "0";
}

function bridged(tags: Record<string, string>): boolean {
  const v = (tags.bridge ?? "").toLowerCase();
  return v === "yes" || v === "viaduct" || v === "aqueduct" || v === "cantilever";
}

function poiKind(tags: Record<string, string>): PoiKind | null {
  if (tags.highway === "bus_stop" || (tags.public_transport === "platform" && tags.bus === "yes")) return "bus";
  if (tags.highway === "traffic_signals") return "signal";
  if (tags.highway === "stop") return "stop";
  if (tags.highway === "give_way") return "yield";
  if (tags.natural === "cave_entrance") return "cave";
  if (tags.natural === "tree") return "tree";
  if (tags.advertising === "billboard") return "board";
  if (tags.entrance) return "door";
  if (tags.highway === "street_lamp") return "lamp";
  if (tags.amenity === "bench") return "bench";
  if (tags.amenity === "waste_basket") return "bin";
  if (tags.highway === "traffic_sign" || tags.traffic_sign) return null;
  const a = tags.amenity ?? "";
  if (a === "marketplace") return "market";
  if (a === "place_of_worship") return "church";
  if (a === "bus_station") return "station";
  if (a === "restaurant" || a === "cafe" || a === "fast_food" || a === "food_court") return "food";
  if (tags.shop) return tags.shop === "supermarket" || tags.shop === "mall" ? "market" : "shop";
  return null;
}

export function parseStreets(lat: number, lng: number, elements: El[]): Streets {
  const roads: LRoad[] = [];
  const walks: LWalk[] = [];
  const pois: LPoi[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.geometry && el.geometry.length >= 2 && tags.highway) {
      const hw = tags.highway;
      if (["private", "no"].includes(tags.access ?? "")) continue;
      const pts = line(el);
      if (pts.length < 2) continue;
      if (DRIVE_CLASSES.includes(hw)) {
        if (tunnelled(tags)) continue;
        if (hw === "service" && ["parking_aisle", "driveway", "drive-through"].includes(tags.service ?? "")) continue;
        const oneway = parseOneway(tags);
        const lanes = Math.max(1, Math.min(8, Number.parseInt(tags.lanes ?? "", 10) || defaultLanes(hw, oneway)));
        roads.push({
          cls: hw,
          oneway,
          lanes,
          maxKmh: parseMaxspeed(tags.maxspeed) ?? classKmh(hw),
          name: (tags.name ?? "").slice(0, 60),
          pts,
          ...(bridged(tags) ? { deck: "bridge" as const } : {}),
          ...verticalOf(tags),
        });
      } else if (WALK_CLASSES.includes(hw) && !["no", "private"].includes(tags.foot ?? "")) {
        walks.push({ kind: hw, pts, ...verticalOf(tags) });
      }
      continue;
    }
    const kind = poiKind(tags);
    const at = el.center ?? (Number.isFinite(el.lat) && Number.isFinite(el.lon) ? { lat: el.lat as number, lon: el.lon as number } : null);
    if (!kind || !at) continue;
    pois.push({ kind, name: (tags.name ?? "").slice(0, 60), lng: r6(at.lon), lat: r6(at.lat) });
  }
  return { lat, lng, roads: roads.slice(0, 420), walks: walks.slice(0, 300), pois: pois.slice(0, 320) };
}

/** The Overpass QL for one cell (radius in metres). */
export function streetsQuery(lat: number, lng: number, radius = 480): string {
  const around = `(around:${radius},${lat},${lng})`;
  return (
    `[out:json][timeout:20];` +
    `(way["highway"~"^(${DRIVE_CLASSES.join("|")})$"]${around};` +
    `way["highway"~"^(${WALK_CLASSES.join("|")})$"]["access"!~"^(private|no)$"]${around};);out tags geom 700;` +
    `(node["highway"~"^(bus_stop|traffic_signals|stop|give_way)$"]${around};` +
    `node["natural"="cave_entrance"]${around};` +
    `node["advertising"="billboard"]${around};` +
    `nwr["amenity"~"^(marketplace|place_of_worship|bus_station|restaurant|cafe|fast_food|food_court)$"]${around};` +
    `nwr["shop"]${around};);out tags center 400;` +
    `(node["natural"="tree"]${around};);out tags center 60;` +
    `(node["entrance"]${around};node["highway"="street_lamp"]${around};node["amenity"="bench"]${around};node["amenity"="waste_basket"]${around};);out tags center 80;`
  );
}
