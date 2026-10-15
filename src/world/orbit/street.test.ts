// node --experimental-strip-types --test src/world/orbit/street.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RIG, NAV_RIG, STREET_EYE_M, STREET_PITCH, streetCamera, streetWhileHeld } from "./streetCam.ts";

const at = { lng: 7.0134, lat: 4.8156 };
const view = { height: 844, fov: 60, maxPitch: 85, maxZoom: 23.5 };

test("first person is a closer camera than third at the same lat/lng", () => {
  const third = streetCamera(at, 90, { ...view, person: "third" });
  const first = streetCamera(at, 90, { ...view, person: "first" });
  assert.equal(first.pitch, 18);
  assert.deepEqual(first.rig, { eye: FIRST_RIG.eye, behind: FIRST_RIG.behind, pitch: FIRST_RIG.pitch });
  assert.equal(FIRST_RIG.eye, 1.55);
  assert.equal(FIRST_RIG.behind, 0.45);
  assert.equal(third.rig.eye, STREET_EYE_M);
  assert.equal(third.pitch, STREET_PITCH);
  assert.equal(third.pitch, 40);
  assert.ok(first.zoom > third.zoom, `first zoom ${first.zoom} should beat third ${third.zoom}`);
  assert.ok(first.rig.eye < third.rig.eye);
  assert.ok(first.rig.behind < third.rig.behind);
  assert.ok(first.rig.eye < NAV_RIG.eye && third.rig.eye < NAV_RIG.eye);
});

test("a held stick keeps the street rig, not the 200 m overview", () => {
  assert.equal(streetWhileHeld(false, true), true);
  assert.equal(streetWhileHeld(true, false), true);
  assert.equal(streetWhileHeld(false, false), false);
  const overview = streetCamera(at, 0, { ...view, street: false });
  const held = streetCamera(at, 0, { ...view, street: streetWhileHeld(false, true), person: "third" });
  const heldFirst = streetCamera(at, 0, { ...view, street: streetWhileHeld(false, true), person: "first" });
  assert.equal(overview.rig.eye, NAV_RIG.eye);
  assert.equal(overview.rig.eye, 200);
  assert.equal(held.rig.eye, STREET_EYE_M);
  assert.equal(held.pitch, 40);
  assert.equal(heldFirst.pitch, FIRST_RIG.pitch);
  assert.ok(heldFirst.zoom > held.zoom);
});
