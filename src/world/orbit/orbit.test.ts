// NDU-UPG drag360: node --experimental-strip-types --test src/world/orbit/orbit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { Orbit, wrap180 } from "./orbitCore.ts";

const LIM = { min: 0, max: 85 };
const run = (o: Orbit, s = 3) => {
  for (let t = 0; t < s * 60 && o.step(1 / 60, LIM); t += 1);
};

test("sideways drag turns past 360° with no stop, and the bearing wraps", () => {
  const o = new Orbit({ reduced: true });
  o.down(0, 0, 0, { yaw: 10, pitch: 50 });
  o.move(-1000, 0, 500, LIM); // drag left 1000px → +450°
  assert.equal(o.view.yaw, 460);
  assert.equal(wrap180(o.view.yaw), 100);
  assert.equal(o.view.pitch, 50);
});

test("vertical drag tilts between top-down and the max pitch", () => {
  const o = new Orbit({ reduced: true });
  o.down(0, 0, 0, { yaw: 0, pitch: 50 });
  o.move(0, -60, 100, LIM); // drag up → more pitch
  assert.equal(o.view.pitch, 68);
  o.move(0, -900, 200, LIM);
  assert.equal(o.view.pitch, 85);
  o.move(0, 900, 300, LIM);
  assert.equal(o.view.pitch, 0);
  o.move(0, 900, 400, { min: 0, max: 60 }); // Tier C cap
  assert.equal(o.view.pitch, 0);
  o.move(0, -900, 500, { min: 0, max: 60 });
  assert.equal(o.view.pitch, 60);
});

test("a flick keeps gliding after release and settles; reduced motion stops dead", () => {
  const o = new Orbit();
  o.down(200, 400, 0, { yaw: 0, pitch: 40 });
  for (let i = 1; i <= 5; i += 1) {
    o.move(200 - i * 20, 400, i * 16, LIM);
    o.step(1 / 60, LIM);
  }
  o.up(5 * 16 + 4);
  const atRelease = o.view.yaw;
  run(o);
  assert.ok(o.view.yaw > atRelease + 45, `glided from ${atRelease} to ${o.view.yaw}`);
  assert.equal(o.step(1 / 60, LIM), false);

  const r = new Orbit({ reduced: true });
  r.down(200, 400, 0, { yaw: 0, pitch: 40 });
  for (let i = 1; i <= 5; i += 1) r.move(200 - i * 20, 400, i * 16, LIM);
  r.up(84);
  const end = r.view.yaw;
  assert.equal(r.step(1 / 60, LIM), false);
  assert.equal(r.view.yaw, end);
});

test("a finger that stops before lifting does not glide; halt freezes", () => {
  const o = new Orbit();
  o.down(0, 0, 0, { yaw: 0, pitch: 40 });
  o.move(-100, 0, 50, LIM);
  o.up(400);
  run(o);
  assert.ok(Math.abs(o.view.yaw - 45) < 0.05);
  o.down(0, 0, 500, o.view);
  o.move(-100, -100, 520, LIM);
  o.halt();
  const v = { ...o.view };
  assert.equal(o.step(1 / 60, LIM), false);
  assert.deepEqual(o.view, v);
});

// NDU-UPG follow: street-level default camera (human eye, metres 1:1)
import { eyeOf, rigFor, streetCamera, streetFov } from "./streetCam.ts";

test("street camera centres the avatar on a flat tilt", () => {
  const view = { height: 844, fov: streetFov(390, 844), maxPitch: 85, maxZoom: 23.5 };
  const at = { lng: 7.0134, lat: 4.8156 };
  const cam = streetCamera(at, 90, view);
  assert.equal(cam.pitch, 58);
  const eye = eyeOf({ zoom: cam.zoom, pitch: cam.pitch, lat: at.lat }, view);
  assert.ok(Math.abs(eye.height - 48) < 0.4, `eye ${eye.height}`);
  const ahead = (cam.center[0] - at.lng) * 111320 * Math.cos((at.lat * Math.PI) / 180);
  assert.ok(Math.abs(ahead) < 0.4, `look-at should sit on the avatar, ahead ${ahead}`);
  assert.ok(Math.abs(cam.center[1] - at.lat) < 1e-6);
});

test("a 60° tilt cap still centres the avatar on the flat rig", () => {
  const rig = rigFor(60);
  assert.equal(rig.pitch, 58);
  assert.ok(Math.abs(rig.behind - 48 * Math.tan((58 * Math.PI) / 180)) < 0.05);
  const view = { height: 844, fov: 64, maxPitch: 60, maxZoom: 23.5 };
  const cam = streetCamera({ lng: 0, lat: 0 }, 0, view);
  assert.equal(cam.pitch, 58);
  const eye = eyeOf({ zoom: cam.zoom, pitch: cam.pitch, lat: 0 }, view);
  assert.ok(Math.abs(eye.height - 48) < 0.5, `eye ${eye.height}`);
});

test("second person stands in front of the face and looks back", () => {
  const view = { height: 844, fov: streetFov(390, 844), maxPitch: 85, maxZoom: 23.5, person: "second" as const };
  const at = { lng: 7.0134, lat: 4.8156 };
  const cam = streetCamera(at, 90, view);
  assert.equal(cam.bearing, 270);
  assert.equal(cam.pitch, 76);
  const eye = eyeOf({ zoom: cam.zoom, pitch: cam.pitch, lat: at.lat }, view);
  assert.ok(Math.abs(eye.height - 1.65) < 0.05, `eye ${eye.height}`);
  assert.ok(cam.zoom > 20, `zoom ${cam.zoom}`);
});

test("nav rig (street level off) keeps the Maps-style follow: high, behind, 40° tilt", () => {
  assert.deepEqual(rigFor(85, false), { eye: 200, behind: 290, pitch: 40 });
  const view = { height: 844, fov: 36.87, maxPitch: 85, maxZoom: 22, street: false };
  const cam = streetCamera({ lng: 0, lat: 0 }, 0, view);
  assert.ok(cam.zoom > 17 && cam.zoom < 20, `zoom ${cam.zoom}`);
});
