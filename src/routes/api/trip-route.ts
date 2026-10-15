import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-to-server route planner for City Desk Map Registry trips (called by NEURA Spaces on this host).
 * Order: self-hosted Valhalla (127.0.0.1:8002) → OSM path network (paths.ts Dijkstra) for walks → CARTO road route (carto.ts, if CARTO_TOKEN) →
 * OSRM public demo (OpenStreetMap roads, light use, cached) → honest straight line.
 */
type Pt = { lat: number; lng: number };
const cache = new Map<string, { t: number; v: unknown }>();
let lastOsrm = 0;

function meters(a: Pt, b: Pt) {
  const r = 6_371_000, k = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * k) / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(((b.lng - a.lng) * k) / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}
function length(points: Pt[]) {
  let d = 0;
  for (let i = 1; i < points.length; i += 1) d += meters(points[i - 1], points[i]);
  return d;
}

async function osrm(from: Pt, to: Pt): Promise<Pt[] | null> {
  const wait = 1100 - (Date.now() - lastOsrm);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOsrm = Date.now();
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url, { headers: { "user-agent": "CityDesk/1.0 (Ndu township trips; cached)" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
    const pts = (j.routes?.[0]?.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
    return pts.length > 1 ? pts : null;
  } catch {
    return null;
  }
}


/** Self-hosted Valhalla (docker osm-valhalla, 127.0.0.1:8002, Hawaii OSM). Tried first; null → fall through. */
function decode6(str: string): Pt[] {
  const out: Pt[] = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let r = 0, sh = 0, b;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return out;
}
async function valhalla(mode: string, from: Pt, to: Pt): Promise<Pt[] | null> {
  try {
    const res = await fetch((process.env.VALHALLA_URL ?? "http://127.0.0.1:8002") + "/route", {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ locations: [{ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }], costing: mode === "drive" ? "auto" : "pedestrian" }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { trip?: { legs?: { shape?: string }[] } };
    const pts = (j.trip?.legs ?? []).flatMap((l) => (l.shape ? decode6(l.shape) : []));
    return pts.length > 1 ? pts : null;
  } catch {
    return null;
  }
}

async function plan(mode: string, from: Pt, to: Pt) {
  const dist = meters(from, to);
  const vh = await valhalla(mode, from, to);
  if (vh) {
    const points = [from, ...vh, to];
    return { source: "valhalla", points, meters: length(points) };
  }
  if (mode === "walk" && dist <= 2500) {
    const { fetchWays, buildWays, snapPose, netRoute } = await import("@/world/paths");
    const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
    const ways = await fetchWays(mid.lat, mid.lng, Math.round(Math.min(1300, dist / 2 + 250))).catch(() => []);
    const net = ways.length ? buildWays(ways) : null;
    if (net) {
      const a = snapPose(net, from.lat, from.lng, 90);
      const b = snapPose(net, to.lat, to.lng, 90);
      const walk = a && b ? netRoute(net, a, b) : null;
      if (walk && walk.length > 1) {
        const points = [from, ...walk, to];
        return { source: "paths", points, meters: length(points) };
      }
    }
  }
  const { cartoRoute } = await import("@/world/carto");
  const road = await cartoRoute({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng }).catch(() => ({ ok: false, points: [] as Pt[] }));
  if (road.ok && road.points.length > 1) {
    const points = [from, ...road.points, to];
    return { source: "road", points, meters: length(points) };
  }
  const o = await osrm(from, to);
  if (o) {
    const points = [from, ...o, to];
    return { source: "osrm", points, meters: length(points) };
  }
  return { source: "line", points: [from, to], meters: dist, note: "Straight line · not road-snapped" };
}

export const Route = createFileRoute("/api/trip-route")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { bridgeAllowed } = await import("@/world/registryBridge.server");
        if (request.headers.get("x-forwarded-for") || !bridgeAllowed(request.headers.get("x-citydesk-bridge"))) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        const b = (await request.json().catch(() => null)) as { mode?: string; from?: Pt; to?: Pt } | null;
        const ok = (p?: Pt) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
        if (!b || !ok(b.from) || !ok(b.to)) return Response.json({ ok: false, error: "from/to required" }, { status: 400 });
        const mode = b.mode === "drive" ? "drive" : "walk";
        const from = { lat: Number(b.from!.lat), lng: Number(b.from!.lng) };
        const to = { lat: Number(b.to!.lat), lng: Number(b.to!.lng) };
        const key = `${mode}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
        const hit = cache.get(key);
        if (hit && Date.now() - hit.t < 60 * 60_000) return Response.json({ ok: true, cached: true, ...(hit.v as object) });
        const v = await plan(mode, from, to);
        if (v.source !== "line") cache.set(key, { t: Date.now(), v });
        if (cache.size > 500) cache.delete(cache.keys().next().value as string);
        return Response.json({ ok: true, ...v });
      },
    },
  },
});
