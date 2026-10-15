import { test } from "node:test";
import assert from "node:assert/strict";
import { bestDoor, doorsFromEntrances, mergeDoors, synthDoors, type RoadDistance } from "./doors.ts";
import { pointInCollider } from "./geom.ts";
import { fixtureWorld, rect, ringsWorld } from "./testutil.ts";
import type { EntranceNode } from "./types.ts";
import { toEntrances } from "../realism/buildingsData.ts";
import { fixture } from "./testutil.ts";

// the fixture road runs along y = 0
const road: RoadDistance = (x, y) => ({ d: Math.abs(y), px: x, py: 0 });

test("tagged doors: on the wall, outward normal (M4), private → locked", () => {
  const w = fixtureWorld();
  const nodes = toEntrances(fixture().elements) as EntranceNode[];
  const doors = doorsFromEntrances(w, nodes);
  assert.equal(doors.length, 7);
  let ok = 0;
  for (const d of doors) {
    const c = w.byKey(d.colliderKey) ?? assert.fail("collider");
    const out = !pointInCollider(c, d.at.x + d.normal.x * 0.5, d.at.y + d.normal.y * 0.5);
    const inn = pointInCollider(c, d.at.x - d.normal.x * 0.5, d.at.y - d.normal.y * 0.5);
    if (out && inn) ok += 1;
  }
  assert.ok(ok / doors.length >= 0.98);
  assert.ok(doors.some((d) => d.locked));
  assert.ok(doors.some((d) => d.kind === "main"));
});

test("synthetic doors face the road (M5) and are stable", () => {
  const w = fixtureWorld();
  const tagged = doorsFromEntrances(w, toEntrances(fixture().elements));
  const a = synthDoors(w, road, tagged);
  w.rebuild({ lat: w.frame.lat0, lng: w.frame.lng0 });
  const b = synthDoors(w, road, tagged);
  assert.deepEqual(a.map((d) => d.id), b.map((d) => d.id));
  const facing = a.filter((d) => d.normal.y * -Math.sign(d.at.y) > 0.7).length;
  assert.ok(a.length > 20);
  assert.ok(facing / a.length >= 0.85, `${facing}/${a.length}`);
  const all = mergeDoors([...tagged, ...a]);
  const keys = new Set(all.map((d) => d.colliderKey));
  assert.ok(keys.size >= 40);
  const c = w.colliders.find((k) => k.blocking) ?? assert.fail("c");
  assert.ok(bestDoor(all, c.key, { x: 0, y: 0 }));
});

test("enclosed party-wall building gets no door", () => {
  // a 6x6 centre box hemmed in on all sides with 0.2 m gaps
  const w = ringsWorld([rect(0, 0, 6, 6), rect(-6, -6, -0.2, 12), rect(6.2, -6, 12, 12), rect(-0.2, -6, 6.2, -0.2), rect(-0.2, 6.2, 6.2, 12)]);
  const doors = synthDoors(w, (x, y) => ({ d: Math.abs(y + 20), px: x, py: -20 }));
  assert.equal(doors.filter((d) => d.colliderKey === "osm:1").length, 0);
});
