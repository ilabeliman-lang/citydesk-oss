/**
 * NDU-AI search documents: one compact shape for places, named streets (street graph labels), POIs,
 * tagged buildings, business listings and scan labels. Every builder runs the privacy filter first.
 * Pure and alias-free (node --experimental-strip-types tests it).
 */
import { publicRecord, type RawRecord } from "./privacy.ts";

export type DocKind = "place" | "street" | "building" | "listing" | "scan" | "poi";

export type SearchDoc = {
  id: string;
  kind: DocKind;
  title: string;
  /** Short line under the title in results. */
  sub: string;
  /** Extra searchable words (tags, category, offer). */
  text: string;
  lat: number;
  lng: number;
  /** Buildings: resolved height in metres. */
  heightM?: number;
  /** Streets: OSM highway class and a 0 (quiet) .. 1 (busy) score. */
  roadClass?: string;
  busy?: number;
  /** Streets: a thinned polyline [lng, lat] for distance checks. */
  pts?: [number, number][];
  /** The searcher's own scan (indexed on their phone only). */
  mine?: boolean;
};

const BUSY: Record<string, number> = {
  motorway: 1,
  motorway_link: 0.9,
  trunk: 1,
  trunk_link: 0.85,
  primary: 0.9,
  primary_link: 0.8,
  secondary: 0.72,
  secondary_link: 0.65,
  tertiary: 0.5,
  tertiary_link: 0.45,
  unclassified: 0.32,
  residential: 0.14,
  living_street: 0.06,
  service: 0.1,
  pedestrian: 0.08,
  footway: 0.05,
  path: 0.04,
  track: 0.05,
};

const CLASS_WORDS: Record<string, string> = {
  motorway: "expressway highway busy main road",
  trunk: "expressway highway busy main road",
  primary: "main road busy primary",
  secondary: "main road secondary",
  tertiary: "road tertiary",
  unclassified: "road minor",
  residential: "residential quiet street close lane",
  living_street: "quiet residential living street",
  service: "service lane quiet",
  pedestrian: "pedestrian walkway quiet",
  footway: "footpath walkway quiet",
  path: "footpath quiet",
};

const KIND_WORDS: Record<string, string> = {
  eat: "food eat restaurant chop buka",
  shift: "work shift shop business office",
  rest: "rest park bench shade",
  wash: "wash water toilets standpipe",
  care: "care chemist pharmacy clinic health",
  bus: "bus stop danfo transit",
  signal: "traffic lights junction signal",
  market: "market marketplace shop",
  church: "church place of worship pray",
  shop: "shop store",
  food: "food eat restaurant",
  station: "bus station motor park transit",
};

const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Build documents from raw records of any source. Records refused by the privacy filter are dropped. */
export function buildDocs(raws: RawRecord[], opts: { ownScanIds?: Set<string> } = {}): SearchDoc[] {
  const out = new Map<string, SearchDoc>();
  const streets = new Map<string, SearchDoc>();
  for (const raw of raws) {
    const verdict = publicRecord(raw, raw.source === "scan" && !!opts.ownScanIds?.has(str(raw.id)));
    if (!verdict.ok) continue;
    const r = verdict.record;
    const lat = num(r.lat);
    const lng = num(r.lng);
    switch (raw.source) {
      case "street": {
        const name = str(r.name).trim();
        const pts = (Array.isArray(r.pts) ? r.pts : []) as [number, number][];
        if (!name || pts.length < 2) continue;
        const cls = str(r.cls) || "road";
        const key = name.toLowerCase();
        const prev = streets.get(key);
        if (prev) {
          // one doc per street name: merge the ways, keep the busiest class
          prev.pts = [...(prev.pts ?? []), ...pts].slice(0, 160);
          if ((BUSY[cls] ?? 0.3) > (prev.busy ?? 0)) {
            prev.busy = BUSY[cls] ?? 0.3;
            prev.roadClass = cls;
          }
          continue;
        }
        const mid = pts[Math.floor(pts.length / 2)];
        streets.set(key, {
          id: `street:${key}`,
          kind: "street",
          title: name,
          sub: `${pretty(cls)} street`,
          text: `street road ${CLASS_WORDS[cls] ?? cls}`,
          lat: mid[1],
          lng: mid[0],
          roadClass: cls,
          busy: BUSY[cls] ?? 0.3,
          pts: pts.slice(0, 160),
        });
        continue;
      }
      case "poi": {
        if (!valid(lat, lng)) continue;
        const kind = str(r.kind);
        if (kind === "signal") continue; // junction lights are not destinations
        const name = str(r.name).trim();
        const title = name || pretty(kind === "bus" ? "bus stop" : kind);
        const id = `poi:${kind}:${lat.toFixed(5)},${lng.toFixed(5)}`;
        out.set(id, { id, kind: "poi", title, sub: pretty(kind === "bus" ? "bus stop" : kind), text: KIND_WORDS[kind] ?? kind, lat, lng });
        continue;
      }
      case "building": {
        if (!valid(lat, lng)) continue;
        const h = num(r.h);
        const lv = num(r.lv);
        const kind = str(r.kind);
        const name = str(r.name).trim();
        // Unnamed ordinary houses are noise in search; keep named, notable or tall buildings.
        if (!name && (!Number.isFinite(h) || h < 15) && ["", "yes", "house", "residential", "detached", "apartments", "roof", "shed", "garage"].includes(kind)) continue;
        const tall = h >= 30 ? "tall tower highrise" : h >= 18 ? "tall" : "";
        const floors = Number.isFinite(lv) && lv > 0 ? `${Math.round(lv)} floors` : "";
        const title = name || (kind && kind !== "yes" ? pretty(kind) : "Building");
        const id = `building:${str(r.osm) || `${lat.toFixed(5)},${lng.toFixed(5)}`}`;
        out.set(id, {
          id,
          kind: "building",
          title,
          sub: [kind && kind !== "yes" && name ? pretty(kind) : "Building", Number.isFinite(h) && h > 0 ? `${Math.round(h)} m` : "", floors].filter(Boolean).join(" · "),
          text: `building ${kind === "yes" ? "" : pretty(kind)} ${tall} ${floors}`.trim(),
          lat,
          lng,
          heightM: Number.isFinite(h) ? h : undefined,
        });
        continue;
      }
      case "listing":
      case "place": {
        if (!valid(lat, lng)) continue;
        const name = str(r.name).trim();
        if (!name) continue;
        const isListing = raw.source === "listing" || r.origin === "ring";
        const id = isListing ? `listing:${str(r.id).replace(/^ring-/, "")}` : `place:${str(r.id) || name}`;
        const offer = str(r.offer);
        const category = str(r.category);
        out.set(id, {
          id,
          kind: isListing ? "listing" : "place",
          title: name,
          sub: isListing ? (r.verified ? `On Ndu · verified ${category}`.trim() : `On Ndu · ${category || "listing"}`) : pretty(offer.replace(/^OpenStreetMap · /, "") || category || str(r.kind) || "place"),
          text: [offer, category, KIND_WORDS[str(r.kind)] ?? ""].filter(Boolean).join(" "),
          lat,
          lng,
        });
        continue;
      }
      case "scan": {
        if (!valid(lat, lng)) continue;
        const name = str(r.name).replace(/\.(glb|gltf|usdz|splat|ply|spz)$/i, "").replace(/[_-]+/g, " ").trim();
        const id = `scan:${str(r.id)}`;
        const mine = !!opts.ownScanIds?.has(str(raw.id));
        out.set(id, { id, kind: "scan", title: name || "3D scan", sub: mine ? "Your 3D scan" : "3D scan", text: "scan 3d model capture", lat, lng, mine });
        continue;
      }
      case "property":
        // Published community listings only (the filter refuses everything else). Labels are
        // encrypted at rest, so only the public title is ever indexed.
        if (!valid(lat, lng) || !str(r.title)) continue;
        out.set(`property:${str(r.recordRef)}`, { id: `property:${str(r.recordRef)}`, kind: "listing", title: str(r.title), sub: "Property listing", text: "property listing", lat, lng });
        continue;
    }
  }
  return [...out.values(), ...streets.values()];
}

/** The text a document is embedded with (kept short: small models truncate). */
export function embedText(doc: SearchDoc): string {
  return `${doc.title}. ${doc.sub}. ${doc.text}`.slice(0, 240);
}
