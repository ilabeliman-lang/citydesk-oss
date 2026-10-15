/**
 * NDU-UPG #51 #56 #62 #89: building heights from OpenStreetMap tags, with priors when tags are missing.
 * Pure (no DOM / no map) so it unit-tests (#100). Metres throughout.
 *
 * Order: `height` (or `building:height`) → `building:levels` × LEVEL_M + roof allowance →
 * building-type prior → landuse prior → default. `min_height` / `building:min_level` lift the base
 * (overhangs, bridges, building:part towers on podiums). A `height` of 0 is treated as missing —
 * OSM has many `height=0` + `building:levels=10` buildings that the vector tiles draw flat.
 */

export type Tags = Record<string, string | undefined>;

export const LEVEL_M = 3.0;
/** Ground-floor plinth below 0 so buildings never float on sloped terrain (#89). */
export const PLINTH_M = 0;
export const MAX_M = 830;

export type HeightSource = "height" | "levels" | "type" | "landuse" | "default";

export type Resolved = {
  /** Top of the extrusion, metres above ground. */
  height: number;
  /** Bottom of the extrusion (min_height), metres above ground. */
  base: number;
  /** Levels used (tagged or inferred). */
  levels: number;
  source: HeightSource;
  /** True when height comes from tags (quality chip #70). */
  tagged: boolean;
};

/** Parse an OSM length: "12", "12 m", "12.5m", "12,5", "40'", "40 ft", "13'6\"". Null if absent/invalid/≤0. */
export function parseLength(raw: string | undefined): number | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase().replace(",", ".");
  if (!v) return null;
  const feet = v.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in))?$/);
  if (feet) {
    const m = Number(feet[1]) * 0.3048 + (feet[2] ? Number(feet[2]) * 0.0254 : 0);
    return m > 0 ? m : null;
  }
  const metres = v.match(/^(-?\d+(?:\.\d+)?)\s*(?:m|metres|meters|meter|metre)?$/);
  if (!metres) return null;
  const m = Number(metres[1]);
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** Parse a level count ("3", "3.5", "2;3" → first). Null if absent/invalid/<0. */
export function parseLevels(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).split(/[;,]/)[0].trim());
  return Number.isFinite(n) && n >= 0 && n < 200 ? n : null;
}

type Prior = { levels: number; levelM?: number };

/** Typical size by `building=*` value (P1 #56 refinement: the type is usually tagged even when height isn't). */
const TYPE_PRIORS: Record<string, Prior> = {
  house: { levels: 2 }, detached: { levels: 2 }, semidetached_house: { levels: 2 }, terrace: { levels: 2 },
  bungalow: { levels: 1 }, hut: { levels: 1, levelM: 2.6 }, cabin: { levels: 1, levelM: 2.8 }, shed: { levels: 1, levelM: 2.6 },
  garage: { levels: 1, levelM: 2.8 }, garages: { levels: 1, levelM: 2.8 }, carport: { levels: 1, levelM: 2.6 }, kiosk: { levels: 1, levelM: 2.8 },
  toilets: { levels: 1, levelM: 2.8 }, container: { levels: 1, levelM: 2.6 }, roof: { levels: 1, levelM: 4 },
  apartments: { levels: 4 }, residential: { levels: 3 }, dormitory: { levels: 4 }, hotel: { levels: 6 },
  commercial: { levels: 3 }, office: { levels: 4 }, retail: { levels: 1, levelM: 4.5 }, supermarket: { levels: 1, levelM: 6 },
  industrial: { levels: 1, levelM: 7 }, warehouse: { levels: 1, levelM: 8 }, manufacture: { levels: 1, levelM: 8 }, hangar: { levels: 1, levelM: 10 },
  church: { levels: 1, levelM: 11 }, cathedral: { levels: 1, levelM: 20 }, chapel: { levels: 1, levelM: 7 }, mosque: { levels: 1, levelM: 10 },
  temple: { levels: 1, levelM: 9 }, school: { levels: 2, levelM: 3.4 }, university: { levels: 3, levelM: 3.6 }, college: { levels: 3, levelM: 3.4 },
  hospital: { levels: 4, levelM: 3.6 }, civic: { levels: 3, levelM: 3.6 }, public: { levels: 2, levelM: 3.6 }, government: { levels: 3, levelM: 3.6 },
  parking: { levels: 3, levelM: 2.8 }, train_station: { levels: 1, levelM: 9 }, transportation: { levels: 1, levelM: 6 }, stadium: { levels: 1, levelM: 18 },
  grandstand: { levels: 1, levelM: 8 }, greenhouse: { levels: 1, levelM: 3.2 }, farm_auxiliary: { levels: 1, levelM: 4.5 }, barn: { levels: 1, levelM: 6 },
  service: { levels: 1, levelM: 3 }, construction: { levels: 1, levelM: 3 }, ruins: { levels: 1, levelM: 2.4 },
};

/** Default height model per landuse when nothing else is known (#56). */
const LANDUSE_PRIORS: Record<string, Prior> = {
  residential: { levels: 2 },
  commercial: { levels: 3 },
  retail: { levels: 2, levelM: 3.6 },
  industrial: { levels: 1, levelM: 7 },
  railway: { levels: 1, levelM: 6 },
  military: { levels: 1, levelM: 4 },
  farmyard: { levels: 1, levelM: 4 },
  construction: { levels: 1 },
  education: { levels: 2, levelM: 3.4 },
  religious: { levels: 1, levelM: 8 },
  institutional: { levels: 3, levelM: 3.4 },
};

export const DEFAULT_PRIOR: Prior = { levels: 2 };

/** Roof allowance on top of levels × LEVEL_M: roof:height, else roof:levels, else pitched-roof or parapet. */
export function roofAllowance(tags: Tags): number {
  const h = parseLength(tags["roof:height"]);
  if (h != null) return h;
  const rl = parseLevels(tags["roof:levels"]);
  if (rl != null && rl > 0) return rl * LEVEL_M * 0.75;
  const shape = tags["roof:shape"];
  if (shape && shape !== "flat") return 1.5;
  return 0.6;
}

export function resolveHeight(tags: Tags, landuse?: string): Resolved {
  const kind = tags.building && tags.building !== "yes" ? tags.building : tags["building:part"] && tags["building:part"] !== "yes" ? tags["building:part"] : undefined;
  const minLevel = parseLevels(tags["building:min_level"]);
  let base = parseLength(tags.min_height) ?? (minLevel != null ? minLevel * LEVEL_M : 0);
  const levelsTag = parseLevels(tags["building:levels"]);
  const tagged = parseLength(tags.height) ?? parseLength(tags["building:height"]);
  let height: number;
  let levels: number;
  let source: HeightSource;
  if (tagged != null) {
    height = tagged;
    levels = levelsTag ?? Math.max(1, Math.round((tagged - base) / LEVEL_M));
    source = "height";
  } else if (levelsTag != null && levelsTag > 0) {
    // Simple 3D Buildings: building:levels counts from the ground (min_level only skips the bottom ones).
    levels = levelsTag;
    height = levelsTag * LEVEL_M + roofAllowance(tags);
    source = "levels";
  } else {
    const typePrior = kind ? TYPE_PRIORS[kind] : undefined;
    const landPrior = landuse ? LANDUSE_PRIORS[landuse] : undefined;
    const prior = typePrior ?? landPrior ?? DEFAULT_PRIOR;
    source = typePrior ? "type" : landPrior ? "landuse" : "default";
    levels = prior.levels;
    height = base + prior.levels * (prior.levelM ?? LEVEL_M) + roofAllowance(tags);
  }
  if (kind === "roof" && tags.min_height == null && minLevel == null) base = Math.max(0, height - 0.6); // canopies float
  height = Math.min(MAX_M, Math.max(height, base + 1));
  return { height: round1(height), base: round1(Math.max(base, PLINTH_M)), levels, source, tagged: source === "height" || source === "levels" };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
