// NDU-UPG placement: node --experimental-strip-types --test src/world/placement/placement.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { METRES_PER_DEG_LAT, offsetMetres, type PlacementPose } from "./nudge.ts";
import { longestEdgeBearing, snap } from "./snap.ts";
import { push, undo } from "./undo.ts";

import { dragDelta, rotateStep } from "./gizmo.ts";

test("snap keeps the centre and applies the bearing", () => {
  const pose: PlacementPose = { lng: 10, lat: 20, rotation: 12, scale: 2 };
  const out = snap({ lng: 3.5, lat: 6.4 }, 90, pose);
  assert.equal(out.lng, 3.5);
  assert.equal(out.lat, 6.4);
  assert.equal(out.rotation, 90);
  assert.equal(out.scale, 2);
  // 0° is north, not "no bearing".
  assert.equal(snap({ lng: 3.5, lat: 6.4 }, 0, pose).rotation, 0);
  const kept = snap({ lng: 1, lat: 2 }, undefined, pose);
  assert.equal(kept.lng, 1);
  assert.equal(kept.lat, 2);
  assert.equal(kept.rotation, 12);
  assert.equal(kept.scale, 2);
  assert.equal(snap({ lng: 1, lat: 2 }, null, pose).rotation, 12);
  // Bearing outside a single turn is normalised the same way placeScan stores it.
  assert.equal(snap({ lng: 1, lat: 2 }, 450, pose).rotation, 90);
  assert.equal(snap({ lng: 1, lat: 2 }, -90, pose).rotation, 270);
});

test("longest edge bearing follows the longest side", () => {
  const tall: Array<[number, number]> = [
    [0, 0],
    [0.001, 0],
    [0.001, 0.01],
    [0, 0.01],
    [0, 0],
  ];
  assert.equal(longestEdgeBearing(tall), 0);
  const wide: Array<[number, number]> = [
    [0, 0],
    [0.01, 0],
    [0.01, 0.001],
    [0, 0.001],
    [0, 0],
  ];
  assert.equal(longestEdgeBearing(wide), 90);
  assert.equal(longestEdgeBearing(null), null);
  assert.equal(longestEdgeBearing([]), null);
});

test("undo returns the previous pose and does nothing on an empty stack", () => {
  const stack: PlacementPose[] = [];
  assert.equal(undo(stack), null);
  assert.equal(stack.length, 0);
  const first: PlacementPose = { lng: 1, lat: 2, rotation: 3, scale: 1 };
  const second: PlacementPose = { lng: 4, lat: 5, rotation: 6, scale: 2 };
  push(stack, first);
  push(stack, second);
  assert.deepEqual(undo(stack), second);
  assert.deepEqual(undo(stack), first);
  assert.equal(undo(stack), null);
  assert.equal(stack.length, 0);
  const live: PlacementPose = { lng: 1, lat: 2, rotation: 0, scale: 1 };
  push(stack, live);
  live.lng = 9;
  assert.equal(undo(stack)?.lng, 1);
  for (let i = 0; i < 25; i += 1) push(stack, { lng: i, lat: 0, rotation: 0, scale: 1 });
  assert.equal(stack.length, 20);
  assert.equal(stack[0]?.lng, 5);
  assert.equal(undo(stack)?.lng, 24);
});

test("east/north offset moves lng/lat with the right sign (east increases lng in the eastern hemisphere)", () => {
  const pose: PlacementPose = { lng: 10, lat: 0, rotation: 5, scale: 1 };
  const east = offsetMetres(pose, METRES_PER_DEG_LAT, 0);
  assert.ok(east.lng > pose.lng);
  assert.ok(Math.abs(east.lng - (pose.lng + 1)) < 1e-9);
  assert.equal(east.lat, pose.lat);
  assert.equal(east.rotation, pose.rotation);
  assert.equal(east.scale, pose.scale);
  const north = offsetMetres(pose, 0, METRES_PER_DEG_LAT);
  assert.ok(north.lat > pose.lat);
  assert.ok(Math.abs(north.lat - (pose.lat + 1)) < 1e-9);
  assert.equal(north.lng, pose.lng);
  const back = offsetMetres(pose, -METRES_PER_DEG_LAT, -METRES_PER_DEG_LAT);
  assert.ok(back.lng < pose.lng);
  assert.ok(back.lat < pose.lat);
  // Eastern hemisphere, non-zero latitude: cos(lat) scales longitude, signs stay positive.
  const lagos: PlacementPose = { lng: 3.4, lat: 6.5, rotation: 0, scale: 1 };
  const moved = offsetMetres(lagos, 100, 50);
  assert.ok(moved.lng > lagos.lng);
  assert.ok(moved.lat > lagos.lat);
  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos((lagos.lat * Math.PI) / 180);
  assert.ok(Math.abs(moved.lng - lagos.lng - 100 / metresPerDegLng) < 1e-9);
  assert.ok(Math.abs(moved.lat - lagos.lat - 50 / METRES_PER_DEG_LAT) < 1e-9);
});


test("a 20 degree step snaps to 15 and a 10px drag at 0.5 m/px is 5 metres", () => {
  assert.equal(rotateStep(20), 15);
  assert.equal(rotateStep(-20), -15);
  assert.equal(rotateStep(0), 0);
  assert.equal(rotateStep(15), 15);
  const drag = dragDelta(10, 0, 0.5);
  assert.equal(drag.east, 5);
  assert.equal(drag.north, 0);
  assert.equal(drag.metres, 5);
  const down = dragDelta(0, 10, 0.5);
  assert.equal(down.east, 0);
  assert.equal(down.north, -5);
  assert.equal(down.metres, 5);
});
