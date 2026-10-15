import { createServerFn } from "@tanstack/react-start";

export type Road = { id: string; points: { lat: number; lng: number }[] };

function fallbackRoads(lat: number, lng: number): Road[] {
  const d = 0.004;
  return [
    { id: "north", points: [{ lat: lat - d, lng }, { lat: lat + d, lng }] },
    { id: "east", points: [{ lat, lng: lng - d }, { lat, lng: lng + d }] },
  ];
}

function thin(points: { lat: number; lng: number }[]) {
  if (points.length <= 16) return points;
  const step = Math.ceil(points.length / 16);
  const kept = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

export const streetRoads = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<Road[]> => {
    const query = `[out:json][timeout:12];way["highway"~"^(primary|secondary|tertiary|residential|unclassified)$"](around:450,${data.lat},${data.lng});out geom 8;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) return fallbackRoads(data.lat, data.lng);
      const body = (await res.json()) as {
        elements?: { id: number; geometry?: { lat: number; lon: number }[] }[];
      };
      const roads: Road[] = [];
      for (const el of body.elements ?? []) {
        const points = thin((el.geometry ?? []).map((point) => ({ lat: point.lat, lng: point.lon }))).filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
        );
        if (points.length < 2) continue;
        roads.push({ id: String(el.id), points });
        if (roads.length >= 8) break;
      }
      return roads.length ? roads : fallbackRoads(data.lat, data.lng);
    } catch {
      return fallbackRoads(data.lat, data.lng);
    }
  });
