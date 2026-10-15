// NDU-UPG inspect (#04): physical data per street object, keyed by kind. Covers both main's
// PROP_SPECS types and feature 03's PropKind values (feat/realism-03-props-lighting), so 03's
// pickProp() records inspect without editing propsCatalogue.ts (which 03 also edits).
import type { MaterialKey } from "../render/materialCatalog.ts";
import type { Verb } from "./types.ts";

export type PropPhysics = { name: string; material: MaterialKey; massKg: number | null; verbs: Verb[]; dims: [number, number, number] };

export const PROP_PHYSICS: Record<string, PropPhysics> = {
  // main PROP_SPECS types (dims = width × height × depth, metres)
  lamp: { name: "Street lamp", material: "steel", massKg: 180, verbs: [], dims: [0.3, 6.5, 0.3] },
  utility_pole: { name: "Utility pole", material: "concrete", massKg: 900, verbs: [], dims: [0.35, 8, 0.35] },
  standpipe: { name: "Water standpipe", material: "metal", massKg: 25, verbs: ["use"], dims: [0.4, 1.1, 0.4] },
  food_stall: { name: "Food stall", material: "wood", massKg: 120, verbs: ["use"], dims: [2.5, 2.6, 1.8] },
  bench: { name: "Bench", material: "wood", massKg: 35, verbs: ["sit"], dims: [1.5, 0.85, 0.5] },
  bus_stop: { name: "Bus stop", material: "steel", massKg: 400, verbs: ["wait"], dims: [3, 2.8, 1.2] },
  tree_palm: { name: "Palm tree", material: "wood", massKg: null, verbs: [], dims: [1, 7.5, 1] },
  tree_shade: { name: "Shade tree", material: "wood", massKg: null, verbs: [], dims: [3, 6, 3] },
  // feature 03 PropKind extras
  tree: { name: "Tree", material: "wood", massKg: null, verbs: [], dims: [3, 8, 3] },
  waste_basket: { name: "Waste bin", material: "plastic", massKg: 12, verbs: ["use"], dims: [0.5, 0.9, 0.5] },
  recycling: { name: "Recycling bin", material: "plastic", massKg: 40, verbs: ["use"], dims: [1.2, 1.4, 1] },
  traffic_signals: { name: "Traffic light", material: "aluminium", massKg: 150, verbs: [], dims: [0.4, 4.5, 0.4] },
  stop_sign: { name: "Stop sign", material: "aluminium", massKg: 15, verbs: [], dims: [0.75, 2.4, 0.1] },
  give_way_sign: { name: "Give way sign", material: "aluminium", massKg: 12, verbs: [], dims: [0.9, 2.4, 0.1] },
  traffic_sign: { name: "Road sign", material: "aluminium", massKg: 12, verbs: [], dims: [0.6, 2.4, 0.1] },
  fire_hydrant: { name: "Fire hydrant", material: "steel", massKg: 110, verbs: [], dims: [0.4, 0.8, 0.4] },
  post_box: { name: "Post box", material: "steel", massKg: 140, verbs: ["use"], dims: [0.5, 1.6, 0.5] },
  bollard: { name: "Bollard", material: "steel", massKg: 60, verbs: [], dims: [0.2, 1, 0.2] },
  street_cabinet: { name: "Street cabinet", material: "steel", massKg: 200, verbs: [], dims: [0.8, 1.3, 0.4] },
  parked_car: { name: "Parked car (illustrative)", material: "steel", massKg: 1300, verbs: [], dims: [1.8, 1.48, 4.3] },
};

export function propPhysics(kind: string): PropPhysics | null {
  return PROP_PHYSICS[kind] ?? null;
}
