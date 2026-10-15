import { createServerFn } from "@tanstack/react-start";
import { OVERPASS_URL, overpassInit } from "@/world/overpass";
import { parseStreets, streetsQuery, type Streets } from "./parse.ts";

/**
 * NDU-UPG life: one Overpass call per ~110 m cell for roads + walkways + POIs, cached in memory
 * (30 min; failures 60 s) and de-duplicated while in flight (Do-first 20 Overpass etiquette).
 */
const CACHE = new Map<string, { at: number; ttl: number; job: Promise<Streets> }>();
const TTL = 30 * 60_000;

function cached(lat: number, lng: number): Promise<Streets> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.job;
  const entry = { at: now, ttl: TTL, job: Promise.resolve<Streets>({ lat, lng, roads: [], walks: [], pois: [] }) };
  entry.job = fetch(OVERPASS_URL, overpassInit(streetsQuery(lat, lng)))
    .then(async (res) => {
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const body = (await res.json()) as { elements?: Parameters<typeof parseStreets>[2] };
      return parseStreets(lat, lng, body.elements ?? []);
    })
    .catch(() => {
      entry.ttl = 60_000;
      return { lat, lng, roads: [], walks: [], pois: [] } as Streets;
    });
  CACHE.set(key, entry);
  if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value as string);
  return entry.job;
}

export const lifeStreets = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -85 || lat > 85) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    // snap to the cache cell so nearby players share one Overpass answer
    return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
  })
  .handler(async ({ data }): Promise<Streets> => cached(data.lat, data.lng));
