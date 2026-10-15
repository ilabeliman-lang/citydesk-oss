import { collideEnabled } from "./flag.ts";

/** NDU-UPG collide: tiny eager bus between realism/CityBuildings/WorldMap and the lazy collide chunk. */
export type CollideData = {
  buildings: unknown[];
  tileFootprints: unknown[];
  entrances: Map<string, unknown[]>;
  net: unknown | null;
  version: number;
};

const state: CollideData = { buildings: [], tileFootprints: [], entrances: new Map(), net: null, version: 0 };
const subs = new Set<(d: CollideData) => void>();
const exitSubs = new Set<(door: unknown | null) => void>();
let lastDoor: unknown | null = null;

export const collideOn = (): boolean => collideEnabled();

function emit() {
  state.version += 1;
  for (const fn of subs) fn(state);
}

export function publishBuildings(feats: unknown[]): void {
  if (!collideOn()) return;
  state.buildings = feats;
  emit();
}
export function publishTileFootprints(t: unknown[]): void {
  if (!collideOn()) return;
  state.tileFootprints = t;
  emit();
}
export function publishEntrances(cell: string, e: unknown[]): void {
  if (!collideOn()) return;
  state.entrances.set(cell, e);
  emit();
}
export function publishRoadNet(net: unknown | null): void {
  if (!collideOn()) return;
  state.net = net;
  emit();
}
export function onCollideData(fn: (d: CollideData) => void): () => void {
  subs.add(fn);
  if (state.version) fn(state);
  return () => void subs.delete(fn);
}
export function noteEnteredDoor(door: unknown | null): void {
  lastDoor = door;
}
export function lastEnteredDoor(): unknown | null {
  return lastDoor;
}
export function exited(): void {
  const door = lastDoor;
  for (const fn of exitSubs) fn(door);
  lastDoor = null;
}
export function onExited(fn: (door: unknown | null) => void): () => void {
  exitSubs.add(fn);
  return () => void exitSubs.delete(fn);
}
