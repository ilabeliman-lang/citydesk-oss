import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMaxspeed, parseOneway, parseStreets, type Streets } from "./parse.ts";
import { along, buildGraph, laneOffset, LANE_M, nearestEdge, seeded } from "./graph.ts";
import { CAPS, driveFactor, lifeTargets, walkFactor } from "./density.ts";
import { StreetSim } from "./sim.ts";
import { evalInterp, metresFor, readInterp, trueWidth } from "./roadWidths.ts";

// A small block: a two-way N-S street, a one-way E-W street crossing it, and a footway.
const LAT = 21.3115;
const LNG = -157.8625;
const d = 0.0015;
const streets: Streets = parseStreets(LAT, LNG, [
  { type: "way", tags: { highway: "tertiary", name: "Bethel St", maxspeed: "25 mph" }, geometry: [{ lat: LAT - d, lon: LNG }, { lat: LAT, lon: LNG }, { lat: LAT + d, lon: LNG }] },
  { type: "way", tags: { highway: "residential", oneway: "yes", lanes: "2" }, geometry: [{ lat: LAT, lon: LNG - d }, { lat: LAT, lon: LNG }, { lat: LAT, lon: LNG + d }] },
  { type: "way", tags: { highway: "footway" }, geometry: [{ lat: LAT + d / 2, lon: LNG - d }, { lat: LAT + d / 2, lon: LNG - d / 3 }] },
  { type: "way", tags: { highway: "service", service: "parking_aisle" }, geometry: [{ lat: LAT, lon: LNG }, { lat: LAT + d, lon: LNG + d }] },
  { type: "node", lat: LAT, lon: LNG, tags: { highway: "traffic_signals" } },
  { type: "node", lat: LAT + d / 2, lon: LNG + 0.00005, tags: { highway: "bus_stop", name: "Bethel + Hotel" } },
  { type: "way", center: { lat: LAT + d / 2, lon: LNG - d / 2 }, tags: { amenity: "marketplace", name: "Market" } },
]);

test("parse: tags -> classes, oneway, maxspeed; parking aisles dropped", () => {
  assert.equal(streets.roads.length, 2);
  assert.equal(streets.walks.length, 1);
  assert.equal(streets.roads[0].maxKmh, 40);
  assert.equal(streets.roads[1].oneway, 1);
  assert.equal(streets.roads[1].lanes, 2);
  assert.deepEqual(streets.pois.map((p) => p.kind).sort(), ["bus", "market", "signal"]);
  assert.equal(parseMaxspeed("50"), 50);
  assert.equal(parseMaxspeed("none"), null);
  assert.equal(parseOneway({ oneway: "-1" }), -1);
  assert.equal(parseOneway({ junction: "roundabout" }), 1);
});

test("graph: oneway respected, two-way doubled, lanes on the right", () => {
  const g = buildGraph(streets);
  const oneway = g.drive.filter((e) => e.road === 1);
  const twoWay = g.drive.filter((e) => e.road === 0);
  assert.equal(oneway.length, 2, "one-way street only has forward edges");
  assert.ok(oneway.every((e) => e.dx > 0.99), "one-way edges all point east");
  assert.equal(twoWay.length, 4, "two-way street has both directions");
  // right-hand traffic: northbound lane sits east of the centre line
  const north = twoWay.find((e) => e.dy > 0.99);
  assert.ok(north);
  const p = along(g, north, 10, laneOffset(north, 0));
  assert.ok(p.x > 1 && p.x < LANE_M, `northbound lane offset ${p.x}`);
  // one-way 2-lane road is centred: lanes at ±1.6 m
  const east = oneway[0];
  assert.equal(laneOffset(east, 0), -LANE_M / 2);
  assert.equal(laneOffset(east, 1), LANE_M / 2);
  // junction shared -> connected; signal and stop snapped
  const centre = g.nodes.findIndex((n) => Math.hypot(n.x, n.y) < 0.5);
  assert.ok(g.out[centre].length >= 2);
  assert.ok(g.signals.has(centre));
  assert.ok(g.stops.size >= 2, "bus stop serves both directions");
  // sidewalks on both roads + the footway
  assert.equal(g.walk.filter((e) => e.off > 0).length, 4);
  assert.equal(g.walk.filter((e) => e.off === 0).length, 1);
});

test("density: tier caps and rush hour", () => {
  assert.deepEqual(lifeTargets("C", 8 * 60, 2), { walkers: 0, vehicles: 0 });
  const rush = lifeTargets("B", 8 * 60, 2);
  const night = lifeTargets("B", 3 * 60, 2);
  assert.ok(rush.vehicles <= CAPS.B.vehicles && rush.vehicles === CAPS.B.vehicles);
  assert.ok(night.vehicles < rush.vehicles / 3 && night.walkers < rush.walkers / 3);
  assert.ok(lifeTargets("A", 8 * 60, 2).vehicles <= 40);
  assert.ok(driveFactor(17 * 60) > driveFactor(12 * 60));
  assert.ok(walkFactor(13 * 60) > walkFactor(2 * 60));
  assert.equal(lifeTargets("B", 8 * 60, 2, 4).vehicles, CAPS.B.vehicles / 2, "degrade ladder halves the street");
});

function run(seed: number, seconds: number) {
  const g = buildGraph(streets);
  const sim = new StreetSim(g, { seed, region: "hi", minutes: 8 * 60, weekday: 2 });
  sim.setTargets({ walkers: 12, vehicles: 6 });
  for (let t = 0; t < seconds * 30; t += 1) sim.step(1 / 30);
  return sim;
}

test("sim: deterministic per seed (#239)", () => {
  const a = run(42, 20);
  const b = run(42, 20);
  assert.deepEqual(
    a.vehicles.map((v) => [v.kind, v.e, v.s.toFixed(3)]),
    b.vehicles.map((v) => [v.kind, v.e, v.s.toFixed(3)]),
  );
  assert.deepEqual(
    a.walkers.map((w) => [w.e, w.s.toFixed(3)]),
    b.walkers.map((w) => [w.e, w.s.toFixed(3)]),
  );
});

test("sim: walkers stay on walkways, vehicles on legal lanes, nobody overlaps", () => {
  const sim = run(7, 60);
  const g = sim.g;
  assert.ok(sim.walkers.length > 0 && sim.vehicles.length > 0);
  for (const w of sim.walkers) {
    const hit = nearestEdge(g.walk, g.nodes, { x: w.rx, y: w.ry }, 40);
    assert.ok(hit && hit.dist <= Math.max(1, g.walk[hit.edge].off) + 1.2, `walker ${w.id} is ${hit?.dist} m off its walkway`);
  }
  for (const v of sim.vehicles) {
    const e = g.drive[v.e];
    if (e.road === 1) assert.ok(e.dx > 0.99, "vehicle on the one-way street drives with it");
    assert.ok(v.v >= 0 && v.v <= e.vmax * 1.2 + 0.5, `speed ${v.v} within the cap`);
  }
  for (const a of sim.vehicles) {
    for (const b of sim.vehicles) {
      if (a === b || a.e !== b.e || Math.min(a.lane, g.drive[a.e].lanes - 1) !== Math.min(b.lane, g.drive[b.e].lanes - 1)) continue;
      assert.ok(Math.abs(a.s - b.s) > 1, "car following keeps vehicles apart");
    }
  }
});

test("sim: red light holds traffic at the stop line", () => {
  const g = buildGraph(streets);
  const sim = new StreetSim(g, { seed: 1, region: "ng", minutes: 600, weekday: 3 });
  const centre = g.nodes.findIndex((n) => Math.hypot(n.x, n.y) < 0.5);
  const east = g.drive.find((e) => e.b === centre && e.dx > 0.99);
  assert.ok(east);
  // N-S green in the first half of the cycle -> an E-W approach is red then
  const t = [...Array(72).keys()].map((i) => i / 2).find((x) => !sim.signalGreen(centre, east, x));
  assert.ok(t !== undefined);
});

test("road widths #201: true metres from z16, never thinner than the style", () => {
  const original = ["interpolate", ["exponential", 1.2], ["zoom"], 13.5, 0, 14, 2.5, 20, 18];
  assert.equal(metresFor("road_minor"), 7);
  assert.equal(metresFor("road_minor_casing"), 8.6);
  assert.equal(metresFor("road_major_rail"), null);
  const next = trueWidth(original, 7, LAT);
  assert.ok(next);
  const f = readInterp(next);
  assert.ok(f);
  assert.equal(evalInterp(f, 14), 2.5, "below z16 unchanged");
  const o = readInterp(original);
  assert.ok(o);
  for (let z = 16; z <= 22; z += 0.5) assert.ok(evalInterp(f, z) >= evalInterp(o, Math.min(z, 20)) - 0.01);
  // at z20, 7 m at lat 21.3 is ~7 / 0.0696 = ~100 px
  assert.ok(Math.abs(evalInterp(f, 20) - 100.6) < 2);
});

test("seeded rng is stable", () => {
  const a = seeded(123);
  const b = seeded(123);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("tiles: stitch joins a tile-clipped end onto the other line", async () => {
  const { stitch } = await import("./tiles.ts");
  const a: [number, number][] = [
    [LNG - d, LAT],
    [LNG + d, LAT],
  ];
  // a street ending 1.5 m north of the middle of `a` (not on a vertex)
  const b: [number, number][] = [
    [LNG, LAT + d],
    [LNG, LAT + 1.5 / 111320],
  ];
  const [a2, b2] = stitch([a, b], LAT, LNG);
  assert.equal(a2.length, 3, "end inserted into the crossing line");
  assert.deepEqual(a2[1], b2[1]);
  // an end within 1 m of an existing vertex snaps onto it instead (no sliver edges)
  const c: [number, number][] = [
    [LNG + d, LAT + d],
    [LNG + d, LAT + 0.5 / 111320],
  ];
  const [, , c2] = stitch([a, b, c], LAT, LNG);
  assert.deepEqual(c2[1], a[1]);
  const g = buildGraph({ lat: LAT, lng: LNG, roads: [a2, b2].map((pts) => ({ cls: "residential", oneway: 0 as const, lanes: 2, maxKmh: 30, name: "", pts })), walks: [], pois: [] });
  const mid = g.nodes.findIndex((n) => Math.abs(n.x) < 0.5 && Math.abs(n.y - 1.5) < 0.5);
  assert.ok(mid >= 0 && g.out[mid].length === 3, "T junction is connected");
});

// NDU-UPG follow: street-level view is true scale; a greeted walker stops and turns to face the player
import { GREET_M, lifeScales, walkerScale } from "./scale.ts";
import { greetReply } from "./sim.ts";

test("street-level tilt draws the crowd at true scale (1 unit = 1 m)", () => {
  assert.deepEqual(lifeScales(17, 85), { scale: 1, vscale: 1 });
  assert.equal(lifeScales(17, 50).scale, walkerScale(17));
  assert.ok(walkerScale(17) > 1);
  assert.ok(GREET_M >= 10 && GREET_M <= 15);
});

test("greet: the walker pauses and faces the player, then walks on", () => {
  const sim = run(7, 5);
  const w = sim.walkers.find((a) => a.placed && !a.leaving);
  assert.ok(w);
  const player = { x: w.rx + 8, y: w.ry }; // 8 m east of them
  sim.setPlayer(player);
  assert.ok(sim.greet(w.id, 3));
  const at = { x: w.rx, y: w.ry };
  for (let t = 0; t < 30; t += 1) sim.step(1 / 30);
  assert.ok(Math.hypot(w.rx - at.x, w.ry - at.y) < 0.3, "stands still");
  assert.ok(Math.abs(Math.atan2(Math.sin(w.rh - Math.PI / 2), Math.cos(w.rh - Math.PI / 2))) < 0.2, `faces east, rh=${w.rh}`);
  for (let t = 0; t < 120; t += 1) sim.step(1 / 30);
  assert.equal(w.facing, false);
  assert.match(greetReply(w.role, "ng", w.id), /\w/);
});

test("greet: unmount removes the ndu-stand listener it added", () => {
  const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = src.indexOf("export function bindNduStand");
  assert.ok(start >= 0, "bindNduStand is exported");
  const end = src.indexOf("\n}", start);
  assert.ok(end > start);
  const js = src
    .slice(start, end + 2)
    .replace(/^export /m, "")
    .replace("(onStand: () => void): () => void", "(onStand)");
  const bindNduStand = new Function(`${js}\nreturn bindNduStand;`)() as (onStand: () => void) => () => void;

  const added: { type: string; fn: () => void }[] = [];
  const removed: { type: string; fn: () => void }[] = [];
  const g = globalThis as unknown as {
    window?: {
      addEventListener: (type: string, fn: () => void) => void;
      removeEventListener: (type: string, fn: () => void) => void;
    };
  };
  const previous = g.window;
  g.window = {
    addEventListener(type: string, fn: () => void) {
      added.push({ type, fn });
    },
    removeEventListener(type: string, fn: () => void) {
      removed.push({ type, fn });
    },
  };
  try {
    const onStand = () => {};
    const unmount = bindNduStand(onStand);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "ndu-stand");
    assert.equal(added[0].fn, onStand);
    unmount();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].type, added[0].type, "same event");
    assert.equal(removed[0].fn, added[0].fn, "same handler");
  } finally {
    g.window = previous;
  }

  assert.match(src, /const unbindStand = bindNduStand\(onStand\);/);
  const cleanup = src.slice(src.lastIndexOf("return () => {"));
  assert.match(cleanup, /unbindStand\(\);/);
});


test("land: tunnels stay off the surface, bridges stay, signs do not invent a speed", () => {
  const land = parseStreets(LAT, LNG, [
    { type: "way", tags: { highway: "residential", tunnel: "yes" }, geometry: [{ lat: LAT, lon: LNG }, { lat: LAT + d, lon: LNG }] },
    { type: "way", tags: { highway: "residential", bridge: "yes", name: "Creek" }, geometry: [{ lat: LAT, lon: LNG }, { lat: LAT, lon: LNG + d }] },
    { type: "way", tags: { highway: "residential", maxspeed: "30" }, geometry: [{ lat: LAT - d, lon: LNG }, { lat: LAT, lon: LNG }] },
    { type: "node", lat: LAT, lon: LNG, tags: { highway: "stop" } },
    { type: "node", lat: LAT, lon: LNG + d, tags: { highway: "give_way" } },
    { type: "node", lat: LAT, lon: LNG, tags: { highway: "traffic_sign", maxspeed: "80", traffic_sign: "maxspeed" } },
    { type: "node", lat: LAT + 0.0004, lon: LNG + 0.0004, tags: { natural: "tree" } },
    { type: "node", lat: LAT, lon: LNG, tags: { natural: "tree" } },
    { type: "node", lat: LAT + 0.00045, lon: LNG - 0.00045, tags: { natural: "cave_entrance" } },
    { type: "node", lat: LAT + 0.0004, lon: LNG - 0.0002, tags: { advertising: "billboard" } },
  ]);
  assert.equal(land.roads.some((r) => r.name === "Creek" && r.deck === "bridge"), true);
  assert.equal(land.roads.some((r) => r.deck !== "bridge" && r.maxKmh === 30), true);
  assert.equal(land.roads.some((r) => r.maxKmh === 80), false);
  assert.deepEqual(land.pois.map((p) => p.kind).sort(), ["board", "cave", "stop", "tree", "tree", "yield"]);
  const g = buildGraph(land);
  assert.equal(g.pois.filter((p) => p.kind === "tree").length, 1, "a tree in the lane is dropped");
  assert.ok(g.pois.some((p) => p.kind === "cave"));
  assert.ok(g.pois.some((p) => p.kind === "board"));
  assert.ok(g.halts.size >= 1);
});
