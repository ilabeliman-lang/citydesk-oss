import { createServerFn } from "@tanstack/react-start";

type Spot = { lat: number; lng: number };

function thin(points: Spot[], max = 60): Spot[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const kept = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

export const driveRoute = createServerFn({ method: "POST" })
  .validator((input: { fromLat: number; fromLng: number; toLat: number; toLng: number }) => {
    const nums = [input?.fromLat, input?.fromLng, input?.toLat, input?.toLng].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) throw new Error("Location required");
    const [fromLat, fromLng, toLat, toLng] = nums;
    if (fromLat < -90 || fromLat > 90 || toLat < -90 || toLat > 90) throw new Error("Location required");
    if (fromLng < -180 || fromLng > 180 || toLng < -180 || toLng > 180) throw new Error("Location required");
    return { fromLat, fromLng, toLat, toLng };
  })
  .handler(async ({ data }) => cartoRoute(data));

/** CARTO road route as a plain server function (also used by /api/trip-route for registry trips). */
export async function cartoRoute(data: { fromLat: number; fromLng: number; toLat: number; toLng: number }): Promise<{ ok: boolean; points: Spot[] }> {
  {
    const token = process.env.CARTO_TOKEN?.trim();
    if (!token) return { ok: false, points: [] };
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "route",
        arguments: {
          operation: "route",
          origin: `${data.fromLng},${data.fromLat}`,
          destination: `${data.toLng},${data.toLat}`,
          mode: "car",
          overview: "simplified",
        },
      },
    };
    try {
      const res = await fetch("https://gcp-us-east1.api.carto.com/mcp/ac_sx3n97hj", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, points: [] };
      const raw = await res.text();
      const line = raw.split("\n").find((row) => row.startsWith("data:"));
      if (!line) return { ok: false, points: [] };
      const body = JSON.parse(line.slice(5)) as {
        result?: { content?: { text?: string }[]; isError?: boolean };
      };
      if (body.result?.isError) return { ok: false, points: [] };
      const text = body.result?.content?.[0]?.text;
      if (!text) return { ok: false, points: [] };
      const parsed = JSON.parse(text) as {
        data?: { value?: { route?: { coordinates?: [number, number][] } } };
      };
      const coords = parsed.data?.value?.route?.coordinates ?? [];
      const points = coords
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map(([lng, lat]) => ({ lat, lng }));
      if (points.length < 2) return { ok: false, points: [] };
      return { ok: true, points: thin(points) };
    } catch {
      return { ok: false, points: [] };
    }
  }
}
