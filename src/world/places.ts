export type LifeKind = "eat" | "shift" | "rest" | "wash" | "care";

export type Place = {
  id: string;
  name: string;
  kind: LifeKind;
  lat: number;
  lng: number;
  source?: "google" | "osm" | "ring";
  offer?: string;
  verified?: boolean;
  category?: string;
};

const FALLBACKS: { name: string; kind: LifeKind; dlat: number; dlng: number }[] = [
  { name: "Zealous Pane (Jarvis Verse)", kind: "shift", dlat: 0.0001, dlng: 0.0002 },
  { name: "Food stall", kind: "eat", dlat: 0.0012, dlng: 0.0004 },
  { name: "Corner shop", kind: "shift", dlat: -0.0008, dlng: 0.0011 },
  { name: "Shade bench", kind: "rest", dlat: 0.0003, dlng: -0.0012 },
  { name: "Standpipe", kind: "wash", dlat: -0.0011, dlng: -0.0005 },
  { name: "Chemist", kind: "care", dlat: 0.0006, dlng: 0.001 },
];

export function fallbackPlaces(lat: number, lng: number): Place[] {
  return FALLBACKS.map((spot) => ({
    id: spot.name,
    name: spot.name,
    kind: spot.kind,
    lat: lat + spot.dlat,
    lng: lng + spot.dlng,
  }));
}

function kindOf(tags: Record<string, string>): LifeKind | null {
  const amenity = tags.amenity ?? "";
  const shop = tags.shop ?? "";
  if (["restaurant", "fast_food", "cafe", "marketplace", "food_court", "bar"].includes(amenity)) return "eat";
  if (["bakery", "butcher", "greengrocer", "supermarket", "convenience"].includes(shop)) return "eat";
  if (["hospital", "clinic", "pharmacy", "doctors"].includes(amenity) || shop === "chemist") return "care";
  if (["toilets", "drinking_water"].includes(amenity)) return "wash";
  if (["place_of_worship", "park", "bench"].includes(amenity) || tags.leisure === "park") return "rest";
  if (amenity || shop) return "shift";
  return null;
}

import { createServerFn } from "@tanstack/react-start";
import { overpassFetch } from "@/world/overpass";

/** Registry place kinds (labels from OSM tags; © OpenStreetMap contributors, ODbL). */
export type PlaceCategory = "station" | "bus" | "airport" | "pool" | "hotel" | "salon" | "food" | "venue" | "park" | "office" | "shop" | "care" | "other";
export const CATEGORY_ICON: Record<PlaceCategory, string> = { station: "🚉", bus: "🚌", airport: "✈️", pool: "🏊", hotel: "🏨", salon: "💇", food: "🍽️", venue: "🎭", park: "🌳", office: "🏢", shop: "🛍️", care: "⚕️", other: "📍" };
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export function categoryOf(t: Record<string, string>): PlaceCategory {
  const a = t.amenity ?? "", s = t.shop ?? "", l = t.leisure ?? "", tu = t.tourism ?? "";
  if (t.aeroway === "aerodrome" || t.aeroway === "terminal") return "airport";
  if (t.railway === "station" || t.railway === "halt" || t.station) return "station";
  if (t.highway === "bus_stop" || a === "bus_station" || t.public_transport === "platform" || t.public_transport === "stop_position") return "bus";
  if (l === "swimming_pool" || l === "water_park" || t.sport === "swimming") return "pool";
  if (["hotel", "motel", "guest_house", "hostel"].includes(tu)) return "hotel";
  if (["hairdresser", "beauty", "barber"].includes(s)) return "salon";
  if (["restaurant", "cafe", "fast_food", "food_court", "bar", "pub"].includes(a)) return "food";
  if (["theatre", "cinema", "events_venue", "nightclub", "arts_centre", "conference_centre", "community_centre"].includes(a) || l === "stadium") return "venue";
  if (l === "park" || l === "garden") return "park";
  if (t.office || t.company) return "office";
  if (["hospital", "clinic", "pharmacy", "doctors", "dentist"].includes(a)) return "care";
  if (s) return "shop";
  return "other";
}
/** ODbL allows caching; keep Overpass load low (30 min per ~100 m cell). */
const placeCache = new Map<string, { t: number; v: Place[] }>();

async function loadPlaces(lat: number, lng: number): Promise<Place[]> {
  const ck = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = placeCache.get(ck);
  if (hit && Date.now() - hit.t < 30 * 60_000) return hit.v;
  const v = await loadPlacesRaw(lat, lng);
  if (v.some((p) => p.source === "osm" && p.id !== "place-zealous-pane")) placeCache.set(ck, { t: Date.now(), v });
  if (placeCache.size > 300) placeCache.delete(placeCache.keys().next().value as string);
  return v;
}

async function loadPlacesRaw(lat: number, lng: number): Promise<Place[]> {
  const query = `[out:json][timeout:18];(node["name"]["leisure"](around:650,${lat},${lng});node["name"]["public_transport"](around:650,${lat},${lng});node["name"]["railway"~"station|halt"](around:650,${lat},${lng});nwr["name"]["aeroway"~"aerodrome|terminal"](around:650,${lat},${lng});node["name"]["amenity"](around:650,${lat},${lng});node["name"]["shop"](around:650,${lat},${lng});node["name"]["craft"](around:650,${lat},${lng});node["name"]["office"](around:650,${lat},${lng});node["name"]["tourism"](around:650,${lat},${lng});way["name"]["amenity"](around:650,${lat},${lng});way["name"]["shop"](around:650,${lat},${lng}););out center 60;`;
  try {
    type OsmBody = {
      elements?: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
    };
    let body = await overpassFetch<OsmBody>(query);
    if (!body) {
      // Every Overpass mirror is down: use the City Desk registry's stored OSM labels (imported earlier, ODbL).
      const { registryPlacesNear } = await import("@/world/registryBridge.server");
      const reg = await registryPlacesNear(lat, lng, 650);
      if (!reg.length) return fallbackPlaces(lat, lng);
      body = { elements: reg.map((r) => ({ id: r.id, lat: r.lat, lon: r.lng, tags: { ...Object.fromEntries(Object.entries(r.tags ?? {}).filter(([, v]) => typeof v === "string")), name: r.label } as Record<string, string> })) };
    }
    const places: Place[] = [];
    for (const el of body.elements ?? []) {
      const latP = el.lat ?? el.center?.lat;
      const lngP = el.lon ?? el.center?.lon;
      if (latP == null || lngP == null || !el.tags?.name) continue;
      const kind = kindOf(el.tags) ?? (el.tags.leisure || el.tags.public_transport || el.tags.railway || el.tags.aeroway ? "rest" : null);
      if (!kind) continue;
      const name = el.tags.name;
      if (places.some((place) => place.name === name)) continue;
      places.push({
        id: String(el.id),
        name,
        kind,
        lat: latP,
        lng: lngP,
        source: "osm",
        offer: el.tags.shop || el.tags.amenity || el.tags.office || el.tags.tourism || el.tags.leisure || el.tags.public_transport || "place",
        category: categoryOf(el.tags),
      });
      if (places.length >= 40) break;
    }
    const hq: Place = {
      id: "place-zealous-pane",
      name: "Zealous Pane (Jarvis Verse)",
      kind: "shift",
      lat: lat + 0.0001,
      lng: lng + 0.0002,
      source: "osm",
      offer: "office",
    };
    return [hq, ...(places.length ? places : fallbackPlaces(lat, lng).slice(1))];
  } catch {
    return fallbackPlaces(lat, lng);
  }
}

export const streetPlaces = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }) => loadPlaces(data.lat, data.lng));

export function kindLabel(kind: LifeKind) {
  if (kind === "eat") return "Eat · 10";
  if (kind === "shift") return "Work a shift";
  if (kind === "rest") return "Rest";
  if (kind === "wash") return "Wash";
  return "Chemist";
}
