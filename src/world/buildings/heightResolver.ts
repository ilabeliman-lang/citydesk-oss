/**
 * Category 2: Building Realism & City Data (items 51–100)
 * Height Resolver: calculates building height in meters from OpenStreetMap tags,
 * with overhang support and landuse priors when tags are missing.
 */

export type Tags = Record<string, string | undefined>;

export const DEFAULT_LEVEL_HEIGHT_M = 3.0;

export type HeightSource = 'explicit' | 'levels' | 'prior';

export interface BuildingHeightResolution {
  heightM: number;
  minHeightM: number;
  levels: number;
  source: HeightSource;
}

export interface LandusePrior {
  levels: number;
  heightM: number;
}

/**
 * Standard landuse priors:
 * - residential: 2 levels = 6.0m
 * - commercial: 3 levels = 9.0m
 * - retail: 2 levels = 6.0m
 * - industrial: 1 tall level = 7.5m
 * - default fallback: 1 level = 3.5m
 */
export const LANDUSE_PRIORS: Record<string, LandusePrior> = {
  residential: { levels: 2, heightM: 6.0 },
  commercial: { levels: 3, heightM: 9.0 },
  retail: { levels: 2, heightM: 6.0 },
  industrial: { levels: 1, heightM: 7.5 },
  default: { levels: 1, heightM: 3.5 },
};

/**
 * Building tag values mapped to corresponding landuse priors.
 */
const BUILDING_TYPE_TO_LANDUSE: Record<string, string> = {
  // Residential types
  house: 'residential',
  detached: 'residential',
  semidetached_house: 'residential',
  terrace: 'residential',
  bungalow: 'residential',
  apartments: 'residential',
  residential: 'residential',
  dormitory: 'residential',

  // Commercial / Office types
  commercial: 'commercial',
  office: 'commercial',
  hotel: 'commercial',
  civic: 'commercial',
  government: 'commercial',

  // Retail types
  retail: 'retail',
  shop: 'retail',
  supermarket: 'retail',
  kiosk: 'retail',

  // Industrial types
  industrial: 'industrial',
  warehouse: 'industrial',
  manufacture: 'industrial',
  hangar: 'industrial',
  factory: 'industrial',
};

/**
 * Round a number to specified decimal places (default 2).
 */
export function roundTo(val: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

/**
 * Parse an OSM length string into meters.
 * Handles: "15", "15 m", "15m", "15.5 m", "15,5", "40'", "40 ft", "13'6\"", "13 ft 6 in", "15 meters", etc.
 * Returns null if absent, unparseable, or <= 0 (height=0 is treated as missing).
 */
export function parseHeight(raw: string | undefined): number | null {
  if (raw == null) return null;
  const str = String(raw).trim().toLowerCase();
  if (!str) return null;

  // Replace comma with dot for decimal values like "15,5"
  const normalized = str.replace(',', '.');

  // Check feet and inches notation (e.g. 40', 40 ft, 40 feet, 13'6", 13 ft 6 in)
  const feetInchesMatch = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/
  );
  if (feetInchesMatch) {
    const feet = Number(feetInchesMatch[1]);
    const inches = feetInchesMatch[2] ? Number(feetInchesMatch[2]) : 0;
    const m = feet * 0.3048 + inches * 0.0254;
    return Number.isFinite(m) && m > 0 ? roundTo(m, 3) : null;
  }

  // Check metric values (e.g. "15", "15 m", "15m", "15 meters", "15 metres")
  const metricMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s*(?:m|metres|meters|meter|metre)?$/
  );
  if (metricMatch) {
    const m = Number(metricMatch[1]);
    return Number.isFinite(m) && m > 0 ? roundTo(m, 2) : null;
  }

  return null;
}

/**
 * Parse building level count from string (e.g. "3", "3.5", "2;3").
 * Returns null if absent, <= 0, or invalid.
 */
export function parseLevels(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // If semicolon or comma separated list (e.g. "2;3" or "2, 3"), take the first value
  const firstPart = trimmed.split(/[;]/)[0].trim().replace(',', '.');
  const n = Number(firstPart);
  return Number.isFinite(n) && n > 0 && n < 250 ? roundTo(n, 1) : null;
}

/**
 * Calculate roof allowance in meters on top of levels × 3.0m:
 * 1. Explicit `roof:height` tag wins.
 * 2. Explicit `roof:levels` tag (levels × 3.0m × 0.75).
 * 3. Pitched roof shapes (gabled, hipped, pyramidal, skillion, dome) add 1.5m allowance.
 * 4. Flat roofs or missing roof tags add 0.0m.
 */
export function calculateRoofAllowance(tags: Tags): number {
  const roofHeight = parseHeight(tags['roof:height']);
  if (roofHeight != null) return roofHeight;

  const roofLevels = parseLevels(tags['roof:levels']);
  if (roofLevels != null) return roundTo(roofLevels * DEFAULT_LEVEL_HEIGHT_M * 0.75, 2);

  const shape = tags['roof:shape']?.trim().toLowerCase();
  if (shape && shape !== 'flat' && shape !== 'none') {
    return 1.5;
  }

  return 0.0;
}

/**
 * Resolve overhang / minimum elevation in meters above ground.
 * Uses `min_height` tag if present, else `building:min_level` × 3.0m, else 0.
 */
export function resolveMinHeight(tags: Tags): number {
  const explicitMinHeight = parseHeight(tags.min_height) ?? parseHeight(tags['building:min_height']);
  if (explicitMinHeight != null) {
    return explicitMinHeight;
  }

  const minLevel = parseLevels(tags['building:min_level']);
  if (minLevel != null) {
    return roundTo(minLevel * DEFAULT_LEVEL_HEIGHT_M, 2);
  }

  return 0.0;
}

/**
 * Determine the prior key to use based on optional landuse context and tags.
 */
export function resolveLanduseKey(tags: Tags, landuse?: string): string {
  // 1. Explicit argument takes precedence
  if (landuse && LANDUSE_PRIORS[landuse.toLowerCase()]) {
    return landuse.toLowerCase();
  }

  // 2. OSM landuse tag
  const tagLanduse = tags.landuse?.trim().toLowerCase();
  if (tagLanduse && LANDUSE_PRIORS[tagLanduse]) {
    return tagLanduse;
  }

  // 3. OSM building typology mapping
  const buildingVal = tags.building?.trim().toLowerCase();
  if (buildingVal && BUILDING_TYPE_TO_LANDUSE[buildingVal]) {
    return BUILDING_TYPE_TO_LANDUSE[buildingVal];
  }

  return 'default';
}

/**
 * Resolves building height in meters, base overhang elevation, levels, and data source.
 *
 * Rules:
 * - `height` / `building:height` OSM tags take top priority (source: 'explicit').
 * - `building:levels` is used next: levels * 3.0m + roof allowance (source: 'levels').
 * - When tags are missing, landuse priors are used:
 *   - residential: 2 levels = 6.0m
 *   - commercial: 3 levels = 9.0m
 *   - retail: 2 levels = 6.0m
 *   - industrial: 1 tall level = 7.5m
 *   - default fallback: 1 level = 3.5m
 *   (source: 'prior').
 * - `min_height` / `building:min_level` lift the base for overhangs and podiums.
 */
export function resolveBuildingHeight(
  tags: Tags,
  landuse?: string
): BuildingHeightResolution {
  const minHeightM = resolveMinHeight(tags);

  // 1. Explicit height tag
  const explicitHeight = parseHeight(tags.height) ?? parseHeight(tags['building:height']);
  if (explicitHeight != null) {
    const levelsTag = parseLevels(tags['building:levels']);
    const effectiveHeight = Math.max(explicitHeight, minHeightM);
    const levels = levelsTag ?? Math.max(1, Math.round((effectiveHeight - minHeightM) / DEFAULT_LEVEL_HEIGHT_M));
    return {
      heightM: roundTo(effectiveHeight, 2),
      minHeightM: roundTo(minHeightM, 2),
      levels,
      source: 'explicit',
    };
  }

  // 2. Building levels tag
  const levelsTag = parseLevels(tags['building:levels']);
  if (levelsTag != null) {
    const roofAllowanceM = calculateRoofAllowance(tags);
    const rawHeight = levelsTag * DEFAULT_LEVEL_HEIGHT_M + roofAllowanceM;
    const heightM = Math.max(rawHeight, minHeightM + DEFAULT_LEVEL_HEIGHT_M);
    return {
      heightM: roundTo(heightM, 2),
      minHeightM: roundTo(minHeightM, 2),
      levels: levelsTag,
      source: 'levels',
    };
  }

  // 3. Landuse / typology priors fallback
  const priorKey = resolveLanduseKey(tags, landuse);
  const prior = LANDUSE_PRIORS[priorKey] ?? LANDUSE_PRIORS.default;
  const roofAllowanceM = calculateRoofAllowance(tags);
  const priorHeight = prior.heightM + roofAllowanceM;
  const heightM = Math.max(priorHeight, minHeightM + prior.heightM);

  return {
    heightM: roundTo(heightM, 2),
    minHeightM: roundTo(minHeightM, 2),
    levels: prior.levels,
    source: 'prior',
  };
}
