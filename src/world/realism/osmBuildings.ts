import { createServerFn } from "@tanstack/react-start";
import { OVERPASS_URL, overpassInit } from "@/world/overpass";
import { coveredIds, toBuildings, toEntrances, type BuildingCollection, type EntranceNode, type OverpassEl } from "./buildingsData.ts";
import { rememberCellTags } from "../inspect/tagCache.ts"; // NDU-UPG inspect (#04)

/**
 * NDU-UPG #51 #56 #81 #82: tagged OSM buildings around the viewed spot, with resolved heights.
 * Server-side, per grid cell (~330 m): cached 24 h, ONE Overpass request in flight at a time, and an
 * exponential back-off after 429/504 so we respect the public Overpass usage policy.
 * (Interim until ward PMTiles are pre-baked — #52/#94.)
 */

export const CELL_DEG = 0.003;
const MARGIN_DEG = 0.0018;
const TTL_MS = 24 * 3600_000;
const MAX_CELLS = 160;

export type CellAnswer = { ok: true; cell: string; data: BuildingCollection; covered: number[]; entrances?: EntranceNode[] } | { ok: false; cell: string; retryMs: number };

export function cellOf(lat: number, lng: number): { key: string; south: number; west: number; north: number; east: number } {
  const row = Math.floor(lat / CELL_DEG);
  const col = Math.floor(lng / CELL_DEG);
  return { key: `${row}:${col}`, south: row * CELL_DEG - MARGIN_DEG, west: col * CELL_DEG - MARGIN_DEG, north: (row + 1) * CELL_DEG + MARGIN_DEG, east: (col + 1) * CELL_DEG + MARGIN_DEG };
}

type Done = { at: number; data: BuildingCollection; covered: number[]; entrances?: EntranceNode[] };
const cache = new Map<string, Done>();
const pending = new Map<string, Promise<Done | null>>();
let queue: Promise<unknown> = Promise.resolve();
let inFlight = 0;
let coolUntil = 0;
let backoff = 0;

async function fetchCell(cell: ReturnType<typeof cellOf>): Promise<Done | null> {
  const bbox = [cell.south, cell.west, cell.north, cell.east].map((v) => v.toFixed(5)).join(",");
  const query = `[out:json][timeout:25][bbox:${bbox}];(way["building"];way["building:part"];way["landuse"];node["entrance"];node["door"];);out geom qt;`;
  inFlight += 1;
  try {
    console.info(`[realism] overpass cell ${cell.key} in-flight=${inFlight}`);
    const res = await fetch(OVERPASS_URL, { ...overpassInit(query), signal: AbortSignal.timeout(28_000) });
    if (res.status === 429 || res.status === 504 || res.status >= 500) {
      backoff = Math.min(backoff ? backoff * 2 : 20_000, 10 * 60_000);
      coolUntil = Date.now() + backoff;
      return null;
    }
    if (!res.ok) return null;
    const body = (await res.json()) as { elements?: OverpassEl[] };
    const elements = body.elements ?? [];
    backoff = 0;
    rememberCellTags(cell.key, elements); // NDU-UPG inspect (#04): public tags for the inspect card
    return { at: Date.now(), data: toBuildings(elements), covered: coveredIds(elements), entrances: toEntrances(elements) }; // NDU-UPG collide
  } catch {
    backoff = Math.min(backoff ? backoff * 2 : 20_000, 10 * 60_000);
    coolUntil = Date.now() + backoff;
    return null;
  } finally {
    inFlight -= 1;
  }
}

export async function buildingsForCell(lat: number, lng: number): Promise<CellAnswer> {
  const cell = cellOf(lat, lng);
  const hit = cache.get(cell.key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, cell: cell.key, data: hit.data, covered: hit.covered, entrances: hit.entrances ?? [] };
  if (Date.now() < coolUntil) return { ok: false, cell: cell.key, retryMs: coolUntil - Date.now() };
  let job = pending.get(cell.key);
  if (!job) {
    // Serialise: each request waits for the previous one (one Overpass request at a time).
    job = queue.then(() => (Date.now() < coolUntil ? null : fetchCell(cell)));
    queue = job.catch(() => null);
    pending.set(cell.key, job);
  }
  const done = await job.finally(() => pending.delete(cell.key));
  if (!done) return { ok: false, cell: cell.key, retryMs: Math.max(15_000, coolUntil - Date.now()) };
  cache.set(cell.key, done);
  if (cache.size > MAX_CELLS) cache.delete(cache.keys().next().value as string);
  return { ok: true, cell: cell.key, data: done.data, covered: done.covered, entrances: done.entrances ?? [] };
}

/**
 * NDU-UPG inspect (#04): run one extra Overpass request on the SAME serial queue, honouring the
 * back-off. Resolves undefined while cooling down (the caller answers "busy").
 */
export function overpassJob<T>(fn: () => Promise<T>): Promise<T | null | undefined> {
  if (Date.now() < coolUntil) return Promise.resolve(undefined);
  const job = queue.then(async () => {
    if (Date.now() < coolUntil) return undefined;
    try {
      return await fn();
    } catch {
      backoff = Math.min(backoff ? backoff * 2 : 20_000, 10 * 60_000);
      coolUntil = Date.now() + backoff;
      return undefined;
    }
  });
  queue = job.catch(() => null);
  return job;
}

export const osmBuildings = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -85 || lat > 85) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<CellAnswer> => buildingsForCell(data.lat, data.lng));
