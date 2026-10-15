/**
 * NDU-AI avatar-bot assistant: runs ONE validated tool call against the live map. Every branch is a
 * view-only action (camera, layer visibility, weather preview, opening the scan panel after the player
 * confirmed). There is no generic dispatch and no import of any wallet / mint / payment / property-claim
 * module. Loaded lazily with the assistant panel.
 */
import { REAL_BUILDINGS, REAL_ROOFS } from "@/world/realism/layers";
import { immerseAllowed } from "@/world/immerse/flag";
import { getBridge, OPEN_SCANS_EVENT, type BridgePlace } from "./bridgeStore";
import { best } from "./match";
import { recallPlace, type AssistantMemory } from "./memory";
import type { LayerName, ToolCall } from "./tools";

type Feature = {
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
  layer?: { id: string; type?: string };
  sourceLayer?: string;
};
type MapLike = {
  flyTo?: (o: {
    center: [number, number];
    zoom?: number;
    pitch?: number;
    duration?: number;
    essential?: boolean;
  }) => void;
  easeTo?: (o: { center: [number, number]; zoom?: number; duration?: number }) => void;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  getCanvas: () => { clientWidth: number; clientHeight: number };
  queryRenderedFeatures: (geomOrOpts?: unknown, opts?: unknown) => Feature[];
  getStyle: () => { layers?: { id: string; type: string }[] } | undefined;
  getLayer: (id: string) => unknown;
  setLayoutProperty: (id: string, prop: string, value: unknown) => void;
};

export type ToolResult = {
  ok: boolean;
  text: string;
  place?: { name: string; lat: number; lng: number };
};

const map = (): MapLike | null => getBridge().map as MapLike | null;
const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function fly(m: MapLike, lat: number, lng: number) {
  const zoom = Math.max(17.4, Math.min(18.6, m.getZoom()));
  if (m.flyTo)
    m.flyTo({ center: [lng, lat], zoom, duration: reduced() ? 0 : 1600, essential: true });
  else m.easeTo?.({ center: [lng, lat], zoom, duration: 0 });
}

function centerOf(f: Feature): { lat: number; lng: number } | null {
  const g = f.geometry;
  if (!g) return null;
  const pts: number[][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number")
      pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g.coordinates);
  if (!pts.length) return null;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const nameOf = (f: Feature) => String(f.properties?.name ?? f.properties?.["name:en"] ?? "").trim();

/** Named things currently drawn on the map (buildings, shops, streets) plus the nearby places list. */
function namedInView(m: MapLike): BridgePlace[] {
  const out: BridgePlace[] = [];
  let feats: Feature[] = [];
  try {
    feats = m.queryRenderedFeatures();
  } catch {
    feats = [];
  }
  for (const f of feats.slice(0, 4000)) {
    const name = nameOf(f);
    if (!name || out.some((p) => p.name === name)) continue;
    const c = centerOf(f);
    if (c) out.push({ name, ...c, kind: String(f.properties?.class ?? f.sourceLayer ?? "") });
  }
  return [...getBridge().places, ...out];
}

const LAYER_IDS: Record<Exclude<LayerName, "effects">, (m: MapLike) => string[]> = {
  buildings: () => ["building-3d", "building", REAL_BUILDINGS, REAL_ROOFS],
  labels: (m) => (m.getStyle()?.layers ?? []).filter((l) => l.type === "symbol").map((l) => l.id),
  route: () => ["ndu-trip-done", "ndu-trip-casing", "ndu-trip-left", "ndu-trip-origin"],
};

const LAYER_WORD: Record<LayerName, string> = {
  buildings: "3D buildings",
  labels: "map labels",
  route: "route line",
  effects: "weather effects",
};

async function explain(m: MapLike): Promise<string> {
  const canvas = m.getCanvas();
  const pt = [canvas.clientWidth / 2, canvas.clientHeight / 2];
  const box = [
    [pt[0] - 40, pt[1] - 40],
    [pt[0] + 40, pt[1] + 40],
  ];
  let feats: Feature[] = [];
  try {
    feats = m.queryRenderedFeatures(box);
  } catch {
    feats = [];
  }
  const building = feats.find(
    (f) => /building/.test(f.layer?.id ?? "") || f.sourceLayer === "building",
  );
  const street = feats.find(
    (f) =>
      f.sourceLayer === "transportation_name" || (f.sourceLayer === "transportation" && nameOf(f)),
  );
  const poi = feats.find((f) => f.sourceLayer === "poi" && nameOf(f));
  const bits: string[] = [];
  if (building) {
    const h = Number(building.properties?.render_height ?? building.properties?.height ?? 0);
    const name = nameOf(building);
    bits.push(
      `${name ? name : "A building"} in front of you${h ? `, about ${Math.round(h)} m tall (roughly ${Math.max(1, Math.round(h / 3))} floors)` : ""}`,
    );
  }
  if (poi)
    bits.push(
      `${nameOf(poi)}${poi.properties?.class ? ` (${String(poi.properties.class).replace(/_/g, " ")})` : ""} is right here`,
    );
  if (street) bits.push(`You're on ${nameOf(street)}`);
  try {
    const [{ getImmerse }, { KIND_LABEL, kindFromCode }] = await Promise.all([
      import("@/world/immerse/store"),
      import("@/world/immerse/weather"),
    ]);
    const s = getImmerse();
    const kind = s.override ?? (s.live ? kindFromCode(s.live.code) : null);
    if (kind)
      bits.push(
        `Weather: ${KIND_LABEL[kind].toLowerCase()}${s.live && !s.override ? `, ${Math.round(s.live.temp)}°C` : " (preview)"}`,
      );
  } catch {
    // weather module off
  }
  if (!bits.length) return "Open ground here. Tap a building or ask me to find something by name.";
  return bits.join(". ") + ".";
}

export async function runTool(call: ToolCall, mem: AssistantMemory): Promise<ToolResult> {
  const m = map();
  switch (call.name) {
    case "fly_to": {
      if (!m) return { ok: false, text: "The map is still loading." };
      const q = call.args.query;
      if (/^(me|my spot|home|back)$/i.test(q)) {
        const you = getBridge().home();
        if (!you) return { ok: false, text: "I can't see your figure yet." };
        fly(m, you.lat, you.lng);
        return { ok: true, text: "Back to you." };
      }
      const hit = recallPlace(mem, q) ?? best(q, namedInView(m));
      if (!hit)
        return {
          ok: false,
          text: `I couldn't find “${q}” nearby. Try a name you can see on the map.`,
        };
      fly(m, hit.lat, hit.lng);
      return {
        ok: true,
        text: `Flying to ${hit.name}.`,
        place: { name: hit.name, lat: hit.lat, lng: hit.lng },
      };
    }
    case "find_place": {
      if (!m) return { ok: false, text: "The map is still loading." };
      const hit = best(call.args.query, namedInView(m));
      if (!hit)
        return {
          ok: false,
          text: `No “${call.args.query}” in view. Zoom out or try another name.`,
        };
      fly(m, hit.lat, hit.lng);
      return {
        ok: true,
        text: `Found ${hit.name}${hit.kind ? ` (${hit.kind.replace(/_/g, " ")})` : ""}. Tap it to look inside.`,
        place: { name: hit.name, lat: hit.lat, lng: hit.lng },
      };
    }
    case "explain_view":
      if (!m) return { ok: false, text: "The map is still loading." };
      return { ok: true, text: await explain(m) };
    case "toggle_layer": {
      const { layer, on } = call.args;
      if (layer === "effects") {
        if (!immerseAllowed())
          return { ok: false, text: "Weather effects are switched off in this build." };
        const { setEnabled } = await import("@/world/immerse/store");
        setEnabled(on);
        return { ok: true, text: `${on ? "Showing" : "Hiding"} ${LAYER_WORD[layer]}.` };
      }
      if (!m) return { ok: false, text: "The map is still loading." };
      let n = 0;
      for (const id of LAYER_IDS[layer](m)) {
        try {
          if (!m.getLayer(id)) continue;
          m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
          n += 1;
        } catch {
          // layer gone
        }
      }
      return n
        ? { ok: true, text: `${on ? "Showing" : "Hiding"} ${LAYER_WORD[layer]}.` }
        : { ok: false, text: `There's no ${LAYER_WORD[layer]} on the map right now.` };
    }
    case "set_weather": {
      if (!immerseAllowed())
        return { ok: false, text: "Weather effects are switched off in this build." };
      const { setOverride, setEnabled, getImmerse } = await import("@/world/immerse/store");
      const kind = call.args.kind;
      if (kind === "live") {
        setOverride(null);
        return { ok: true, text: "Back to the live weather." };
      }
      if (!getImmerse().enabled) setEnabled(true);
      setOverride(kind);
      return { ok: true, text: `Previewing ${kind} weather. Say “live weather” to go back.` };
    }
    case "start_scan":
      window.dispatchEvent(new CustomEvent(OPEN_SCANS_EVENT));
      return {
        ok: true,
        text: "Scan panel is open. Pick a file there; I don't upload anything myself.",
      };
  }
}
