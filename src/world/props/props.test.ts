import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPropSpec, matchOsmTag, isNightLit, PROP_SPECS, type PropType } from "./propsCatalogue.ts";

describe("propsCatalogue", () => {
  it("getPropSpec returns correct spec for every type", () => {
    const types: PropType[] = ["lamp", "utility_pole", "standpipe", "food_stall", "bench", "bus_stop", "tree_palm", "tree_shade"];
    for (const t of types) {
      const spec = getPropSpec(t);
      assert.equal(spec.type, t);
      assert.ok(spec.name.length > 0, `${t} should have a name`);
      assert.ok(spec.heightM > 0, `${t} should have positive height`);
      assert.ok(spec.footprintM[0] > 0 && spec.footprintM[1] > 0, `${t} footprint must be positive`);
      assert.ok(spec.maxTris > 0, `${t} maxTris must be positive`);
    }
  });

  it("matchOsmTag maps known tags and returns null for unknown", () => {
    assert.equal(matchOsmTag("highway=street_lamp"), "lamp");
    assert.equal(matchOsmTag("amenity=drinking_water"), "standpipe");
    assert.equal(matchOsmTag("man_made=water_tap"), "standpipe");
    assert.equal(matchOsmTag("amenity=fast_food"), "food_stall");
    assert.equal(matchOsmTag("shop=kiosk"), "food_stall");
    assert.equal(matchOsmTag("amenity=bench"), "bench");
    assert.equal(matchOsmTag("highway=bus_stop"), "bus_stop");
    assert.equal(matchOsmTag("natural=tree"), "tree_shade");
    assert.equal(matchOsmTag("leaf_type=palm"), "tree_palm");
    assert.equal(matchOsmTag("power=pole"), "utility_pole");
    assert.equal(matchOsmTag("amenity=unknown_thing"), null);
    assert.equal(matchOsmTag(""), null);
  });

  it("isNightLit: only emissive props glow at night", () => {
    // Lamp, food_stall, bus_stop are nightEmissive
    assert.equal(isNightLit("lamp", true), true);
    assert.equal(isNightLit("lamp", false), false);
    assert.equal(isNightLit("food_stall", true), true);
    assert.equal(isNightLit("bus_stop", true), true);
    // bench, tree, standpipe, utility_pole are not
    assert.equal(isNightLit("bench", true), false);
    assert.equal(isNightLit("standpipe", true), false);
    assert.equal(isNightLit("utility_pole", true), false);
    assert.equal(isNightLit("tree_palm", true), false);
    assert.equal(isNightLit("tree_shade", true), false);
  });

  it("every spec has at least one OSM tag", () => {
    for (const [type, spec] of Object.entries(PROP_SPECS)) {
      assert.ok(spec.osmTags.length > 0, `${type} needs at least one OSM tag`);
    }
  });

  it("need field is valid for each prop", () => {
    const validNeeds = new Set(["eat", "wash", "rest", "light", "transit", "none"]);
    for (const spec of Object.values(PROP_SPECS)) {
      assert.ok(validNeeds.has(spec.need), `${spec.type} has invalid need '${spec.need}'`);
    }
  });
});

// ───── NDU-UPG realism 03 additions ─────
import { KIND_RENDER, matchOsmTags } from "./propsCatalogue.ts";
import { ARCHETYPES } from "./proceduralKit.ts";
import { KIND_CODES } from "./types.ts";

describe("propsCatalogue (realism 03)", () => {
  it("has a spec and render entry for every PLAN §4.1 kind", () => {
    for (const k of KIND_CODES) {
      assert.ok(KIND_RENDER[k], `render ${k}`);
      if (k !== "standpipe" && k !== "food_stall" && k !== "bus_stop" && k !== "bench" && k !== "lamp" && k !== "utility_pole") assert.ok(PROP_SPECS[k as PropType], `spec ${k}`);
    }
  });
  it("every render archetype exists in the kit (cars come from life models)", () => {
    for (const r of Object.values(KIND_RENDER)) for (const a of r.archetypes) if (a !== "car") assert.ok(ARCHETYPES[a], a);
  });
  it("matchOsmTags detects palms by taxon / genus", () => {
    assert.equal(matchOsmTags({ natural: "tree", taxon: "Arecaceae" }), "tree_palm");
    assert.equal(matchOsmTags({ natural: "tree", genus: "Cocos" }), "tree_palm");
    assert.equal(matchOsmTags({ natural: "tree", genus: "Platanus" }), "tree_shade");
    assert.equal(matchOsmTags({ emergency: "fire_hydrant" }), "fire_hydrant");
    assert.equal(matchOsmTags({ traffic_sign: "GB:670" }), "traffic_sign");
    assert.equal(matchOsmTags({ foo: "bar" }), null);
  });
  it("lamps are dropped last", () => {
    const max = Math.max(...Object.values(KIND_RENDER).map((r) => r.priority));
    assert.equal(KIND_RENDER.lamp.priority, max);
  });
});
