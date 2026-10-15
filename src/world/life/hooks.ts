import { getTier } from "@/world/perf/tier";

/**
 * NDU-UPG life: the tiny, three-free part CityBuildings imports statically. The life layer itself
 * (src/world/life/index.ts + lifeLayer.ts) loads in its own chunks after the map style.
 *   lifeTap      a map tap goes to a walker/vehicle first (opens its bubble card)
 *   lifePlayer   where the player's figure stands, so vehicles brake for it (#219)
 *   streetRoster the old DOM street sprites: Tier C keeps a few dots, Tier A/B hand walkers and
 *                vehicles to the 3D life layer (#204: KEKE/BUS labels become 3D vehicles)
 * Kill switch: ?life=0 or localStorage "ndu.life.off" = "1".
 */

type Point = { x: number; y: number };
type Spot = { lat: number; lng: number };

let picker: ((p: Point) => boolean) | null = null;
let player: Spot | null = null;

export function setLifePicker(fn: ((p: Point) => boolean) | null) {
  picker = fn;
}

export function lifeTap(point: Point): boolean {
  try {
    return picker ? picker(point) : false;
  } catch {
    return false;
  }
}

// NDU-UPG inspect (#04): the life layer also registers a non-opening picker so a long-press can
// inspect a walker/vehicle without popping its bubble card.
export type LifeInspectHit = { agentId: string; kind: "walker" | "vehicle"; vkind?: "car" | "keke" | "bus" | "danfo"; lngLat: [number, number]; stopped?: boolean };
let inspector: ((p: Point) => LifeInspectHit | null) | null = null;

export function setLifeInspector(fn: ((p: Point) => LifeInspectHit | null) | null) {
  inspector = fn;
}

export function lifePickAt(point: Point): LifeInspectHit | null {
  try {
    return inspector ? inspector(point) : null;
  } catch {
    return null;
  }
}

export function lifePlayer(spot: Spot) {
  player = { lat: spot.lat, lng: spot.lng };
}

export function lifePlayerSpot(): Spot | null {
  return player;
}

export function lifeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(location.search).get("life") === "0") return false;
    if (localStorage.getItem("ndu.life.off") === "1") return false;
  } catch {
    // storage blocked: keep the default
  }
  return getTier().tier !== "C";
}

type RosterKind = { count: number; speed: number; label: string };

export function streetRoster<T extends RosterKind>(roster: T[]): T[] {
  if (typeof window === "undefined") return roster;
  if (getTier().tier === "C") {
    // just a few slow dots on the weakest devices
    return roster.filter((k) => k.label === "Hawker" || (k.label === "" && k.speed < 2)).map((k) => ({ ...k, count: Math.min(k.count, k.label ? 1 : 4) }));
  }
  if (!lifeEnabled()) return roster;
  return roster.filter((k) => k.label === "Hawker");
}
