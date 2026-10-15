/**
 * NDU-UPG props (realism 03): record + payload types for real-size OSM street furniture.
 * Pure (no DOM, no three, no aliases) so node --experimental-strip-types can test it.
 */

export type PropKind =
  | "lamp"
  | "utility_pole"
  | "bench"
  | "waste_basket"
  | "recycling"
  | "bus_stop"
  | "traffic_signals"
  | "stop_sign"
  | "give_way_sign"
  | "traffic_sign"
  | "fire_hydrant"
  | "post_box"
  | "bollard"
  | "street_cabinet"
  | "standpipe"
  | "food_stall"
  | "tree"
  | "parked_car";

/** Stable numeric code per kind (codec column `k`). Append only. */
export const KIND_CODES: PropKind[] = [
  "lamp",
  "utility_pole",
  "bench",
  "waste_basket",
  "recycling",
  "bus_stop",
  "traffic_signals",
  "stop_sign",
  "give_way_sign",
  "traffic_sign",
  "fire_hydrant",
  "post_box",
  "bollard",
  "street_cabinet",
  "standpipe",
  "food_stall",
  "tree",
  "parked_car",
];

export type Provenance = "osm" | "inferred";
export type CrownShape = "round" | "ovoid" | "conical" | "umbrella" | "palm" | "columnar";
export type LeafType = "b" | "n" | "p" | "x";
export type LampSchedule = "dusk_dawn" | "always" | "off";

export type PropRecord = {
  kind: PropKind;
  /** Key into ARCHETYPES (proceduralKit). */
  archetype: string;
  /** Node/way id; inferred = negative hash(wayId, index). */
  osmId: number;
  /** n = node, w = way, x = inferred. */
  osmType: "n" | "w" | "x";
  lng: number;
  lat: number;
  heightM: number;
  widthM: number;
  depthM: number;
  /** Compass, 0 = facing north, clockwise. */
  yawDeg: number;
  src: Provenance;
  /** 0..7 seeded colour/shape variant. */
  variant: number;
  lit?: boolean;
  shelter?: boolean;
  backrest?: boolean;
  lowConfidence?: boolean;
  tree?: { genus: string; leaf: LeafType; crownM: number; crownShape: CrownShape; trunkM: number };
  lamp?: { kelvin: number; mount: string; count: 1 | 2; schedule: LampSchedule };
  /** ≤ 12 whitelisted keys, ≤ 60 chars each (for the future inspect card). */
  tags?: Record<string, string>;
};

export type CellPayload = {
  v: 1;
  cell: string;
  origin: [number, number];
  fetchedAt: number;
  osmBase: string | null;
  counts: { osm: number; inferred: number };
  // columnar, origin-relative decimetres
  k: number[];
  a: number[];
  /** Archetype id dictionary for column `a`. */
  arch: string[];
  x: number[];
  y: number[];
  h: number[];
  w: number[];
  d: number[];
  yaw: number[];
  flags: number[];
  id: number[];
  extra: Record<number, Partial<PropRecord>>;
};

export type CellBox = { south: number; west: number; north: number; east: number };

export type RoadWay = {
  id: number;
  cls: string;
  lit: boolean | null;
  lanes: number;
  oneway: boolean;
  /** [lng, lat][] */
  pts: [number, number][];
  tags: Record<string, string>;
};

export type AreaPoly = { id: number; kind: "park" | "grass" | "parking"; ring: [number, number][]; tags: Record<string, string> };

export type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
};
