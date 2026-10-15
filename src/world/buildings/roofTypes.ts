/**
 * Category 2: Building Realism & City Data (items 51–100)
 * Roof Types: maps OSM roof:shape, roof:material, and roof:colour,
 * including regional vernacular defaults (e.g. corrugated metal in West Africa,
 * clay tile in Hawaii).
 */

import { parseHeight, parseLevels, type Tags } from './heightResolver.ts';

export type RoofShape =
  | 'flat'
  | 'gabled'
  | 'hipped'
  | 'pyramidal'
  | 'skillion'
  | 'dome'
  | 'mansard'
  | 'gambrel'
  | 'other';

export interface RoofContext {
  /** Explicit region override */
  region?: 'west_africa' | 'hawaii' | 'mediterranean' | 'default' | string;
  /** Latitude for geographic context deduction */
  lat?: number;
  /** Longitude for geographic context deduction */
  lon?: number;
}

export interface RoofSpec {
  shape: RoofShape;
  material: string;
  colour: string;
  heightM: number;
  levels: number;
  isPitched: boolean;
  source: 'tagged' | 'inferred';
}

/**
 * Standard colors by material
 */
export const MATERIAL_DEFAULT_COLOURS: Record<string, string> = {
  corrugated_metal: '#9ca3af', // Galvanized steel / zinc grey
  metal: '#9ca3af',
  tin: '#a1a1aa',
  sheet_metal: '#9ca3af',
  clay_tiles: '#c2410c', // Terracotta orange / clay red
  tiles: '#c2410c',
  clay_tile: '#c2410c',
  concrete: '#94a3b8', // Concrete grey
  tar_paper: '#1e293b', // Asphalt / dark tar
  bitumen: '#1e293b',
  slate: '#334155', // Dark slate blue-grey
  shingle: '#78350f', // Wood or asphalt shingle
  wood: '#78350f',
  thatch: '#d97706', // Straw / thatch yellow-brown
  glass: '#38bdf8', // Skylight / glass blue
};

/**
 * Normalizes OSM roof:shape string to standard RoofShape.
 */
export function normalizeRoofShape(raw: string | undefined): RoofShape {
  if (!raw) return 'flat';
  const s = raw.trim().toLowerCase().replace(/[-_]/g, '');

  switch (s) {
    case 'flat':
    case 'none':
      return 'flat';
    case 'gabled':
    case 'gableroof':
    case 'saddle':
      return 'gabled';
    case 'hipped':
    case 'hip':
    case 'halfhipped':
      return 'hipped';
    case 'pyramidal':
    case 'pyramid':
    case 'tent':
      return 'pyramidal';
    case 'skillion':
    case 'shed':
    case 'monopitch':
    case 'leanto':
      return 'skillion';
    case 'dome':
    case 'cupola':
    case 'hemispherical':
    case 'onion':
      return 'dome';
    case 'mansard':
      return 'mansard';
    case 'gambrel':
      return 'gambrel';
    default:
      return 'other';
  }
}

/**
 * Detect region from explicit context or geographic coordinates.
 */
export function detectRegion(context?: RoofContext): 'west_africa' | 'hawaii' | 'default' {
  if (!context) return 'default';

  if (context.region) {
    const r = context.region.toLowerCase().replace(/[- ]/g, '_');
    if (r === 'west_africa' || r === 'westafrica') return 'west_africa';
    if (r === 'hawaii') return 'hawaii';
  }

  const { lat, lon } = context;
  if (lat != null && lon != null) {
    // Hawaii bounding box: lat [18.5, 23.0], lon [-161.0, -154.5]
    if (lat >= 18.5 && lat <= 23.0 && lon >= -161.0 && lon <= -154.5) {
      return 'hawaii';
    }
    // West Africa bounding box: lat [4.0, 18.0], lon [-18.0, 16.0]
    if (lat >= 4.0 && lat <= 18.0 && lon >= -18.0 && lon <= 16.0) {
      return 'west_africa';
    }
  }

  return 'default';
}

/**
 * Validates and normalizes CSS / hex color strings.
 */
export function normalizeColour(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  // Hex color e.g. #abc, #aabbcc
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  // Standard CSS colour names
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return null;
}

/**
 * Normalizes roof material string.
 */
export function normalizeMaterial(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[-\s]/g, '_');
  if (s === 'corrugated_iron' || s === 'tin' || s === 'galvanized') {
    return 'corrugated_metal';
  }
  if (s === 'clay_tile' || s === 'roof_tiles' || s === 'terracotta') {
    return 'clay_tiles';
  }
  return s;
}

/**
 * Resolves the roof material based on tags and regional defaults.
 * - Corrugated metal is common in West Africa.
 * - Clay tile is common in Hawaii.
 */
export function resolveRoofMaterial(tags: Tags, context?: RoofContext): string {
  const taggedMaterial = normalizeMaterial(tags['roof:material']);
  if (taggedMaterial) return taggedMaterial;

  const region = detectRegion(context);
  if (region === 'west_africa') {
    return 'corrugated_metal';
  }
  if (region === 'hawaii') {
    return 'clay_tiles';
  }

  // Fallback by shape
  const shape = normalizeRoofShape(tags['roof:shape']);
  if (shape === 'flat') {
    return 'concrete';
  }
  return 'tiles';
}

/**
 * Resolves roof colour based on tags, material, and regional defaults.
 */
export function resolveRoofColour(
  tags: Tags,
  material: string,
  context?: RoofContext
): string {
  const taggedColour = normalizeColour(tags['roof:colour'] ?? tags['roof:color']);
  if (taggedColour) return taggedColour;

  const materialColour = MATERIAL_DEFAULT_COLOURS[material];
  if (materialColour) return materialColour;

  const region = detectRegion(context);
  if (region === 'west_africa') {
    return '#9ca3af';
  }
  if (region === 'hawaii') {
    return '#c2410c';
  }

  return '#94a3b8';
}

/**
 * Generates the complete RoofSpec for a building from OSM tags and optional context.
 */
export function getRoofSpec(
  tags: Tags,
  context?: RoofContext
): RoofSpec {
  const shape = normalizeRoofShape(tags['roof:shape']);
  const material = resolveRoofMaterial(tags, context);
  const colour = resolveRoofColour(tags, material, context);

  const parsedRoofHeight = parseHeight(tags['roof:height']);
  const parsedRoofLevels = parseLevels(tags['roof:levels']) ?? 0;
  const isPitched = shape !== 'flat';

  let heightM = 0;
  if (parsedRoofHeight != null) {
    heightM = parsedRoofHeight;
  } else if (parsedRoofLevels > 0) {
    heightM = parsedRoofLevels * 2.25;
  } else if (isPitched) {
    heightM = 1.5;
  }

  const isTagged = tags['roof:shape'] != null || tags['roof:material'] != null || tags['roof:colour'] != null;

  return {
    shape,
    material,
    colour,
    heightM,
    levels: parsedRoofLevels,
    isPitched,
    source: isTagged ? 'tagged' : 'inferred',
  };
}
