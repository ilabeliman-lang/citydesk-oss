/** NDU-UPG collide: pure types (PLAN §4). x = east, y = north, metres in a local frame. */
export type Vec = { x: number; y: number };
export type Frame = { lat0: number; lng0: number; kx: number; ky: number };
export type ColliderSource = "osm" | "osm-part" | "tile" | "tile-reheight" | "prop";
export type Collider = {
  key: string;
  osm: number | null;
  source: ColliderSource;
  rings: Float64Array[];
  bbox: [number, number, number, number];
  base: number;
  height: number;
  levels: number;
  kind: string;
  name: string;
  blocking: boolean;
  passages: number[];
};
export type DoorKind = "main" | "yes" | "secondary" | "service" | "entrance" | "exit" | "emergency" | "garage" | "home" | "staircase" | "synthetic";
export type Door = {
  id: string;
  colliderKey: string;
  edge: number;
  at: Vec;
  normal: Vec;
  approach: Vec;
  widthM: number;
  kind: DoorKind;
  synthetic: boolean;
  locked: boolean;
  doorType: string;
  name: string;
  level: string | null;
  wheelchair: string | null;
};
export type EntranceNode = { id: number; lat: number; lng: number; tags: Record<string, string> };
export type DynamicObstacle =
  | { kind: "circle"; id: string; at: Vec; r: number; soft: true }
  | { kind: "obb"; id: string; at: Vec; halfW: number; halfL: number; heading: number; soft: true };
export type MoveResult = { pos: Vec; moved: number; blocked: boolean; normal: Vec | null; hitKey: string | null; substeps: number; iterations: number };
export type CollideOptions = { radius: number; skin: number; maxSub: number; maxIter: number; clearM: number; stepM: number };

export const DEFAULT_OPTS: CollideOptions = { radius: 0.3, skin: 0.01, maxSub: 0.15, maxIter: 4, clearM: 2.2, stepM: 0.3 };
export const NON_BLOCKING = new Set(["roof", "carport", "canopy"]);
export const INDEX_R = 600;
export const INDEX_R_C = 400;
export const REBUILD_MOVE = 200;
export const GRID_CELL = 6;
export const APPROACH_M = 1.0;
export const DOOR_NEAR_M = 2.5;
export const DOOR_WALKIN_S = 0.35;
export const COOLDOWN_S = 1.5;
export const STUCK_S = 1.5;
export const MAG_M = 3;
export const MAG_K = 0.6;
export const DOOR_RANK: Record<DoorKind, number> = { main: 9, yes: 8, secondary: 7, entrance: 6, home: 5, staircase: 4, service: 3, garage: 2, synthetic: 1, exit: 0, emergency: 0 };
