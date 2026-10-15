import { test } from "node:test";
import assert from "node:assert/strict";
import { collideEnabled, resetCollideFlag } from "./flag.ts";
import { makeFrame, toLL, toXY } from "./enu.ts";
import { closestOnSegment, ensureOrientation, pointInCollider, ringArea } from "./geom.ts";
import { EdgeGrid } from "./grid.ts";
import { isBlocking } from "./world.ts";
import { fixture, fixtureWorld, LAT0, LNG0, rng } from "./testutil.ts";
import { toBuildings, toEntrances } from "../realism/buildingsData.ts";
import { boundsFor, isWalkable, OFFICE_BOUNDS } from "../workverse/nav.ts";
import type { Collider } from "./types.ts";

const g = globalThis as Record<string, unknown>;
function env(search: string, store: Record<string, string> = {}) {
  g.location = { search };
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
  resetCollideFlag();
  return store;
}

test("flag: default off, query on persists, kill switch wins, SSR off", async () => {
  delete g.location;
  resetCollideFlag();
  assert.equal(collideEnabled(), false);
  env("");
  assert.equal(collideEnabled(), false);
  const store = env("?collide=1");
  assert.equal(collideEnabled(), true);
  assert.equal(store["ndu.collide.v1"], "1");
  env("", store);
  assert.equal(collideEnabled(), true, "persisted");
  store["ndu.collide.off"] = "1";
  env("?collide=1", store);
  assert.equal(collideEnabled(), false, "kill switch");
  env("?collide=0");
  assert.equal(collideEnabled(), false);
});

test("bus: publishers no-op when off, replay on subscribe when on", async () => {
  env("?collide=0");
  const bus = await import("./bus.ts");
  bus.publishBuildings([1]);
  let got = 0;
  const off = bus.onCollideData(() => (got += 1));
  assert.equal(got, 0);
  env("?collide=1");
  bus.publishBuildings([1, 2]);
  assert.equal(got, 1);
  off();
  let replay: unknown[] = [];
  bus.onCollideData((d) => (replay = d.buildings))();
  assert.deepEqual(replay, [1, 2]);
  let exitedWith: unknown = "none";
  bus.noteEnteredDoor({ id: "d" });
  bus.onExited((d) => (exitedWith = d));
  bus.exited();
  assert.deepEqual(exitedWith, { id: "d" });
  assert.equal(bus.lastEnteredDoor(), null);
  env("");
});

test("enu round trip < 1 mm at 1 km", () => {
  const f = makeFrame(LAT0, LNG0);
  for (const [x, y] of [[1000, 0], [0, 1000], [-707, 707]]) {
    const ll = toLL(f, x, y);
    const v = toXY(f, ll.lat, ll.lng);
    assert.ok(Math.hypot(v.x - x, v.y - y) < 1e-3);
  }
});

test("geometry: closest point, orientation, PIP with hole", () => {
  const o = { x: 0, y: 0 };
  closestOnSegment(-1, 1, 0, 0, 10, 0, o);
  assert.deepEqual(o, { x: 0, y: 0 });
  closestOnSegment(5, 3, 0, 0, 10, 0, o);
  assert.deepEqual(o, { x: 5, y: 0 });
  const cw = new Float64Array([0, 0, 0, 10, 10, 10, 10, 0, 0, 0]);
  assert.ok(ringArea(cw) < 0);
  assert.ok(ringArea(ensureOrientation(cw, true)) > 0);
  const outer = ensureOrientation(new Float64Array([0, 0, 20, 0, 20, 20, 0, 20, 0, 0]), true);
  const hole = ensureOrientation(new Float64Array([5, 5, 15, 5, 15, 15, 5, 15, 5, 5]), false);
  const c = { rings: [outer, hole], bbox: [0, 0, 20, 20] } as unknown as Collider;
  assert.equal(pointInCollider(c, 2, 2), true);
  assert.equal(pointInCollider(c, 10, 10), false, "courtyard is free");
  assert.equal(pointInCollider(c, 25, 10), false);
});

test("grid.near equals brute force (1000 edges x 500 queries)", () => {
  const r = rng(42);
  const edges = Array.from({ length: 1000 }, (_, i) => {
    const ax = r() * 400 - 200;
    const ay = r() * 400 - 200;
    return { ax, ay, bx: ax + r() * 12 - 6, by: ay + r() * 12 - 6, collider: i };
  });
  const grid = new EdgeGrid(edges, 6, 1);
  const tmp = { x: 0, y: 0 };
  for (let q = 0; q < 500; q += 1) {
    const x = r() * 400 - 200;
    const y = r() * 400 - 200;
    const rad = 0.31 + r() * 0.6;
    const got = new Set<number>();
    grid.near(x, y, rad, (e) => {
      closestOnSegment(x, y, grid.ax[e], grid.ay[e], grid.bx[e], grid.by[e], tmp);
      if (Math.hypot(x - tmp.x, y - tmp.y) <= rad) got.add(e);
    });
    const want = new Set<number>();
    edges.forEach((e, i) => {
      closestOnSegment(x, y, Math.fround(e.ax), Math.fround(e.ay), Math.fround(e.bx), Math.fround(e.by), tmp);
      if (Math.hypot(x - tmp.x, y - tmp.y) <= rad) want.add(i);
    });
    assert.deepEqual([...got].sort(), [...want].sort());
  }
});

test("blocking rule", () => {
  assert.equal(isBlocking(0, 10, "yes"), true);
  assert.equal(isBlocking(0, 3, "roof"), false);
  assert.equal(isBlocking(4, 8, "yes"), false, "raised part above head height");
  assert.equal(isBlocking(0, 0.3, "yes"), false);
});

test("world from fixture: counts, canopy + raised part non-blocking, dedupe, PIP vs brute force", () => {
  const fx = fixture();
  const feats = toBuildings(fx.elements).features;
  const w = fixtureWorld();
  const t0 = performance.now();
  w.ingest({ buildings: [...feats, ...feats] }); // duplicated cells
  const st = w.rebuild({ lat: LAT0, lng: LNG0 });
  console.info(`[collide] fixture rebuild ${(performance.now() - t0).toFixed(1)} ms, ${st.colliders} colliders, ${st.edges} edges`);
  assert.equal(st.colliders, feats.length);
  assert.ok(st.colliders >= 40);
  const roof = w.colliders.find((c) => c.kind === "roof");
  assert.equal(roof?.blocking, false);
  const part = w.colliders.find((c) => c.source === "osm-part");
  assert.equal(part?.blocking, false);
  const r = rng(9);
  for (let i = 0; i < 5000; i += 1) {
    const x = r() * 500 - 250;
    const y = r() * 60 - 30;
    const brute = w.colliders.find((c) => c.blocking && pointInCollider(c, x, y)) ?? null;
    assert.equal(w.pointInBlocking(x, y)?.key ?? null, brute?.key ?? null);
  }
});

test("tile footprints merge: skip covered osm ids, keep holes", () => {
  const w = fixtureWorld();
  const f = w.frame;
  const ll = (x: number, y: number) => [LNG0 + x / f.kx, LAT0 + y / f.ky];
  const sq = (x0: number, y0: number, s: number) => [ll(x0, y0), ll(x0 + s, y0), ll(x0 + s, y0 + s), ll(x0, y0 + s), ll(x0, y0)];
  const anyOsm = w.colliders[0].osm as number;
  w.ingest({ tileFootprints: [{ id: anyOsm * 10 + 1, props: {}, rings: [sq(0, 0, 5)] }, { id: 77770, props: { render_height: 12 }, rings: [sq(300, 300, 30), sq(310, 310, 10)] }] });
  w.rebuild({ lat: LAT0, lng: LNG0 });
  const tiles = w.colliders.filter((c) => c.source === "tile");
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].rings.length, 2);
  assert.equal(w.pointInBlocking(315, 315), null, "courtyard free");
  assert.ok(w.pointInBlocking(302, 302));
});

test("toEntrances: keeps tags, drops entrance=no; toBuildings unchanged by nodes", () => {
  const fx = fixture();
  const ents = toEntrances(fx.elements);
  assert.equal(ents.length, 7);
  assert.ok(ents.some((e) => e.tags.access === "private"));
  assert.ok(ents.some((e) => e.tags.name === "Shop door"));
  const without = fx.elements.filter((e) => e.type !== "node");
  assert.equal(toBuildings(fx.elements).features.length, toBuildings(without).features.length);
});

test("workverse nav: boundsFor archetype; flagship default unchanged", () => {
  const b = boundsFor({ width: 8, depth: 8 }, false);
  assert.equal(isWalkable(5, 0, 0.4, b, []), false);
  assert.equal(isWalkable(2, 0, 0.4, b, []), true);
  assert.deepEqual(boundsFor({ width: 8, depth: 8 }, true), OFFICE_BOUNDS);
  assert.equal(isWalkable(9, 0, 0.4), true);
  assert.equal(isWalkable(0, 0, 0.4), true);
});
