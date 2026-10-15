import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMapbox, decodeTerrarium, decodeTile, lngLatToTilePx, metresPerPixel, minMax, normalAt, sampleBilinear, tilePxToLngLat } from "./terrarium.ts";
import { Bench, Lru, capForTier, tilesCovering } from "./heightCache.ts";
import { ANCHOR_TAU_S, anchorTarget, clusterHeights, easeAnchor } from "./provider.ts";
import { reliefScore, shouldTerrain } from "./relief.ts";
import { contactPose, ease, footprintCorners, scanBase, vehiclePose } from "./pose.ts";
import { alongZ, bakeGraph } from "./profile.ts";
import { buildGraph, projector } from "../life/graph.ts";
import { parseStreets } from "../life/parse.ts";
import { tileVertical } from "../life/tiles.ts";
import { StreetSim } from "../life/sim.ts";
import type { Streets } from "../life/parse.ts";

const near = (a: number, b: number, eps: number, msg?: string) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ""} ${a} vs ${b} (±${eps})`);

// ── T1 terrarium ──
test("terrarium + mapbox decode", () => {
  assert.equal(decodeTerrarium(137, 219, 68), 2523.265625);
  near(decodeMapbox(1, 150, 136), 407.2, 1e-6);
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  const rgba = new Uint8ClampedArray([128, 0, 0, 255, 128, 10, 128, 255, 127, 255, 0, 255, 128, 1, 0, 255]);
  const t = decodeTile(rgba, 2);
  assert.deepEqual(Array.from(t), [0, 10.5, -1, 1]);
  assert.deepEqual(minMax(t), { min: -1, max: 10.5 });
});

test("tile pixel round trips (Honolulu, Lagos, Port Harcourt)", () => {
  for (const [lat, lng] of [
    [21.3069, -157.8583],
    [6.4541, 3.3947],
    [4.8156, 7.0498],
  ]) {
    for (const z of [12, 14, 15]) {
      const p = lngLatToTilePx(lng, lat, z);
      const [lng2, lat2] = tilePxToLngLat(p.x, p.y, z);
      near(lng2, lng, 1e-9, "lng");
      near(lat2, lat, 1e-9, "lat");
      assert.equal(p.tx, Math.floor(p.x / 256));
    }
  }
  near(metresPerPixel(0, 0), 156543.03, 0.01);
});

const synth = (size: number, f: (x: number, y: number) => number) => {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) h[y * size + x] = f(x + 0.5, y + 0.5);
  return { h, size };
};

test("bilinear on ramp + saddle", () => {
  const ramp = synth(8, (x, y) => 2 * x + 3 * y);
  near(sampleBilinear(ramp, 3.3, 4.7), 2 * 3.3 + 3 * 4.7, 1e-5);
  near(sampleBilinear(ramp, 1.5, 1.5), 7.5, 1e-6);
  const saddle = synth(8, (x, y) => (x - 4) * (y - 4));
  near(sampleBilinear(saddle, 3.5, 4.5), -0.25, 1e-6);
  // clamped edge
  near(sampleBilinear(ramp, -5, 0.5), 2 * 0.5 + 3 * 0.5, 1e-6);
});

test("10% ramp gives 5.71° slope", () => {
  const mpp = 10;
  const ramp = synth(16, (x) => x * mpp * 0.1);
  const n = normalAt(ramp, 8, 8, mpp);
  near(n.slopeDeg, 5.71, 0.01);
  assert.ok(n.nx < 0 && Math.abs(n.ny) < 1e-9);
});

// ── T2 cache pieces ──
test("LRU eviction order", () => {
  const l = new Lru<number>(2);
  l.set("a", 1);
  l.set("b", 2);
  l.get("a");
  assert.deepEqual(l.set("c", 3), ["b"]);
  assert.deepEqual(l.keys(), ["a", "c"]);
  assert.equal(capForTier("A"), 40);
  assert.equal(capForTier("A", true), 24);
  assert.equal(capForTier("B"), 16);
  assert.equal(capForTier("C"), 0);
});

test("tilesCovering: middle vs corner", () => {
  // centre of z14 tile (x, y)
  const z = 14;
  const [lngC, latC] = tilePxToLngLat(8000 * 256 + 128, 7000 * 256 + 128, z);
  assert.equal(tilesCovering(lngC, latC, 100, z).length, 1);
  const [lngK, latK] = tilePxToLngLat(8000 * 256, 7000 * 256, z);
  assert.equal(tilesCovering(lngK + 1e-9, latK - 1e-9, 100, z).length, 4);
});

test("bench: 3 fails then 2 min cool-down", () => {
  const b = new Bench();
  b.fail(0);
  b.fail(1);
  assert.equal(b.benched(2), false);
  b.fail(2);
  assert.equal(b.benched(3), true);
  assert.equal(b.benched(120_003), false);
});

// ── T3 anchor rule ──
test("anchor: drawn 0 while DEM says 40 keeps last anchor", () => {
  assert.deepEqual(anchorTarget(0, 40, 37), { h: 37, src: "last", ok: false });
  assert.equal(anchorTarget(0, 40, null).ok, false);
  assert.deepEqual(anchorTarget(41.2, 40, 37), { h: 41.2, src: "map", ok: true });
  assert.equal(anchorTarget(0, 0.4, 5).h, 0); // genuinely sea level
  assert.equal(anchorTarget(null, 40, 12).h, 12);
});

test("anchor easing converges within 1 cm in 1.2 s, snaps > 30 m", () => {
  let a: number | null = 0;
  for (let i = 0; i < 72; i += 1) a = easeAnchor(a, 1, 1 / 60); // 1 m re-anchor over 1.2 s
  near(a as number, 1, 0.01);
  assert.equal(easeAnchor(0, 31, 0.016), 31);
  assert.equal(easeAnchor(0, 10, 0.016, true), 10);
  assert.equal(ANCHOR_TAU_S, 0.25);
});

test("clusterZ = anchor + DEM deltas, NaN-safe", () => {
  const z = clusterHeights(12, 40, [40, 42.5, null, 38]);
  assert.deepEqual(Array.from(z), [12, 14.5, 12, 10]);
  assert.deepEqual(Array.from(clusterHeights(5, null, [1, 2])), [5, 5]);
});

test("relief gating + hysteresis", () => {
  const flat = reliefScore([1, 1.5, 2, 2.2, 2.5], [0.5, 1]);
  assert.ok(flat.range < 4);
  assert.equal(shouldTerrain("A", flat, 60, true), false);
  assert.equal(shouldTerrain("A", { range: 5, p90slope: 1 }, 60, false), false); // in the band: stay off
  assert.equal(shouldTerrain("A", { range: 5, p90slope: 1 }, 60, true), true); // in the band: stay on
  assert.equal(shouldTerrain("A", { range: 7, p90slope: 1 }, 60, false), true);
  assert.equal(shouldTerrain("B", { range: 20, p90slope: 5 }, 30, false), false);
  assert.equal(shouldTerrain("B", { range: 20, p90slope: 5 }, 45, false), true);
  assert.equal(shouldTerrain("B", { range: 10, p90slope: 1 }, 38, true), true);
  assert.equal(shouldTerrain("C", { range: 200, p90slope: 30 }, 60, true), false);
  const s = reliefScore([0, NaN, 100]);
  assert.ok(Number.isFinite(s.range));
});

// ── T4 scans ──
test("scanBase: centre, plinth, relative, absolute", () => {
  assert.deepEqual(scanBase([10, 10.2, 10.1, 10.3], 10.15), { base: 10.15, plinth: 0 });
  const b = scanBase([10, 11, 12, 11], 11, "ground", 0.3);
  near(b.base, 10.3, 1e-9);
  near(b.plinth, 1, 1e-9);
  assert.deepEqual(scanBase([10, 14], 12, "relative", 2), { base: 14, plinth: 0 });
  assert.deepEqual(scanBase([10, 14], 12, "absolute", 55), { base: 55, plinth: 0 });
  assert.deepEqual(scanBase([], NaN), { base: 0, plinth: 0 });
  const c = footprintCorners(3.39, 6.45, 10, 4, 1, 90);
  assert.equal(c.length, 4);
  const kx = 111320 * Math.cos((6.45 * Math.PI) / 180);
  near(Math.abs(c[1][0] - c[0][0]) * kx, 0, 1e-6); // rotated 90°: x-edge runs north-south
});

// ── T5 graph bake ──
const STREETS = (pts: [number, number][], walks: Streets["walks"] = []): Streets => ({
  lat: 0,
  lng: 0,
  roads: [{ cls: "residential", oneway: 0, lanes: 2, maxKmh: 30, name: "", pts }],
  walks,
  pois: [],
});
const line = (n: number, stepM: number): [number, number][] => Array.from({ length: n }, (_, i) => [(i * stepM) / 111320, 0] as [number, number]);

test("bake on a ramp: nodeZ + zs + alongZ", () => {
  const g = buildGraph(STREETS(line(4, 30)));
  const { toLL } = projector(0, 0);
  const ramp = (lng: number) => ({ h: lng * 111320 * 0.1, ok: true, src: "dem" as const });
  const r = bakeGraph(g, (lng) => ramp(lng), toLL, 7);
  assert.equal(r.unknown, 0);
  assert.equal(g.zVersion, 7);
  assert.ok(g.nodeZ);
  const e = g.drive.find((d) => d.dx > 0) as (typeof g.drive)[number];
  assert.ok(e.zs && e.zs.length >= 4);
  near(alongZ(g, e, e.len / 2), (g.nodes[e.a].x + e.len / 2) * 0.1, 0.05);
  assert.equal(e.deck, "ground");
});

test("smoothing removes a 4 m spike, keeps a 10 m slope", () => {
  const g = buildGraph(STREETS(line(21, 5)));
  const { toLL } = projector(0, 0);
  const spikeAt = 10 * 5;
  bakeGraph(g, (lng) => ({ h: Math.abs(lng * 111320 - spikeAt) < 0.5 ? 4 : 0, ok: true, src: "dem" }), toLL);
  const mid = g.nodes.findIndex((n) => Math.abs(n.x - spikeAt) < 0.5);
  assert.ok((g.nodeZ as Float32Array)[mid] < 0.5);
  const g2 = buildGraph(STREETS(line(21, 5)));
  bakeGraph(g2, (lng) => ({ h: lng * 111320 * 0.1, ok: true, src: "dem" }), toLL);
  const nz = g2.nodeZ as Float32Array;
  const first = g2.nodes.findIndex((n) => Math.abs(n.x) < 0.1);
  const last = g2.nodes.findIndex((n) => Math.abs(n.x - 100) < 0.1);
  assert.ok(nz[last] - nz[first] >= 9.5);
});

test("bake is NaN-safe; bridges float over a valley", () => {
  const g = buildGraph(STREETS(line(5, 20)));
  const { toLL } = projector(0, 0);
  bakeGraph(g, () => ({ h: NaN, ok: false, src: "last" }), toLL);
  assert.ok(g.nodeZ);
  const e = g.drive[0];
  assert.ok(Number.isNaN(alongZ(g, e, 1)));
  // 3-span bridge between two abutments at 10 m over a 0 m valley
  const st: Streets = {
    lat: 0,
    lng: 0,
    roads: [
      { cls: "residential", oneway: 0, lanes: 2, maxKmh: 30, name: "", pts: line(2, 20) },
      { cls: "residential", oneway: 0, lanes: 2, maxKmh: 30, name: "", pts: line(5, 20).slice(1), deck: "bridge", layer: 1 },
      { cls: "residential", oneway: 0, lanes: 2, maxKmh: 30, name: "", pts: line(6, 20).slice(4) },
    ],
    walks: [],
    pois: [],
  };
  const gb = buildGraph(st);
  bakeGraph(gb, (lng) => {
    const x = lng * 111320;
    return { h: x <= 20.5 || x >= 79.5 ? 10 : 0, ok: true, src: "dem" };
  }, toLL);
  const midNode = gb.nodes.findIndex((n) => Math.abs(n.x - 40) < 0.5);
  near((gb.nodeZ as Float32Array)[midNode], 10, 0.01);
});

// ── T6 vehicles ──
test("vehiclePose: 10% grade pitch, symmetric camber roll 0, clamp", () => {
  const grade = vehiclePose((x) => x * 0.1, { x: 0, y: 0 }, 1, 0, 4.5, 1.8);
  near((grade.pitch * 180) / Math.PI, 5.71, 0.1);
  near(grade.roll, 0, 1e-9);
  const camber = vehiclePose((_x, y) => -Math.abs(y) * 0.02, { x: 0, y: 0 }, 1, 0, 4.5, 1.8);
  near(camber.roll, 0, 1e-9);
  const cliff = contactPose(10, 0, 0, 0, 3, 1.8);
  near((cliff.pitch * 180) / Math.PI, 14, 1e-9);
  const sideways = vehiclePose((_x, y) => y * 0.1, { x: 0, y: 0 }, 1, 0, 4.5, 1.8); // left (north) is higher
  assert.ok(sideways.roll > 0);
  assert.equal(vehiclePose((x) => x, { x: 2, y: 0 }, 1, 0, 4.5, 1.8, true).z, 2);
  near(ease(1, 0.2), 1 - Math.exp(-5), 1e-12);
});

test("sim: z stays 0 when unbaked, follows the ramp when baked", () => {
  const st = STREETS(line(8, 25), [{ kind: "footway", pts: line(8, 25).map(([x]) => [x, 10 / 111320] as [number, number]) }]);
  const g = buildGraph(st);
  const sim = new StreetSim(g, { seed: 1, region: "ng", minutes: 720, weekday: 2 });
  sim.setTargets({ walkers: 10, vehicles: 6 });
  for (let i = 0; i < 20; i += 1) sim.step(0.1);
  const all = [...sim.walkers, ...sim.vehicles].filter((a) => a.placed);
  assert.ok(all.length > 0);
  assert.ok(all.every((a) => (a.rz ?? 0) === 0));
  const { toLL } = projector(0, 0);
  bakeGraph(g, (lng) => ({ h: lng * 111320 * 0.1, ok: true, src: "dem" }), toLL);
  for (let i = 0; i < 40; i += 1) sim.step(0.1);
  const placed = [...sim.walkers, ...sim.vehicles].filter((a) => a.placed && a.fade > 0.5);
  assert.ok(placed.length > 0);
  for (const a of placed) near(a.rz ?? 0, a.rx * 0.1, 1.5, "rz");
});

// ── T8 tags ──
test("Overpass bridge/tunnel/steps tags", () => {
  const geom = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.001 },
  ];
  const st = parseStreets(0, 0, [
    { type: "way", tags: { highway: "primary", bridge: "yes", layer: "1" }, geometry: geom },
    { type: "way", tags: { highway: "residential", tunnel: "building_passage" }, geometry: geom },
    { type: "way", tags: { highway: "steps", incline: "up", step_count: "20" }, geometry: geom },
    { type: "way", tags: { highway: "residential", bridge: "no", layer: "9" }, geometry: geom },
  ]);
  assert.equal(st.roads[0].deck, "bridge");
  assert.equal(st.roads[0].layer, 1);
  assert.equal(st.roads[1].deck, "passage");
  assert.equal(st.walks[0].deck, "steps");
  assert.equal(st.walks[0].incline, "up");
  assert.equal(st.walks[0].stepCount, 20);
  assert.equal(st.roads[2].deck, undefined);
  assert.equal(st.roads[2].layer, 5);
  assert.deepEqual(tileVertical({ brunnel: "bridge", layer: 2 }), { deck: "bridge", layer: 2 });
  assert.deepEqual(tileVertical({ brunnel: "ford" }), {});
  const g = buildGraph(st);
  assert.ok(g.drive.some((e) => e.deck === "bridge" && e.layer === 1));
  assert.ok(g.walk.some((e) => e.deck === "bridge")); // the bridge's sidewalks
  assert.ok(g.walk.some((e) => e.deck === "steps"));
});
