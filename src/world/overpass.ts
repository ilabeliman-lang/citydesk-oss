/**
 * Overpass (OpenStreetMap) request settings, shared by the server functions that query it.
 * overpass-api.de answers 406 to requests without a real User-Agent / Accept (Node's default
 * fetch sends neither), which silently emptied the road network and the OSM places.
 */
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export function overpassInit(query: string): RequestInit {
  return {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "user-agent": "CityDesk/1.0 (Ndu township map; OpenStreetMap Overpass client)",
    },
    signal: AbortSignal.timeout(20_000),
  };
}

/**
 * Overpass mirrors, tried in order. A mirror that errors, 429s or 504s is benched with exponential
 * backoff (1 min → 30 min) so we never hammer a struggling public server. Same query, same limits.
 */
export const OVERPASS_MIRRORS = [
  // self-hosted Hawaii Overpass on this Studio (docker osm-overpass); public mirrors below are fallback
  process.env.OVERPASS_LOCAL_URL ?? "http://127.0.0.1:12345/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const benched = new Map<string, { until: number; strikes: number }>();

/** POST an Overpass query to the first healthy mirror. Returns the parsed JSON or null if all are down. */
export async function overpassFetch<T = unknown>(query: string): Promise<T | null> {
  for (let round = 0; round < 2; round += 1) {
    let tried = 0;
    for (const url of OVERPASS_MIRRORS) {
      const st = benched.get(url) ?? { until: 0, strikes: 0 };
      // round 2 (after a 3 s pause) gives the two main mirrors one more chance, ignoring the bench
      if (st.until > Date.now() && !(round === 1 && OVERPASS_MIRRORS.indexOf(url) < 3)) continue;
      tried += 1;
      try {
        const res = await fetch(url, overpassInit(query));
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith("{")) {
          benched.delete(url);
          return JSON.parse(text) as T;
        }
        throw new Error(`HTTP ${res.status}`);
      } catch {
        const strikes = st.strikes + 1;
        benched.set(url, { until: Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** (strikes - 1)), strikes });
      }
    }
    if (round === 0) await new Promise((r) => setTimeout(r, tried ? 3000 : 0));
  }
  return null;
}
