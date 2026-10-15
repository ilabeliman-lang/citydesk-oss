/**
 * NDU-UPG life #201 [P0]: road hierarchy at true scale. From z16 up, the basemap's road lines get
 * their real carriageway width in metres (exponential base 2, so it scales with the map exactly like
 * the 1.75 m figures and the 3D vehicles in their lanes). Below z16 the style is untouched, and a road
 * is never drawn thinner than the style already drew it. Returns a restore function.
 */

type StyleLayer = { id: string; type: string; source?: string };
export type WidthMap = {
  getStyle: () => { layers?: StyleLayer[] } | undefined;
  getPaintProperty: (layer: string, name: string) => unknown;
  setPaintProperty: (layer: string, name: string, value: unknown) => void;
};

const CLASS_M: [RegExp, number][] = [
  [/motorway_link|_link(_|$)/, 6.5],
  [/motorway/, 14],
  [/trunk_primary/, 12],
  [/secondary_tertiary/, 9],
  [/minor|street/, 7],
  [/service_track/, 4.5],
  [/path_pedestrian/, 2.4],
];

export function metresFor(id: string): number | null {
  if (!/^(road|bridge|tunnel)_/.test(id) || /rail|hatching|area|oneway|label/.test(id)) return null;
  for (const [re, m] of CLASS_M) if (re.test(id)) return m + (/casing/.test(id) ? 1.6 : 0);
  return null;
}

/** MapLibre (512 px tiles) metres per pixel. */
export const metresPerPx = (lat: number, zoom: number) => (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

type Interp = { base: number; stops: [number, number][] };

export function readInterp(v: unknown): Interp | null {
  if (!Array.isArray(v) || v[0] !== "interpolate" || !Array.isArray(v[2]) || v[2][0] !== "zoom") return null;
  const kind = v[1] as unknown[];
  const base = Array.isArray(kind) && kind[0] === "exponential" ? Number(kind[1]) : 1;
  const stops: [number, number][] = [];
  for (let i = 3; i + 1 < v.length; i += 2) {
    if (typeof v[i] !== "number" || typeof v[i + 1] !== "number") return null;
    stops.push([v[i] as number, v[i + 1] as number]);
  }
  return stops.length ? { base: Number.isFinite(base) && base > 0 ? base : 1, stops } : null;
}

export function evalInterp(f: Interp, z: number): number {
  const s = f.stops;
  if (z <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i += 1) {
    const [z1, v1] = s[i];
    const [z0, v0] = s[i - 1];
    if (z <= z1) {
      const span = z1 - z0 || 1;
      const t = f.base === 1 ? (z - z0) / span : (f.base ** (z - z0) - 1) / (f.base ** span - 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return s[s.length - 1][1];
}

/** The new width expression for one layer (pure, unit tested). */
export function trueWidth(original: unknown, metres: number, lat: number): unknown[] | null {
  const f = readInterp(original);
  if (!f) return null;
  const out: unknown[] = ["interpolate", ["exponential", 2], ["zoom"]];
  for (const [z, v] of f.stops) if (z < 16) out.push(z, v);
  for (let z = 16; z <= 22; z += 1) out.push(z, Math.round(Math.max(evalInterp(f, z), metres / metresPerPx(lat, z)) * 100) / 100);
  return out;
}

export function applyRoadWidths(map: WidthMap, lat: number): () => void {
  const saved: [string, unknown][] = [];
  try {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.type !== "line") continue;
      const metres = metresFor(layer.id);
      if (metres == null) continue;
      const original = map.getPaintProperty(layer.id, "line-width");
      const next = trueWidth(original, metres, lat);
      if (!next) continue;
      map.setPaintProperty(layer.id, "line-width", next);
      saved.push([layer.id, original]);
    }
  } catch {
    // a style without these layers keeps its own widths
  }
  return () => {
    for (const [id, original] of saved) {
      try {
        map.setPaintProperty(id, "line-width", original);
      } catch {
        // style already gone
      }
    }
  };
}
