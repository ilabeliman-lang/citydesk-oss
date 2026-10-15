// NDU-UPG inspect (#04): shared types for the inspect card. Type-only, no runtime.
import type { PropType } from "../props/propsCatalogue.ts";
import type { MaterialKey } from "../render/materialCatalog.ts";

export type Provenance =
  | "osm_tag" | "osm_levels"
  | "type_prior" | "landuse_prior" | "default_prior"
  | "regional_prior"
  | "computed" | "catalogue" | "scan" | "owner";

export type Field<T> = { value: T; unit?: "m" | "m2" | "m3" | "kg" | "year" | ""; source: Provenance; confidence: number; note?: string };
export type PropertySetId = "identity" | "size" | "material" | "age" | "access" | "source" | "yours";
export type PropertySet = { id: PropertySetId; title: string; fields: Record<string, Field<unknown>> };

export type VehicleKind = "car" | "keke" | "bus" | "danfo";

export type InspectTarget =
  | { kind: "building"; osmId: number | null; layer: string; feature: unknown; lngLat: [number, number]; bearing: number }
  | { kind: "vehicle"; agentId: string; vkind: VehicleKind; lngLat: [number, number] }
  | { kind: "walker"; agentId: string; lngLat: [number, number] }
  | { kind: "place"; placeId: string; name: string; category?: string; lngLat: [number, number] }
  | { kind: "prop"; propType: PropType; instanceId?: number; osmNodeId?: number; lngLat: [number, number]; record?: PropRecordLike }
  | { kind: "scan"; scanId: string; model: [number, number, number] | null };

/**
 * Structural subset of feature 03's `PropRecord` (src/world/props/types.ts on feat/realism-03-props-lighting),
 * so 03's `pickProp()` result can be handed straight to inspect without importing that branch.
 */
export type PropRecordLike = {
  kind: string;
  osmId: number;
  osmType: "n" | "w" | "x";
  lng: number;
  lat: number;
  heightM: number;
  widthM: number;
  depthM: number;
  src: "osm" | "inferred";
  lit?: boolean;
  shelter?: boolean;
  backrest?: boolean;
  tree?: { genus: string; leaf: string; crownM: number; crownShape: string; trunkM: number };
  tags?: Record<string, string>;
};

export type ObjectProfile = {
  key: string;
  title: string;
  subtitle: string;
  className: string;
  lod: "LOD1" | "LOD2" | "scan" | "catalogue";
  quality?: { badge: string; label: string; score: number; color: string };
  sets: PropertySet[];
  material?: MaterialKey;
  massKg?: Field<number | null>;
  dimsM?: Field<[number, number, number]>;
  semantics: Record<string, string>;
  tags?: Record<string, string>;
  osmUrl?: string;
  attribution?: string;
  unique: string[];
  /** Key facts for the peek card (3 max), already formatted. */
  facts: string[];
  /** The OSM `access` value or similar gate the affordances read (public data only). */
  access?: string;
  /** Category for objects (bench, storage...) the affordances read. */
  category?: string;
};

export type Verb = "inspect" | "enter" | "open" | "sit" | "pick_up" | "use" | "ride" | "wait" | "talk" | "link_record" | "view_on_osm" | "look_through";
export type VerbOffer = { verb: Verb; label: string; score: number; enabled: boolean; reason?: string };
