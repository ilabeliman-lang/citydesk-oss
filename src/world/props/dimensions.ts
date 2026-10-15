import type { CrownShape, LeafType, PropKind } from "./types.ts";

/**
 * NDU-UPG props: dimension solver (PLAN §4.3). Real-world sizes from OSM tags, species priors and
 * regional defaults. Pure, alias-free, deterministic (seeded by osmId).
 */

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic 0..1 from an id and a salt. */
export function rand01(id: number, salt = 0): number {
  return hashSeed(`${id}:${salt}`) / 4294967296;
}

/** Parse an OSM height-like string to metres: "12", "12 m", "40'", "40 ft", "~8", "8;10" (max). Junk → null. */
export function parseHeight(raw?: string | null): number | null {
  if (raw == null) return null;
  const parts = String(raw).split(";");
  let best: number | null = null;
  for (const p0 of parts) {
    const p = p0.trim().toLowerCase().replace(/^~\s*/, "").replace(",", ".");
    if (!p) continue;
    // feet + inches: 12'6"
    let m = p.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/);
    let v: number | null = null;
    if (m) v = Number(m[1]) * 0.3048 + (m[2] ? Number(m[2]) * 0.0254 : 0);
    else if ((m = p.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)$/))) v = Number(m[1]) * 0.3048;
    else if ((m = p.match(/^(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?$/))) v = Number(m[1]);
    else if ((m = p.match(/^(\d+(?:\.\d+)?)\s*cm$/))) v = Number(m[1]) / 100;
    if (v != null && Number.isFinite(v) && v > 0) best = best == null ? v : Math.max(best, v);
  }
  return best;
}

const CLAMPS: Partial<Record<PropKind, [number, number]>> = {
  lamp: [2.5, 20],
  utility_pole: [4, 25],
  tree: [1, 60],
  stop_sign: [1.5, 6],
  give_way_sign: [1.5, 6],
  traffic_sign: [1.5, 6],
  traffic_signals: [2.5, 8],
  bench: [0.3, 1.5],
  bus_stop: [2, 4],
  bollard: [0.3, 1.6],
  fire_hydrant: [0.05, 1.4],
  post_box: [0.8, 2],
  street_cabinet: [0.5, 2.5],
};

/** Clamp a parsed height to the plausible range for its kind; out-of-range or NaN → null. */
export function clampFor(kind: PropKind, m: number | null): number | null {
  if (m == null || !Number.isFinite(m) || m <= 0) return null;
  const r = CLAMPS[kind];
  if (!r) return m;
  if (m < r[0] * 0.5 || m > r[1] * 2) return null; // garbage (height=300 on a lamp)
  return Math.min(r[1], Math.max(r[0], m));
}

/** Real-metre defaults: [width, depth, height] (PLAN §4.1). */
export const KIND_DEFAULTS: Record<PropKind, [number, number, number]> = {
  lamp: [0.2, 0.2, 6.5],
  utility_pole: [0.3, 0.3, 9],
  bench: [1.8, 0.6, 0.85],
  waste_basket: [0.45, 0.45, 0.9],
  recycling: [1.5, 1.5, 1.6],
  bus_stop: [1.4, 1.4, 2.8],
  traffic_signals: [0.35, 0.35, 3.2],
  stop_sign: [0.75, 0.05, 2.8],
  give_way_sign: [0.75, 0.05, 2.8],
  traffic_sign: [0.6, 0.05, 2.7],
  fire_hydrant: [0.25, 0.25, 0.75],
  post_box: [0.5, 0.5, 1.5],
  bollard: [0.15, 0.15, 0.95],
  street_cabinet: [1.2, 0.4, 1.3],
  standpipe: [0.4, 0.4, 1.1],
  food_stall: [2.5, 1.8, 2.6],
  tree: [4, 4, 8],
  parked_car: [1.78, 4.3, 1.5],
};

const ROAD_LAMP_H: [RegExp, number][] = [
  [/^motorway/, 12],
  [/^trunk/, 10],
  [/^primary/, 9],
  [/^secondary/, 8],
  [/^tertiary/, 7],
  [/^(residential|living_street|unclassified|service)/, 5.5],
  [/^(footway|path|pedestrian|cycleway|steps|track)/, 4],
];
export function lampHeightForRoad(cls?: string | null): number {
  if (!cls) return 6.5;
  for (const [re, h] of ROAD_LAMP_H) if (re.test(cls)) return h;
  return 6.5;
}

/** Carriageway width in metres per highway class (aligned with life/roadWidths CLASS_M). */
export function roadWidthFor(cls?: string | null): number {
  const c = cls ?? "";
  if (/_link$/.test(c)) return 6.5;
  if (/^motorway/.test(c)) return 14;
  if (/^(trunk|primary)/.test(c)) return 12;
  if (/^(secondary|tertiary)/.test(c)) return 9;
  if (/^(residential|unclassified|living_street)/.test(c)) return 7;
  if (/^(service|track)/.test(c)) return 4.5;
  return 2.4;
}

export const DRIVABLE = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$/;
export const WALKABLE = /^(footway|path|pedestrian|cycleway|steps|track)$/;

/** Correlated colour temperature for a lamp. */
export function kelvinFor(tags: Record<string, string> | undefined, zone: string): number {
  const t = tags ?? {};
  const k = Number(t["light:colour_temperature"] ?? t["light:temperature"]);
  if (Number.isFinite(k) && k >= 1500 && k <= 7000) return k;
  const method = `${t["light:method"] ?? ""} ${t["lamp_type"] ?? ""}`.toLowerCase();
  if (/sodium|high_pressure_sodium|low_pressure_sodium|hps|sox|son/.test(method)) return 2000;
  if (/mercury/.test(method)) return 4200;
  if (/metal|halide/.test(method)) return 3500;
  if (/led/.test(method)) return /London/.test(zone) ? 3000 : 4000;
  const colour = (t["light:colour"] ?? "").toLowerCase();
  if (/orange|yellow/.test(colour)) return 2000;
  if (/white/.test(colour)) return 4000;
  if (/Lagos|Accra/.test(zone)) return 4500; // new solar LED lamps
  if (/London/.test(zone)) return 3000;
  return 4000;
}

export type SpeciesPrior = { h: [number, number]; crownRatio: number; shape: CrownShape; leaf: LeafType; a?: number; b?: number };

/** Genus priors (PLAN §4.3). Heights in metres; crownRatio = crown diameter / height. */
export const SPECIES: Record<string, SpeciesPrior> = {
  elaeis: { h: [12, 20], crownRatio: 0.45, shape: "palm", leaf: "p" },
  cocos: { h: [15, 25], crownRatio: 0.35, shape: "palm", leaf: "p" },
  roystonea: { h: [15, 25], crownRatio: 0.3, shape: "palm", leaf: "p" },
  mangifera: { h: [10, 18], crownRatio: 0.9, shape: "round", leaf: "b", a: 2.1, b: 0.6 },
  azadirachta: { h: [8, 15], crownRatio: 0.8, shape: "round", leaf: "b" },
  terminalia: { h: [10, 20], crownRatio: 1.0, shape: "umbrella", leaf: "b" },
  delonix: { h: [8, 12], crownRatio: 1.4, shape: "umbrella", leaf: "b" },
  samanea: { h: [15, 25], crownRatio: 1.4, shape: "umbrella", leaf: "b" },
  ficus: { h: [10, 25], crownRatio: 1.0, shape: "round", leaf: "b" },
  platanus: { h: [20, 35], crownRatio: 0.6, shape: "ovoid", leaf: "b", a: 1.9, b: 0.66 },
  tilia: { h: [15, 25], crownRatio: 0.55, shape: "ovoid", leaf: "b", a: 2.0, b: 0.63 },
  quercus: { h: [15, 25], crownRatio: 0.85, shape: "round", leaf: "b", a: 1.6, b: 0.65 },
  betula: { h: [12, 20], crownRatio: 0.4, shape: "ovoid", leaf: "b" },
  pinus: { h: [15, 30], crownRatio: 0.45, shape: "conical", leaf: "n" },
  picea: { h: [20, 35], crownRatio: 0.3, shape: "conical", leaf: "n" },
  metrosideros: { h: [6, 20], crownRatio: 0.8, shape: "round", leaf: "b" },
  plumeria: { h: [4, 8], crownRatio: 1.0, shape: "round", leaf: "b" },
  populus: { h: [15, 30], crownRatio: 0.25, shape: "columnar", leaf: "b" },
  cupressus: { h: [10, 25], crownRatio: 0.25, shape: "columnar", leaf: "n" },
};

export const PALM_GENERA = new Set(["cocos", "elaeis", "roystonea", "phoenix", "washingtonia", "areca", "borassus", "raphia"]);

/** Regional tree mixes (weights sum ~1). */
export const REGIONAL_TREES: Record<string, [string, number][]> = {
  "Africa/Lagos": [["mangifera", 0.25], ["azadirachta", 0.15], ["elaeis", 0.25], ["terminalia", 0.2], ["delonix", 0.15]],
  "Africa/Accra": [["mangifera", 0.25], ["azadirachta", 0.15], ["cocos", 0.25], ["terminalia", 0.2], ["delonix", 0.15]],
  "Pacific/Honolulu": [["samanea", 0.4], ["cocos", 0.35], ["plumeria", 0.25]],
  "Europe/London": [["platanus", 0.35], ["tilia", 0.3], ["betula", 0.15], ["quercus", 0.2]],
  fallback: [["quercus", 0.3], ["tilia", 0.3], ["ficus", 0.2], ["pinus", 0.2]],
};

function genusOf(tags: Record<string, string>): string | null {
  const g = tags.genus ?? tags["genus:en"] ?? tags.species?.split(/\s+/)[0] ?? tags.taxon?.split(/\s+/)[0];
  return g ? g.toLowerCase().trim() : null;
}

export function isPalm(tags: Record<string, string> | undefined): boolean {
  const t = tags ?? {};
  if (t.leaf_type === "palm") return true;
  if ((t.taxon ?? "").toLowerCase() === "arecaceae" || (t["taxon:family"] ?? "").toLowerCase() === "arecaceae") return true;
  const g = genusOf(t);
  return g != null && PALM_GENERA.has(g);
}

function pick(list: [string, number][], r: number): string {
  let acc = 0;
  const total = list.reduce((s, [, w]) => s + w, 0);
  for (const [g, w] of list) {
    acc += w / total;
    if (r < acc) return g;
  }
  return list[list.length - 1][0];
}

export type TreeSize = { heightM: number; crownM: number; trunkM: number; shape: CrownShape; leaf: LeafType; genus: string };

/** height tag > circumference allometry > species prior > regional default. */
export function treeSize(tags: Record<string, string> | undefined, osmId: number, zone: string): TreeSize {
  const t = tags ?? {};
  let genus = genusOf(t);
  const palm = isPalm(t);
  if (!genus || !(genus in SPECIES)) {
    if (palm) genus = genus && PALM_GENERA.has(genus) ? genus : "cocos";
    else if (!genus || !(genus in SPECIES)) {
      const mix = REGIONAL_TREES[zone] ?? REGIONAL_TREES.fallback;
      // tags that say "broadleaf" / "needleleaved" constrain the regional pick
      const lt = t.leaf_type;
      const filtered = mix.filter(([g]) => (lt === "needleleaved" ? SPECIES[g]?.leaf === "n" : lt === "broadleaved" ? SPECIES[g]?.leaf === "b" : true));
      genus = pick(filtered.length ? filtered : mix, rand01(osmId, 1));
    }
  }
  const sp: SpeciesPrior = SPECIES[genus] ?? { h: [10, 16], crownRatio: 0.7, shape: palm ? "palm" : "round", leaf: palm ? "p" : "b" };
  const shape: CrownShape = palm ? "palm" : sp.shape;
  let h = clampFor("tree", parseHeight(t.height));
  if (h == null) {
    const circ = parseHeight(t.circumference);
    if (circ != null && circ > 0.05 && circ < 20) {
      const dbh = (circ * 100) / Math.PI; // cm
      const a = sp.a ?? 1.9;
      const b = sp.b ?? 0.62;
      h = Math.min(sp.h[1] * 1.15, Math.max(sp.h[0] * 0.5, 1.3 + a * dbh ** b));
    }
  }
  if (h == null) h = sp.h[0] + (sp.h[1] - sp.h[0]) * rand01(osmId, 2);
  h = Math.round(h * 10) / 10;
  const tagCrown = parseHeight(t.diameter_crown);
  const crownM = Math.round((tagCrown && tagCrown < 60 ? tagCrown : Math.max(1.5, h * sp.crownRatio)) * 10) / 10;
  const trunkM = Math.round((shape === "palm" ? h * 0.85 : shape === "conical" || shape === "columnar" ? h * 0.15 : h * 0.4) * 10) / 10;
  return { heightM: h, crownM, trunkM, shape, leaf: palm ? "p" : sp.leaf, genus };
}

/** Parse an OSM `direction` (degrees or cardinal) to compass degrees, else null. */
export function parseDirection(raw?: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  const card: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  if (s in card) return card[s];
  const n = Number(s.split(/[;-]/)[0]);
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null;
}
