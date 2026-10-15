// NDU-UPG inspect (#04): physical material catalogue. Pure data (no three.js, no DOM).
// Values from physicallybased.info (CC0) where available; others from engineering tables.
// Densities in kg/m³ (bulk, effective); colours are linear sRGB 0..1.

export type MaterialKey =
  | "brick" | "concrete" | "reinforced_concrete" | "cement_block" | "plaster" | "stone" | "marble"
  | "wood" | "timber_framing" | "bamboo" | "metal" | "steel" | "aluminium" | "corrugated_metal" | "glass"
  | "mud" | "adobe" | "thatch" | "roof_tiles" | "asphalt" | "plastic" | "fabric" | "ceramic" | "unknown";

export type MaterialTraits = { rigid: boolean; flammable: boolean; transparent: boolean; conductive: boolean; buoyant: boolean };

export type MaterialSpec = {
  key: MaterialKey;
  label: string;
  densityKgM3: number | null;
  baseColor: [number, number, number];
  roughness: number;
  metalness: number;
  traits: MaterialTraits;
  source: "physicallybased.info" | "engineering_handbook";
};

const T = (rigid: boolean, flammable: boolean, transparent = false, conductive = false, buoyant = false): MaterialTraits => ({ rigid, flammable, transparent, conductive, buoyant });
const PB = "physicallybased.info" as const;
const EH = "engineering_handbook" as const;
const m = (key: MaterialKey, label: string, densityKgM3: number | null, baseColor: [number, number, number], roughness: number, metalness: number, traits: MaterialTraits, source: MaterialSpec["source"]): MaterialSpec => ({ key, label, densityKgM3, baseColor, roughness, metalness, traits, source });

export const MATERIALS: Record<MaterialKey, MaterialSpec> = {
  brick: m("brick", "Brick", 1900, [0.262, 0.095, 0.061], 0.85, 0, T(true, false), PB),
  concrete: m("concrete", "Concrete", 2400, [0.51, 0.51, 0.51], 0.9, 0, T(true, false), PB),
  reinforced_concrete: m("reinforced_concrete", "Reinforced concrete", 2500, [0.48, 0.48, 0.47], 0.88, 0, T(true, false), EH),
  cement_block: m("cement_block", "Cement block", 1400, [0.45, 0.44, 0.42], 0.92, 0, T(true, false), EH),
  plaster: m("plaster", "Plaster / render", 1700, [0.75, 0.72, 0.66], 0.85, 0, T(true, false), EH),
  stone: m("stone", "Stone", 2300, [0.42, 0.38, 0.32], 0.8, 0, T(true, false), EH),
  marble: m("marble", "Marble", 2700, [0.83, 0.8, 0.75], 0.3, 0, T(true, false), PB),
  wood: m("wood", "Wood", 600, [0.29, 0.17, 0.08], 0.7, 0, T(true, true, false, false, true), PB),
  timber_framing: m("timber_framing", "Timber framing", 600, [0.27, 0.16, 0.08], 0.75, 0, T(true, true, false, false, true), EH),
  bamboo: m("bamboo", "Bamboo", 700, [0.5, 0.42, 0.2], 0.65, 0, T(true, true, false, false, true), EH),
  metal: m("metal", "Metal", 7850, [0.56, 0.57, 0.58], 0.45, 1, T(true, false, false, true), PB),
  steel: m("steel", "Steel", 7850, [0.53, 0.54, 0.55], 0.4, 1, T(true, false, false, true), PB),
  aluminium: m("aluminium", "Aluminium", 2700, [0.91, 0.92, 0.92], 0.35, 1, T(true, false, false, true), PB),
  corrugated_metal: m("corrugated_metal", "Corrugated metal sheet", 7850, [0.5, 0.52, 0.53], 0.55, 1, T(true, false, false, true), EH),
  glass: m("glass", "Glass", 2500, [0.9, 0.93, 0.93], 0.05, 0, T(true, false, true), PB),
  mud: m("mud", "Mud", 1600, [0.3, 0.2, 0.12], 0.95, 0, T(true, false), EH),
  adobe: m("adobe", "Adobe / mud brick", 1600, [0.4, 0.26, 0.15], 0.95, 0, T(true, false), EH),
  thatch: m("thatch", "Thatch", 150, [0.45, 0.36, 0.18], 1, 0, T(false, true, false, false, true), EH),
  roof_tiles: m("roof_tiles", "Roof tiles", 1900, [0.38, 0.12, 0.06], 0.75, 0, T(true, false), EH),
  asphalt: m("asphalt", "Asphalt / tar paper", 2300, [0.06, 0.06, 0.06], 0.9, 0, T(true, true), PB),
  plastic: m("plastic", "Plastic", 950, [0.7, 0.7, 0.7], 0.5, 0, T(true, true, false, false, true), PB),
  fabric: m("fabric", "Fabric", null, [0.6, 0.55, 0.5], 1, 0, T(false, true), EH),
  ceramic: m("ceramic", "Ceramic", 2300, [0.85, 0.84, 0.8], 0.25, 0, T(true, false), PB),
  unknown: m("unknown", "Not mapped", null, [0.5, 0.5, 0.5], 0.8, 0, T(true, false), EH),
};

/** OSM building:material / building:facade:material / roof:material values → catalogue key. */
export const OSM_MATERIAL: Record<string, MaterialKey> = {
  brick: "brick", bricks: "brick", concrete: "concrete", reinforced_concrete: "reinforced_concrete",
  cement_block: "cement_block", cement_blocks: "cement_block", block: "cement_block", asbestos: "cement_block",
  plaster: "plaster", render: "plaster", stone: "stone", sandstone: "stone", limestone: "stone", granite: "stone", slate: "stone",
  marble: "marble", wood: "wood", timber: "wood", timber_framing: "timber_framing", bamboo: "bamboo",
  metal: "metal", metal_plates: "metal", tin: "corrugated_metal", corrugated_iron: "corrugated_metal", corrugated_metal: "corrugated_metal",
  steel: "steel", aluminium: "aluminium", aluminum: "aluminium", glass: "glass", mirror: "glass",
  mud: "mud", clay: "mud", adobe: "adobe", rammed_earth: "adobe", grass: "thatch", thatch: "thatch", reed: "thatch", palm_leaves: "thatch",
  roof_tiles: "roof_tiles", tiles: "roof_tiles", tile: "roof_tiles", clay_tiles: "roof_tiles", tar_paper: "asphalt", asphalt: "asphalt",
  vinyl: "plastic", plastic: "plastic", fabric: "fabric", canvas: "fabric", ceramic: "ceramic", eternit: "cement_block",
};

/** Lowercase, trim, first `;` value; unknown values → null (never invented). */
export function fromOsm(value: string | undefined | null): MaterialKey | null {
  if (value == null) return null;
  const first = String(value).split(";")[0].trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!first) return null;
  return OSM_MATERIAL[first] ?? null;
}

const toSrgb = (c: number) => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};

/** Linear sRGB 0..1 → "#rrggbb" (gamma encoded). */
export function toSrgbHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((c) => Math.round(toSrgb(c) * 255).toString(16).padStart(2, "0")).join("");
}

const parseHex = (h: string): [number, number, number] => {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Mix two "#rrggbb" colours: t = 0 → a, t = 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [parseHex(a), parseHex(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Relative luminance of "#rrggbb" in 0..255 units (fast, perceptual weights). */
export function lumHex(h: string): number {
  const [r, g, b] = parseHex(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A tint that stays within ±limit (fraction) of the base luminance so the palette still dominates. */
export function tintFor(base: string, key: MaterialKey, t = 0.35, limit = 0.1): string {
  let out = mixHex(base, toSrgbHex(MATERIALS[key].baseColor), t);
  const lb = lumHex(base) || 1;
  const lo = lumHex(out);
  const ratio = lo / lb;
  if (ratio > 1 + limit || ratio < 1 - limit) {
    const target = ratio > 1 ? 1 + limit : 1 - limit;
    const k = (target * lb) / (lo || 1);
    out = "#" + parseHex(out).map((v) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0")).join("");
  }
  return out;
}
