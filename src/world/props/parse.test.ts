import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProps, propsQuery, whitelistTags } from "./parse.ts";
import type { CellBox, OsmEl, PropKind } from "./types.ts";

const load = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")) as { osm3s: { timestamp_osm_base: string }; elements: OsmEl[] };
const box = (lat: number, lng: number): CellBox => ({ south: lat - 0.003, west: lng - 0.004, north: lat + 0.003, east: lng + 0.004 });

const ph = load("ph-cell.json");
const ldn = load("london-cell.json");
const hnl = load("honolulu-cell.json");
const PH = parseProps(ph.elements, box(4.8156, 7.0498), "Africa/Lagos", ph.osm3s.timestamp_osm_base);
const LDN = parseProps(ldn.elements, box(51.5226, -0.1265), "Europe/London");
const HNL = parseProps(hnl.elements, box(21.2667, -157.8215), "Pacific/Honolulu");

describe("propsQuery", () => {
  it("is bounded and capped", () => {
    const q = propsQuery(box(1, 2));
    assert.match(q, /^\[out:json\]\[timeout:25\]\[bbox:/);
    assert.match(q, /qt 6000/);
    for (const k of ["street_lamp", "natural\"=\"tree\"", "fire_hydrant", "traffic_sign", "power", "bollard", "kiosk", "tree_row", "leisure", "parking"]) assert.ok(q.includes(k), k);
  });
});

describe("parseProps", () => {
  it("covers every OSM-sourced kind across the fixtures", () => {
    const seen = new Set<PropKind>([...PH.records, ...LDN.records, ...HNL.records].map((r) => r.kind));
    const want: PropKind[] = ["lamp", "utility_pole", "bench", "waste_basket", "recycling", "bus_stop", "traffic_signals", "stop_sign", "give_way_sign", "traffic_sign", "fire_hydrant", "post_box", "bollard", "street_cabinet", "standpipe", "food_stall", "tree"];
    for (const k of want) assert.ok(seen.has(k), `missing ${k}`);
  });
  it("London lamps carry kelvin, mounts and sane heights", () => {
    const lamps = LDN.records.filter((r) => r.kind === "lamp");
    assert.equal(lamps.length, 13);
    for (const l of lamps) {
      assert.ok(l.lamp && l.lamp.kelvin >= 2000 && l.lamp.kelvin <= 4500);
      assert.ok(l.heightM >= 4 && l.heightM <= 12, `h=${l.heightM}`);
    }
    assert.ok(lamps.some((l) => l.lamp?.kelvin === 2000));
    assert.ok(lamps.some((l) => l.archetype === "lamp_wall"));
    assert.ok(lamps.some((l) => l.archetype === "lamp_post_top"));
  });
  it("snaps carriageway lamps to the kerb, arm towards the road", () => {
    // lamps were mapped 6.5 m off a 9 m secondary (half width 4.5): kept where they are, facing the road
    const l = LDN.records.find((r) => r.kind === "lamp" && r.archetype === "lamp_bent")!;
    assert.ok(Math.abs(l.yawDeg - 180) < 1, `yaw=${l.yawDeg}`); // north of an E-W road → faces south
  });
  it("Honolulu palms are detected by taxon", () => {
    const trees = HNL.records.filter((r) => r.kind === "tree");
    assert.equal(trees.filter((t) => t.tree?.crownShape === "palm").length, 9);
    assert.ok(trees.some((t) => t.tree?.genus === "samanea" && t.tree.crownShape === "umbrella"));
    const tall = trees.find((t) => t.heightM === 22);
    assert.ok(tall, "height tag honoured");
  });
  it("PH yields its few OSM items, all src osm", () => {
    assert.ok(PH.records.length >= 10 && PH.records.length < 30);
    for (const r of PH.records) assert.equal(r.src, "osm");
    assert.equal(PH.osmBase, "2026-10-09T12:00:00Z");
    assert.ok(PH.areas.some((a) => a.kind === "park"));
  });
  it("bus stop children: shelter, bench, bin", () => {
    const ldnStop = LDN.records.filter((r) => r.kind === "bus_stop");
    assert.ok(ldnStop.some((r) => r.archetype === "shelter" && r.shelter && r.lit));
    assert.ok(LDN.records.some((r) => r.kind === "waste_basket" && r.osmId === ldnStop[0].osmId));
    const phStop = PH.records.find((r) => r.kind === "bus_stop")!;
    assert.ok(PH.records.some((r) => r.kind === "bench" && r.osmId === phStop.osmId));
  });
  it("underground hydrant gives a plate", () => {
    const h = LDN.records.find((r) => r.kind === "fire_hydrant")!;
    assert.equal(h.archetype, "hydrant_plate");
    assert.ok(h.heightM < 0.1);
    assert.equal(HNL.records.find((r) => r.kind === "fire_hydrant")!.archetype, "hydrant_pillar");
  });
  it("signals: one head per approach (max 4), facing against the approach", () => {
    const ph4 = PH.records.filter((r) => r.kind === "traffic_signals");
    assert.equal(ph4.length, 4); // two two-way roads cross
    assert.ok(ph4.every((r) => r.archetype === "signal_mast"));
    const l = LDN.records.filter((r) => r.kind === "traffic_signals");
    assert.equal(l.length, 3); // two-way secondary (2) + one-way tertiary (1)
    const yaws = new Set(ph4.map((r) => Math.round(r.yawDeg)));
    assert.equal(yaws.size, 4);
  });
  it("signs: explicit direction wins; round for speed limits", () => {
    const stop = LDN.records.find((r) => r.kind === "stop_sign")!;
    assert.equal(stop.yawDeg, 0);
    assert.equal(stop.archetype, "sign_octagon");
    assert.ok(LDN.records.some((r) => r.kind === "traffic_sign" && r.archetype === "sign_round"));
    assert.ok(LDN.records.some((r) => r.kind === "traffic_sign" && r.archetype === "sign_rect"));
  });
  it("tag whitelist is ≤ 12 keys, ≤ 60 chars", () => {
    const t = whitelistTags({ name: "x".repeat(100), foo: "bar", height: "3", ref: "1" })!;
    assert.equal(t.name.length, 60);
    assert.equal(t.foo, undefined);
    for (const r of [...LDN.records, ...PH.records]) if (r.tags) assert.ok(Object.keys(r.tags).length <= 12);
  });
  it("is deterministic", () => {
    assert.deepEqual(parseProps(ldn.elements, box(51.5226, -0.1265), "Europe/London"), LDN);
  });
  it("collects ways, rows and areas", () => {
    assert.equal(LDN.rows.length, 1);
    assert.ok(LDN.ways.some((w) => w.lit === true && w.cls === "secondary"));
    assert.ok(LDN.areas.some((a) => a.kind === "parking"));
  });
});
