/**
 * NDU-UPG props (#151–#200): street furniture & vegetation catalogue.
 * Each prop type maps to an OSM tag set, a need it serves, physical dimensions,
 * and whether it glows at night. Pure data — no DOM, no three.js.
 */

export type PropType =
  | "lamp"
  | "utility_pole"
  | "standpipe"
  | "food_stall"
  | "bench"
  | "bus_stop"
  | "tree_palm"
  | "tree_shade"
  // NDU-UPG realism 03: the full PLAN §4.1 kind list (the 8 ids above stay for test stability)
  | "waste_basket"
  | "recycling"
  | "traffic_signals"
  | "stop_sign"
  | "give_way_sign"
  | "traffic_sign"
  | "fire_hydrant"
  | "post_box"
  | "bollard"
  | "street_cabinet"
  | "tree"
  | "parked_car";

export type PropNeed = "eat" | "wash" | "rest" | "light" | "transit" | "none";

export type PropSpec = {
  type: PropType;
  name: string;
  need: PropNeed;
  heightM: number;
  /** [width, depth] footprint in metres. */
  footprintM: [number, number];
  maxTris: number;
  nightEmissive: boolean;
  osmTags: string[];
};

export const PROP_SPECS = {
  lamp: {
    type: "lamp",
    name: "Street lamp",
    need: "light",
    heightM: 6.5,
    footprintM: [0.3, 0.3],
    maxTris: 120,
    nightEmissive: true,
    osmTags: ["highway=street_lamp"],
  },
  utility_pole: {
    type: "utility_pole",
    name: "NEPA pole",
    need: "none",
    heightM: 8.0,
    footprintM: [0.35, 0.35],
    maxTris: 80,
    nightEmissive: false,
    osmTags: ["power=pole", "utility=pole"],
  },
  standpipe: {
    type: "standpipe",
    name: "Water standpipe",
    need: "wash",
    heightM: 1.1,
    footprintM: [0.4, 0.4],
    maxTris: 100,
    nightEmissive: false,
    osmTags: ["amenity=drinking_water", "man_made=water_tap"],
  },
  food_stall: {
    type: "food_stall",
    name: "Food stall",
    need: "eat",
    heightM: 2.6,
    footprintM: [2.5, 1.8],
    maxTris: 200,
    nightEmissive: true,
    osmTags: ["amenity=fast_food", "shop=kiosk"],
  },
  bench: {
    type: "bench",
    name: "Shade bench",
    need: "rest",
    heightM: 0.85,
    footprintM: [1.5, 0.5],
    maxTris: 60,
    nightEmissive: false,
    osmTags: ["amenity=bench"],
  },
  bus_stop: {
    type: "bus_stop",
    name: "Bus stop",
    need: "transit",
    heightM: 2.8,
    footprintM: [3.0, 1.2],
    maxTris: 180,
    nightEmissive: true,
    osmTags: ["highway=bus_stop"],
  },
  tree_palm: {
    type: "tree_palm",
    name: "Palm tree",
    need: "none",
    heightM: 7.5,
    footprintM: [1.0, 1.0],
    maxTris: 250,
    nightEmissive: false,
    osmTags: ["natural=tree", "leaf_type=palm"],
  },
  tree_shade: {
    type: "tree_shade",
    name: "Shade tree",
    need: "none",
    heightM: 6.0,
    footprintM: [3.0, 3.0],
    maxTris: 300,
    nightEmissive: false,
    osmTags: ["natural=tree"],
  },
} as Record<PropType, PropSpec>; // NDU-UPG realism 03: the new kinds are added below

// NDU-UPG realism 03: the new kinds (sizes from dimensions.ts KIND_DEFAULTS, PLAN §4.1)
const extra = (type: PropType, name: string, heightM: number, footprintM: [number, number], maxTris: number, nightEmissive: boolean, osmTags: string[], need: PropNeed = "none"): PropSpec => ({ type, name, need, heightM, footprintM, maxTris, nightEmissive, osmTags });
Object.assign(PROP_SPECS, {
  waste_basket: extra("waste_basket", "Litter bin", 0.9, [0.45, 0.45], 160, false, ["amenity=waste_basket"]),
  recycling: extra("recycling", "Recycling container", 1.6, [1.5, 1.5], 160, false, ["amenity=recycling"]),
  traffic_signals: extra("traffic_signals", "Traffic signals", 3.2, [0.4, 0.4], 160, true, ["highway=traffic_signals"], "transit"),
  stop_sign: extra("stop_sign", "Stop sign", 2.8, [0.75, 0.1], 160, false, ["highway=stop"]),
  give_way_sign: extra("give_way_sign", "Give way sign", 2.8, [0.75, 0.1], 160, false, ["highway=give_way"]),
  traffic_sign: extra("traffic_sign", "Traffic sign", 2.7, [0.6, 0.1], 160, false, ["traffic_sign=*"]),
  fire_hydrant: extra("fire_hydrant", "Fire hydrant", 0.75, [0.25, 0.25], 160, false, ["emergency=fire_hydrant"]),
  post_box: extra("post_box", "Post box", 1.5, [0.5, 0.5], 160, false, ["amenity=post_box"]),
  bollard: extra("bollard", "Bollard", 0.95, [0.15, 0.15], 160, false, ["barrier=bollard"]),
  street_cabinet: extra("street_cabinet", "Street cabinet", 1.3, [1.2, 0.4], 160, false, ["man_made=street_cabinet"]),
  tree: extra("tree", "Tree", 8, [4, 4], 320, false, ["natural=tree_row"]),
  parked_car: extra("parked_car", "Parked car", 1.5, [1.78, 4.3], 200, false, ["amenity=parking"]),
});

/** Render bucket, archetypes, LOD tris (full, low) and budget drop priority (lower = dropped first). */
export type KindRender = { bucket: "lamps" | "signals" | "kit" | "benches" | "trees" | "cars" | "shelters"; archetypes: string[]; lodTris: [number, number]; priority: number };
export const KIND_RENDER: Record<string, KindRender> = {
  lamp: { bucket: "lamps", archetypes: ["lamp_bent", "lamp_post_top", "lamp_wall", "lamp_double"], lodTris: [100, 24], priority: 9 },
  utility_pole: { bucket: "kit", archetypes: ["pole_wood", "pole_concrete"], lodTris: [90, 24], priority: 4 },
  bench: { bucket: "benches", archetypes: ["bench_back", "bench_flat"], lodTris: [108, 24], priority: 4 },
  waste_basket: { bucket: "kit", archetypes: ["bin_post", "bin_standing"], lodTris: [60, 12], priority: 1 },
  recycling: { bucket: "kit", archetypes: ["container"], lodTris: [80, 12], priority: 1 },
  bus_stop: { bucket: "shelters", archetypes: ["stop_pole", "shelter"], lodTris: [120, 24], priority: 6 },
  traffic_signals: { bucket: "signals", archetypes: ["signal_post", "signal_mast"], lodTris: [100, 30], priority: 7 },
  stop_sign: { bucket: "signals", archetypes: ["sign_octagon"], lodTris: [100, 24], priority: 3 },
  give_way_sign: { bucket: "signals", archetypes: ["sign_triangle"], lodTris: [100, 24], priority: 3 },
  traffic_sign: { bucket: "signals", archetypes: ["sign_round", "sign_rect"], lodTris: [100, 24], priority: 3 },
  fire_hydrant: { bucket: "kit", archetypes: ["hydrant_pillar", "hydrant_plate", "hydrant_wall"], lodTris: [120, 12], priority: 1 },
  post_box: { bucket: "kit", archetypes: ["postbox_pillar"], lodTris: [120, 12], priority: 1 },
  bollard: { bucket: "kit", archetypes: ["bollard"], lodTris: [60, 12], priority: 1 },
  street_cabinet: { bucket: "kit", archetypes: ["cabinet"], lodTris: [60, 12], priority: 1 },
  standpipe: { bucket: "kit", archetypes: ["standpipe"], lodTris: [100, 12], priority: 1 },
  food_stall: { bucket: "kit", archetypes: ["stall"], lodTris: [130, 24], priority: 2 },
  tree: { bucket: "trees", archetypes: ["trunk", "crown_round", "crown_ovoid", "crown_conical", "crown_umbrella", "crown_palm", "crown_columnar"], lodTris: [140, 30], priority: 5 },
  parked_car: { bucket: "cars", archetypes: ["car"], lodTris: [72, 12], priority: 2 },
};

const tagIndex = new Map<string, PropType>();
for (const [type, spec] of Object.entries(PROP_SPECS)) {
  for (const tag of spec.osmTags) tagIndex.set(tag, type as PropType);
}

export function getPropSpec(type: PropType): PropSpec {
  return PROP_SPECS[type];
}

/** Match an OSM key=value tag to a prop type, or null if unrecognised. */
export function matchOsmTag(tag: string): PropType | null {
  return tagIndex.get(tag) ?? null;
}

/** True when the prop should glow / emit light (night mode and the prop is a light source). */
export function isNightLit(type: PropType, isNight: boolean): boolean {
  return isNight && PROP_SPECS[type].nightEmissive;
}

/** NDU-UPG realism 03: match a whole tag set (palms by leaf_type, taxon=Arecaceae or a palm genus). */
const PALMS = new Set(["cocos", "elaeis", "roystonea", "phoenix", "washingtonia", "areca", "borassus", "raphia"]);
export function matchOsmTags(tags: Record<string, string>): PropType | null {
  if (tags.natural === "tree") {
    const genus = (tags.genus ?? tags.species?.split(/\s+/)[0] ?? "").toLowerCase();
    const palm = tags.leaf_type === "palm" || /^arecaceae$/i.test(tags.taxon ?? "") || /^arecaceae$/i.test(tags["taxon:family"] ?? "") || PALMS.has(genus);
    return palm ? "tree_palm" : "tree_shade";
  }
  for (const [k, v] of Object.entries(tags)) {
    const t = matchOsmTag(`${k}=${v}`);
    if (t) return t;
  }
  if (tags.traffic_sign) return "traffic_sign";
  return null;
}
