// NDU-UPG inspect (#04): turn a picked object into an ObjectProfile (public data only). Pure.
// Every numeric field carries its source and confidence; unknowns read "not mapped", never invented.
import { shapeFromSpot } from "../empty-state/footprint.ts";
import { resolveHeight, type Tags } from "../realism/heights.ts";
import { assessBuildingQuality } from "../buildings/buildingQuality.ts";
import { resolveRoofMaterial } from "../buildings/roofTypes.ts";
import { PROP_SPECS, type PropType } from "../props/propsCatalogue.ts";
import { MATERIALS, fromOsm, type MaterialKey } from "../render/materialCatalog.ts";
import type { ScanAsset } from "../scans.ts";
import type { CellStats } from "../realism/buildingsData.ts";
import { ageText, parseStartDate } from "./dates.ts";
import { filterPublicTags } from "./tagPolicy.ts";
import { uniqueLines } from "./unique.ts";
import { VEHICLE_SPECS } from "./vehicleSpecs.ts";
import { propPhysics } from "./propPhysics.ts";
import type { Field, ObjectProfile, PropRecordLike, PropertySet, Provenance, VehicleKind } from "./types.ts";

export const ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";
export const HUMAN_M = 1.75;
/** ML-traced footprints (buildingQuality's own check also matches "aerial", so use a tighter one). */
const ML_SOURCE = /microsoft|open.?buildings|google|deeplearning|\bml\b/i;

const SOURCE_LABEL: Record<Provenance, string> = {
  osm_tag: "tagged", osm_levels: "from floors", type_prior: "from building type", landuse_prior: "from area type",
  default_prior: "default guess", regional_prior: "regional typical", computed: "computed", catalogue: "catalogue",
  scan: "scanned", owner: "your value",
};

const HEIGHT_PROV: Record<string, [Provenance, number]> = {
  height: ["osm_tag", 0.95], levels: ["osm_levels", 0.8], type: ["type_prior", 0.55], landuse: ["landuse_prior", 0.45], default: ["default_prior", 0.3],
};

const f = <T>(value: T, source: Provenance, confidence: number, unit: Field<T>["unit"] = "", note?: string): Field<T> =>
  note ? { value, unit, source, confidence, note } : { value, unit, source, confidence };

const clamp01 = (v: number) => Math.max(0, Math.min(1, Math.round(v * 100) / 100));

function fmtNum(v: number, unit: string | undefined, tagged: boolean): string {
  if (unit === "m2") {
    if (v >= 10_000) return `${(v / 10_000).toFixed(1)} ha`;
    const r = v < 1000 ? Math.round(v) : Math.round(v / 10) * 10;
    return `${r.toLocaleString("en")} m²`;
  }
  if (unit === "m3") return `${(v < 1000 ? Math.round(v) : Math.round(v / 10) * 10).toLocaleString("en")} m³`;
  if (unit === "kg") {
    const r = v < 10 ? Math.round(v * 10) / 10 : v < 1000 ? Math.round(v) : Math.round(v / 50) * 50;
    return `${r.toLocaleString("en")} kg`;
  }
  if (unit === "m") return tagged ? `${v.toFixed(1)} m` : `${Math.round(v * 2) / 2} m`;
  if (unit === "year") return String(v);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

/** "12.0 m · tagged" / "about 6 m · from building type" / "Material: not mapped". */
export function formatField(field: Field<unknown>, _locale = "en"): string {
  const v = field.value;
  const tagged = field.confidence >= 0.9;
  const suffix = SOURCE_LABEL[field.source] ?? field.source;
  let text: string;
  if (v == null || v === "") text = "not mapped";
  else if (typeof v === "number") text = `${tagged ? "" : "about "}${fmtNum(v, field.unit, tagged)}`;
  else if (Array.isArray(v)) text = `${tagged ? "" : "about "}${(v as number[]).map((x) => (Math.round(x * 100) / 100).toString()).join(" × ")} m`;
  else text = String(v);
  if (v == null || v === "") return text;
  return `${text} · ${suffix}${field.note ? ` (${field.note})` : ""}`;
}

type FeatureLike = { id?: unknown; layer?: { id?: string }; properties?: Record<string, unknown> | null; geometry?: unknown };

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** OSM way id of a building feature: realism `properties.osm`, vector tiles `floor(id / 10)`. */
export function osmIdOfFeature(feature: unknown): number | null {
  const ft = feature as FeatureLike | null;
  if (!ft) return null;
  const p = ft.properties ?? {};
  const o = num(p.osm);
  if (o !== null && Number.isSafeInteger(o) && o > 0) return o;
  const id = num(ft.id);
  if (id !== null && id > 0) {
    const w = Math.floor(id / 10);
    return w > 0 ? w : null;
  }
  return null;
}

export type BuildingInput = {
  feature: unknown;
  tags?: Record<string, string> | null;
  lngLat: [number, number];
  bearing?: number;
  cellStats?: CellStats | null;
  nowYear?: number;
};

export function buildingProfile(input: BuildingInput): ObjectProfile {
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const ft = (input.feature ?? {}) as FeatureLike;
  const p = ft.properties ?? {};
  const tags: Record<string, string> = filterPublicTags(input.tags ?? {});
  const osmId = osmIdOfFeature(ft);
  const name = tags.name || tags["name:en"] || str(p.name) || str(p["name:en"]);
  const [lng, lat] = input.lngLat;
  const shape = shapeFromSpot({ name: name || "This building", lat, lng, feature: ft, bearing: input.bearing ?? 0 });
  const areaM2 = shape.type === "building" ? shape.areaM2 : 0;

  // heights: tagged tags > realism props (already resolved server-side, with landuse) > tile shape
  let h: number, b: number, lv: number, prov: [Provenance, number];
  const realism = num(p.h) !== null && num(p.osm) !== null;
  if (tags.height || tags["building:levels"]) {
    const r = resolveHeight(tags as Tags);
    [h, b, lv, prov] = [r.height, r.base, r.levels, HEIGHT_PROV[r.source]];
  } else if (realism) {
    [h, b, lv] = [num(p.h) ?? 0, num(p.b) ?? 0, num(p.lv) ?? 0];
    prov = HEIGHT_PROV[str(p.src)] ?? HEIGHT_PROV.default;
  } else if (Object.keys(tags).length) {
    const r = resolveHeight(tags as Tags);
    [h, b, lv, prov] = [r.height, r.base, r.levels, HEIGHT_PROV[r.source]];
  } else if (shape.type === "building") {
    [h, b, lv] = [shape.maxH, shape.minH, shape.levels];
    prov = shape.heightSource === "osm" ? ["osm_tag", 0.85] : shape.heightSource === "levels" ? HEIGHT_PROV.levels : HEIGHT_PROV.default;
  } else {
    [h, b, lv, prov] = [6, 0, 2, HEIGHT_PROV.default];
  }
  const quality = assessBuildingQuality(tags as Tags, realism ? (num(p.tg) ? "tagged" : undefined) : undefined);
  const ml = quality.badge === "ml_footprint" || ML_SOURCE.test(tags.source ?? "");
  const conf = clamp01(prov[1] - (ml ? 0.1 : 0));
  const heightNote = tags.height === "0" && tags["building:levels"] ? "height=0 ignored, floors used" : undefined;
  const above = Math.max(0, h - b);

  const size: PropertySet = {
    id: "size", title: "Size",
    fields: {
      height: f(h, prov[0], conf, "m", heightNote),
      ...(b > 0 ? { base: f(b, prov[0], conf, "m", "starts above ground") } : {}),
      floors: f(lv > 0 ? Math.round(lv) : null, prov[0] === "osm_tag" || prov[0] === "osm_levels" ? "osm_levels" : prov[0], conf, ""),
      footprint: f(areaM2 > 0 ? areaM2 : null, "computed", ml ? 0.6 : 0.9, "m2"),
      ...(areaM2 > 0 && lv > 0 ? { gfa: f(areaM2 * Math.max(1, Math.round(lv)), "computed", clamp01(conf * 0.9), "m2", "floor area ≈ footprint × floors") } : {}),
      ...(areaM2 > 0 && above > 0 ? { volume: f(areaM2 * above, "computed", clamp01(conf * 0.9), "m3") } : {}),
    },
  };

  // material: walls never invented; roof falls back to the regional vernacular (flagged as such)
  const wallKey = fromOsm(tags["building:material"]) ?? fromOsm(tags["building:facade:material"]) ?? (str(p.m) ? (str(p.m) as MaterialKey) : null);
  const roofTagged = fromOsm(tags["roof:material"]) ?? (str(p.rm) ? (str(p.rm) as MaterialKey) : null);
  const roofPrior = roofTagged ? null : fromOsm(resolveRoofMaterial(tags as Tags, { lat, lon: lng }));
  const asbestos = /asbestos|eternit/i.test(`${tags["building:material"] ?? ""};${tags["roof:material"] ?? ""}`);
  const material: PropertySet = {
    id: "material", title: "Material",
    fields: {
      walls: wallKey && MATERIALS[wallKey] ? f(MATERIALS[wallKey].label, "osm_tag", 0.9, "", asbestos ? "asbestos cement: don't drill or break" : undefined) : f(null, "osm_tag", 0, ""),
      roof: roofTagged && MATERIALS[roofTagged] ? f(MATERIALS[roofTagged].label, "osm_tag", 0.9) : roofPrior ? f(MATERIALS[roofPrior].label, "regional_prior", 0.35, "", "typical here, not mapped") : f(null, "osm_tag", 0),
      ...(str(p.c) || tags["building:colour"] ? { colour: f(tags["building:colour"] || str(p.c), "osm_tag", 0.9) } : {}),
      ...(str(p.rs) && str(p.rs) !== "flat" ? { roof_shape: f(str(p.rs), "osm_tag", 0.9) } : tags["roof:shape"] ? { roof_shape: f(tags["roof:shape"], "osm_tag", 0.9) } : {}),
    },
  };

  const parsed = parseStartDate(tags.start_date ?? tags["building:start_date"] ?? tags.construction_date, nowYear) ?? (num(p.y) ? parseStartDate(String(num(p.y)), nowYear) : null);
  const age: PropertySet = {
    id: "age", title: "Age",
    fields: { built: parsed ? f(ageText(parsed, nowYear), "osm_tag", parsed.precision === "day" || parsed.precision === "month" || parsed.precision === "year" ? 0.9 : 0.6) : f(null, "osm_tag", 0) },
  };

  const use = tags.amenity || tags.shop || tags.office || tags.tourism || tags.leisure || tags.religion || "";
  const access: PropertySet = {
    id: "access", title: "Access & use",
    fields: {
      ...(use ? { use: f(use.replace(/_/g, " "), "osm_tag", 0.9) } : {}),
      ...(tags.access ? { access: f(tags.access, "osm_tag", 0.9) } : {}),
      ...(tags.opening_hours ? { hours: f(tags.opening_hours, "osm_tag", 0.9) } : {}),
      ...(tags.wheelchair ? { wheelchair: f(tags.wheelchair, "osm_tag", 0.9) } : {}),
      ...(tags.operator ? { operator: f(tags.operator, "osm_tag", 0.9) } : {}),
      ...(tags["addr:street"] ? { street: f([tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "), "osm_tag", 0.9) } : {}),
    },
  };

  const kind = tags.building || tags["building:part"] || str(p.kind) || "yes";
  const kindLabel = kind === "yes" ? "building" : kind.replace(/_/g, " ");
  const source: PropertySet = {
    id: "source", title: "Source & quality",
    fields: {
      quality: f(quality.label, "computed", quality.score),
      layer: f(ft.layer?.id === "ndu-real-buildings" ? "OpenStreetMap (live)" : "OpenStreetMap vector tiles", "computed", 1),
      ...(osmId ? { osm_id: f(`way ${osmId}`, "osm_tag", 1) } : {}),
    },
  };

  const profile: ObjectProfile = {
    key: `building:${osmId ?? `${lat.toFixed(5)},${lng.toFixed(5)}`}`,
    title: name || "This building",
    subtitle: `Building · ${kindLabel}`,
    className: "building",
    lod: (str(p.rs) && str(p.rs) !== "flat") || tags["roof:shape"] ? "LOD2" : "LOD1",
    quality: { badge: quality.badge, label: quality.label, score: quality.score, color: quality.chip.color },
    sets: [
      { id: "identity", title: "Identity", fields: { name: f(name || null, "osm_tag", name ? 0.95 : 0), type: f(kindLabel, "osm_tag", kind === "yes" ? 0.4 : 0.9) } },
      size, material, age, access, source,
    ],
    material: wallKey ?? undefined,
    semantics: { class: "building", subclass: kindLabel, material: wallKey ?? "unknown", roof_shape: str(p.rs) || tags["roof:shape"] || "flat" },
    tags,
    osmUrl: osmId ? `https://www.openstreetmap.org/way/${osmId}` : undefined,
    attribution: ATTRIBUTION,
    unique: [],
    facts: [],
    access: tags.access,
    category: use || kind,
  };
  profile.facts = [
    `Height ${formatField(size.fields.height).split(" · ")[0]}`,
    lv > 0 ? `${Math.round(lv)} floor${Math.round(lv) === 1 ? "" : "s"}` : "Floors not mapped",
    areaM2 > 0 ? `Footprint ${formatField(size.fields.footprint).split(" · ")[0].replace(/^about /, "")}` : "Footprint unknown",
  ];
  profile.unique = uniqueLines(
    { height: h, heightTagged: prov[0] === "osm_tag", year: parsed?.year ?? null, wall: wallKey, roof: roofTagged, levels: lv },
    input.cellStats ?? null,
  );
  return profile;
}

export function vehicleProfile(vkind: VehicleKind, agentId = "", stopped = false): ObjectProfile {
  const s = VEHICLE_SPECS[vkind];
  const dims = f<[number, number, number]>(s.dimsM, "catalogue", 0.8, "m");
  const mass = f<number | null>(s.massKg, "catalogue", 0.5, "kg");
  return {
    key: `vehicle:${agentId || vkind}`,
    title: s.label,
    subtitle: "Simulated vehicle · illustrative",
    className: `vehicle:${vkind}`,
    lod: "catalogue",
    sets: [
      { id: "identity", title: "Identity", fields: { type: f(s.label, "catalogue", 1), plate: f("none (simulated)", "catalogue", 1) } },
      { id: "size", title: "Size", fields: { dims, mass, seats: f(s.seats, "catalogue", 0.8) } },
      { id: "material", title: "Material", fields: { body: f(`${MATERIALS.steel.label} (painted)`, "catalogue", 0.7) } },
    ],
    material: "steel", massKg: mass, dimsM: dims,
    semantics: { class: "vehicle", subclass: vkind, material: "steel" },
    unique: s.hailable ? ["You can hail this one when it stops"] : [],
    facts: [s.label, `${s.dimsM.map((d) => d.toFixed(2)).join(" × ")} m`, `about ${s.massKg.toLocaleString("en")} kg · ${s.seats} seats`],
    category: stopped ? `${vkind}:stopped` : vkind,
  };
}

/** One-line peek summary, e.g. "Keke (tricycle) · 1.36 × 1.81 × 2.10 m · about 350 kg · 4 seats". */
export function summaryLine(p: ObjectProfile): string {
  return p.facts.join(" · ");
}

export function walkerProfile(agentId = ""): ObjectProfile {
  return {
    key: `walker:${agentId}`,
    title: "Simulated resident",
    subtitle: "Walker · illustrative, no identity",
    className: "walker",
    lod: "catalogue",
    sets: [{ id: "size", title: "Size", fields: { height: f(HUMAN_M, "catalogue", 0.6, "m") } }],
    semantics: { class: "person", subclass: "simulated" },
    unique: [],
    facts: ["Simulated resident", `about ${HUMAN_M} m tall`, "Say hello"],
    category: "walker",
  };
}

const PLACE_VERB_CAT: Record<string, string> = { eat: "food_stall", rest: "bench", wash: "standpipe", care: "clinic", shift: "workplace" };

export function placeProfile(input: { placeId: string; name: string; category?: string; kind?: string; source?: string; offer?: string }): ObjectProfile {
  const src = input.source === "google" ? "Google Places" : input.source === "osm" ? "OpenStreetMap" : "CityDesk";
  return {
    key: `place:${input.placeId}`,
    title: input.name || "Place",
    subtitle: `Place · ${(input.category || input.kind || "spot").replace(/_/g, " ")}`,
    className: "place",
    lod: "catalogue",
    sets: [
      { id: "identity", title: "Identity", fields: { name: f(input.name, "catalogue", 0.9), category: f(input.category || input.kind || null, "catalogue", 0.7) } },
      { id: "source", title: "Source & quality", fields: { source: f(src, "catalogue", 1), ...(input.offer ? { offer: f(input.offer, "catalogue", 0.7) } : {}) } },
    ],
    semantics: { class: "place", subclass: input.kind ?? "spot" },
    attribution: input.source === "osm" ? ATTRIBUTION : undefined,
    unique: [],
    facts: [input.category || input.kind || "Place", src, input.offer ?? ""].filter(Boolean),
    category: PLACE_VERB_CAT[input.kind ?? ""] ?? input.kind ?? "place",
  };
}

/** A street object: main's PROP_SPECS type and/or a feature-03 PropRecord (its `kind` string). */
export function propProfile(type: PropType | string, record?: PropRecordLike | null): ObjectProfile {
  const kind = record?.kind ?? type;
  const spec = (PROP_SPECS as Record<string, (typeof PROP_SPECS)[PropType] | undefined>)[type];
  const phys = propPhysics(kind) ?? propPhysics(type);
  const baseName = phys?.name ?? spec?.name ?? kind.replace(/_/g, " ");
  const fromRecord = Boolean(record && Number.isFinite(record.heightM));
  const dimsV: [number, number, number] = fromRecord
    ? [record!.widthM, record!.heightM, record!.depthM]
    : spec ? [spec.footprintM[0], spec.heightM, spec.footprintM[1]] : (phys?.dims ?? [1, 1, 1]);
  const dims = f(dimsV, fromRecord && record!.src === "osm" && record!.tags?.height ? "osm_tag" : "catalogue", fromRecord ? 0.7 : 0.6, "m");
  const matKey: MaterialKey = fromOsm(record?.tags?.material) ?? phys?.material ?? "unknown";
  const massV = phys?.massKg ?? null;
  const mass = f<number | null>(massV, "catalogue", 0.5, "kg");
  const tags = record?.tags ? filterPublicTags(record.tags) : undefined;
  const label = record?.tree?.genus ? `${baseName} · ${record.tree.genus}` : baseName;
  return {
    key: `prop:${kind}:${record?.osmId ?? "x"}`,
    title: label,
    subtitle: `Street object · ${kind.replace(/_/g, " ")}${record?.src === "inferred" ? " · estimated from road tags" : ""}`,
    className: `prop:${kind === "tree" ? "tree_shade" : kind}`,
    lod: "catalogue",
    sets: [
      { id: "identity", title: "Identity", fields: { type: f(baseName, "catalogue", 1) } },
      { id: "size", title: "Size", fields: { dims, mass } },
      { id: "material", title: "Material", fields: { body: f(matKey === "unknown" ? null : MATERIALS[matKey].label, record?.tags?.material ? "osm_tag" : "catalogue", record?.tags?.material ? 0.9 : 0.6) } },
      { id: "source", title: "Source & quality", fields: { source: f(record ? (record.src === "osm" ? "OpenStreetMap" : "Estimated from road tags") : "CityDesk catalogue", "catalogue", 1) } },
    ],
    material: matKey, massKg: mass, dimsM: dims,
    semantics: { class: "prop", subclass: kind, material: matKey },
    tags,
    osmUrl: record && record.osmType !== "x" && record.osmId > 0 ? `https://www.openstreetmap.org/${record.osmType === "n" ? "node" : "way"}/${record.osmId}` : undefined,
    attribution: record?.src === "osm" ? ATTRIBUTION : undefined,
    unique: kind === "parked_car" ? ["Illustrative: no plate, not a real car"] : [],
    facts: [`${dimsV[1].toFixed(1)} m tall`, massV ? `about ${massV.toLocaleString("en")} kg` : "Weight unknown", matKey === "unknown" ? "Material not mapped" : MATERIALS[matKey].label],
    category: kind,
  };
}

const FILL: Record<string, number> = { furniture: 0.15, appliance: 0.25, storage: 0.12, solid: 0.6 };

/** Owner-only: accepts only the caller's own ScanAsset (from listMyScans / the ScanMap). */
export function scanProfile(scan: Pick<ScanAsset, "id" | "name" | "format" | "status" | "stats" | "pose">, attrs?: { category?: string; material?: MaterialKey; massKg?: number; fill?: keyof typeof FILL } | null, pin?: [number, number, number] | null): ObjectProfile {
  const st = scan.stats ?? null;
  const size = st?.size ?? null;
  const conf = st?.metersPerUnit ? 0.9 : 0.6;
  const dims = size ? f<[number, number, number]>(size, "scan", conf, "m") : undefined;
  let mass: Field<number | null> | undefined;
  if (attrs?.massKg) mass = f<number | null>(attrs.massKg, "owner", 0.9, "kg");
  else if (size && attrs?.material && MATERIALS[attrs.material]?.densityKgM3) {
    const fill = FILL[attrs.fill ?? ""] ?? 0.2;
    mass = f<number | null>(size[0] * size[1] * size[2] * (MATERIALS[attrs.material].densityKgM3 as number) * fill, "computed", 0.3, "kg", "estimated ±50%");
  }
  const fields: Record<string, Field<unknown>> = { name: f(scan.name, "owner", 1), format: f(scan.format, "scan", 1), status: f(scan.status ?? "stored", "scan", 1) };
  if (pin) fields.pin = f(`Pinned point ${pin.map((v) => v.toFixed(2)).join(", ")} m`, "scan", 0.9);
  return {
    key: `scan:${scan.id}`,
    title: scan.name || "Your scan",
    subtitle: "Your scan · only you can see this",
    className: "scan",
    lod: "scan",
    sets: [
      { id: "yours", title: "Yours", fields },
      { id: "size", title: "Size", fields: { ...(dims ? { dims } : { dims: f(null, "scan", 0) }), ...(mass ? { mass } : {}), ...(st ? { tris: f(`${st.before.tris} → ${st.after.tris}`, "scan", 1) } : {}) } },
    ],
    material: attrs?.material, massKg: mass, dimsM: dims,
    semantics: { class: "scan", subclass: attrs?.category ?? "object" },
    unique: [],
    facts: [size ? `${size.map((v) => v.toFixed(2)).join(" × ")} m` : "Size unknown", scan.status ?? "stored", scan.format.toUpperCase()],
    category: attrs?.category ?? "scan",
  };
}
