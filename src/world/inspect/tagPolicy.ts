// NDU-UPG inspect (#04): public OSM tag allow-list. Pure, shared by server and client.
// Privacy: residential buildings never expose house numbers, operators or websites; contact,
// owner and free-text keys are always dropped. Max 40 keys, values ≤ 200 chars.

export const PUBLIC_TAG_KEYS: readonly string[] = [
  "building", "building:part", "building:levels", "building:min_level", "height", "min_height",
  "roof:shape", "roof:height", "roof:levels", "roof:colour", "roof:material", "building:colour",
  "building:material", "building:facade:material", "start_date", "building:start_date", "construction_date",
  "name", "name:en", "addr:street", "addr:city", "addr:housenumber", "amenity", "shop", "office", "tourism",
  "leisure", "religion", "opening_hours", "operator", "access", "wheelchair", "website", "wikidata", "heritage", "source",
];

/** Dropped when the building is residential. */
export const RESIDENTIAL_ONLY_DROP = new Set(["addr:housenumber", "operator", "website"]);
const RESIDENTIAL = new Set(["house", "detached", "semidetached_house", "terrace", "bungalow", "apartments", "residential", "dormitory", "hut", "cabin"]);
const GEOMETRY_SOURCE = /^(survey|gps|bing|esri|maxar|microsoft|google|mapbox|digitalglobe|osm|yahoo|local_knowledge|aerial|imagery)/i;
const KEYS = new Set(PUBLIC_TAG_KEYS);
export const MAX_TAGS = 40;
export const MAX_VALUE = 200;

export function isResidential(tags: Record<string, string | undefined>): boolean {
  const b = (tags.building ?? tags["building:part"] ?? "").toLowerCase();
  if (RESIDENTIAL.has(b)) return true;
  if ((tags.landuse ?? "").toLowerCase() === "residential" && !tags.amenity && !tags.shop && !tags.office) return true;
  return false;
}

export function filterPublicTags(tags: Record<string, string | undefined> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tags) return out;
  const res = isResidential(tags);
  let n = 0;
  for (const key of PUBLIC_TAG_KEYS) {
    if (n >= MAX_TAGS) break;
    const raw = tags[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || value.length > MAX_VALUE) continue;
    if (res && RESIDENTIAL_ONLY_DROP.has(key)) continue;
    if (key === "source" && !GEOMETRY_SOURCE.test(value)) continue;
    if (!KEYS.has(key)) continue;
    out[key] = value;
    n += 1;
  }
  return out;
}

/** True when every key in `tags` is on the allow-list (used by privacy tests and the client guard). */
export function onlyPublicKeys(tags: Record<string, unknown> | undefined): boolean {
  return !tags || Object.keys(tags).every((k) => KEYS.has(k));
}
