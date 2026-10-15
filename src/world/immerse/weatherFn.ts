import { createServerFn } from "@tanstack/react-start";
import { cacheKey, openMeteoUrl, parseOpenMeteo, type WeatherNow } from "./weather.ts";

/**
 * NDU-UPG immerse #301 #322 #348: live weather for the viewed place, proxied + cached server-side.
 * One upstream Open-Meteo call per ~11 km cell per 15 minutes (shared by every player there),
 * in-flight requests de-duplicated, failures cooled down for 2 minutes. No key, no paid API.
 * Open-Meteo data is CC BY 4.0; its free API is for non-commercial use (commercial use needs their
 * paid plan) — the UI credits "Weather from Open-Meteo" (#336).
 */

const TTL_MS = 15 * 60_000;
const FAIL_MS = 2 * 60_000;
const MAX_KEYS = 400;

type Entry = { at: number; data: WeatherNow | null };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<WeatherNow | null>>();
let upstreamCalls = 0;

async function fetchUpstream(key: string): Promise<WeatherNow | null> {
  const [lat, lng] = key.split(",").map(Number);
  upstreamCalls += 1;
  try {
    const res = await fetch(openMeteoUrl(lat, lng), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return parseOpenMeteo(await res.json(), key);
  } catch {
    return null;
  }
}

export type WeatherAnswer =
  { ok: true; data: WeatherNow; cached: boolean } | { ok: false; retryMs: number };

export async function weatherForKey(key: string): Promise<WeatherAnswer> {
  const hit = cache.get(key);
  if (hit) {
    const age = Date.now() - hit.at;
    if (hit.data && age < TTL_MS) return { ok: true, data: hit.data, cached: true };
    if (!hit.data && age < FAIL_MS) return { ok: false, retryMs: FAIL_MS - age };
  }
  let job = pending.get(key);
  if (!job) {
    job = fetchUpstream(key).finally(() => pending.delete(key));
    pending.set(key, job);
  }
  const data = await job;
  cache.delete(key);
  cache.set(key, { at: Date.now(), data });
  while (cache.size > MAX_KEYS) cache.delete(cache.keys().next().value as string);
  return data ? { ok: true, data, cached: false } : { ok: false, retryMs: FAIL_MS };
}

/** For QA: how many upstream calls this server process made. */
export const weatherStats = () => ({ keys: cache.size, upstreamCalls });

export const liveWeather = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -85 || lat > 85) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<WeatherAnswer> => weatherForKey(cacheKey(data.lat, data.lng)));
