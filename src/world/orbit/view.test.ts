import test from "node:test";
import assert from "node:assert/strict";
import { getViewMode, setViewMode, onViewMode, cycleViewMode, type ViewMode } from "./viewBus.ts";
import { viewCameraRig, walkingBob, boomDistanceForSpeed } from "./viewRig.ts";

test("viewBus get, set, subscription, and cycle", () => {
  // Reset initial state to chase
  setViewMode("chase");
  assert.equal(getViewMode(), "chase");

  // setViewMode updates state
  setViewMode("fpv");
  assert.equal(getViewMode(), "fpv");

  // Subscription receives immediate current state and updates
  const received: ViewMode[] = [];
  const unsubscribe = onViewMode((mode) => {
    received.push(mode);
  });
  assert.deepEqual(received, ["fpv"]);

  setViewMode("iso");
  assert.deepEqual(received, ["fpv", "iso"]);

  // Unsubscribe stops notifications
  unsubscribe();
  setViewMode("tactical");
  assert.deepEqual(received, ["fpv", "iso"]);
  assert.equal(getViewMode(), "tactical");

  // Cycle view mode: chase -> fpv -> iso -> tactical -> chase
  setViewMode("chase");
  assert.equal(cycleViewMode(), "fpv");
  assert.equal(cycleViewMode(), "iso");
  assert.equal(cycleViewMode(), "tactical");
  assert.equal(cycleViewMode(), "chase");

  // Cycling from planet reverts to chase
  setViewMode("planet");
  assert.equal(cycleViewMode(), "chase");
});

test("viewCameraRig for all 4 primary modes (chase, fpv, iso, tactical)", () => {
  const at = { lng: 7.0134, lat: 4.8156 };
  const view = { width: 390, height: 844 };

  // 1. Chase mode
  const chase = viewCameraRig("chase", at, 90, 0, view);
  assert.equal(chase.pitch, 80);
  assert.equal(chase.eyeHeightM, 1.9);
  assert.equal(chase.bearing, 90);
  assert.equal(chase.fov, 60);
  assert.ok(chase.zoom > 20 && chase.zoom < 23.5, `chase zoom: ${chase.zoom}`);
  // center is shifted along bearing 90° (East)
  assert.ok(chase.center[0] > at.lng, "chase center is East of avatar");
  assert.ok(Math.abs(chase.center[1] - at.lat) < 1e-9, "chase center latitude unchanged");

  // 2. FPV mode
  const fpv = viewCameraRig("fpv", at, 45, 0, view);
  assert.equal(fpv.pitch, 0);
  assert.equal(fpv.eyeHeightM, 1.7);
  assert.equal(fpv.bearing, 45);
  assert.equal(fpv.fov, 75);
  assert.deepEqual(fpv.center, [at.lng, at.lat]);
  assert.ok(fpv.zoom > 23, `fpv zoom: ${fpv.zoom}`);

  // 3. Isometric mode
  const iso = viewCameraRig("iso", at, 180, 0, view);
  assert.equal(iso.pitch, 54.74);
  assert.equal(iso.bearing, 45, "iso camera fixed at azimuth +45°");
  assert.equal(iso.zoom, 17);
  assert.deepEqual(iso.center, [at.lng, at.lat]);
  assert.ok(iso.eyeHeightM > 100 && iso.eyeHeightM < 400, `iso eyeHeightM: ${iso.eyeHeightM}`);

  // 4. Tactical mode
  const tactical = viewCameraRig("tactical", at, 120, 0, view);
  assert.equal(tactical.pitch, 15);
  assert.equal(tactical.zoom, 15.5);
  assert.equal(tactical.bearing, 120);
  assert.deepEqual(tactical.center, [at.lng, at.lat]);
  assert.ok(
    tactical.eyeHeightM > 500 && tactical.eyeHeightM < 1500,
    `tactical eyeHeightM: ${tactical.eyeHeightM}`,
  );
});

test("dynamic speed expansion in chase mode", () => {
  const at = { lng: 7.0134, lat: 4.8156 };
  const view = { width: 390, height: 844 };

  // Boom distance calculation: 4.0m at 0 m/s to 7.0m at 20 m/s
  assert.equal(boomDistanceForSpeed(0), 4.0);
  assert.equal(boomDistanceForSpeed(10), 5.5);
  assert.equal(boomDistanceForSpeed(20), 7.0);
  assert.equal(boomDistanceForSpeed(30), 7.0); // capped at 20 m/s

  const c0 = viewCameraRig("chase", at, 90, 0, view);
  const c10 = viewCameraRig("chase", at, 90, 10, view);
  const c20 = viewCameraRig("chase", at, 90, 20, view);
  const c30 = viewCameraRig("chase", at, 90, 30, view);

  // Dynamic FOV widening with speed
  assert.equal(c0.fov, 60);
  assert.equal(c10.fov, 67.5);
  assert.equal(c20.fov, 75);
  assert.equal(c30.fov, 75);

  // Boom expansion pulls the ground target closer to the avatar by exactly 3.0m at 20 m/s
  const coslat = Math.cos((at.lat * Math.PI) / 180);
  const groundOffset0 = (c0.center[0] - at.lng) * 111320 * coslat;
  const groundOffset20 = (c20.center[0] - at.lng) * 111320 * coslat;
  const expansionM = groundOffset0 - groundOffset20;
  assert.ok(
    Math.abs(expansionM - 3.0) < 0.05,
    `expected ~3.0m expansion between 0 and 20 m/s, got ${expansionM}`,
  );

  // Wider FOV slightly reduces zoom level
  assert.ok(c0.zoom > c20.zoom, `c0.zoom (${c0.zoom}) should be > c20.zoom (${c20.zoom})`);

  // Speed above 20 m/s caps cleanly
  assert.equal(c30.fov, c20.fov);
  assert.equal(c30.zoom, c20.zoom);
  assert.deepEqual(c30.center, c20.center);
});

test("walkingBob outputs at 0 m/s (zero bob) and standard walking pace (1.4 m/s)", () => {
  // At 0 m/s (or stationary), bob and sway must be strictly 0 for any timestamp
  for (const t of [0, 0.25, 0.5, 1.0, 2.5, 10.0]) {
    const bobStationary = walkingBob(t, 0);
    assert.equal(bobStationary.yBobM, 0, `yBobM at t=${t} with speed 0 should be 0`);
    assert.equal(bobStationary.xSwayM, 0, `xSwayM at t=${t} with speed 0 should be 0`);
  }

  // Negative speed also returns zero bob
  assert.deepEqual(walkingBob(1.0, -1), { yBobM: 0, xSwayM: 0 });

  // At standard walking pace (1.4 m/s)
  const bob0 = walkingBob(0, 1.4);
  assert.equal(bob0.yBobM, 0);
  assert.equal(bob0.xSwayM, 0);

  // Cadence: at t = 0.125s (1/8s), step phase reaches peak (2 Hz * 0.125s = 0.25 cycle = 90°)
  const bobPeak = walkingBob(0.125, 1.4);
  assert.ok(
    Math.abs(bobPeak.yBobM - 0.04) < 1e-4,
    `expected ~0.04m peak vertical bob, got ${bobPeak.yBobM}`,
  );
  assert.ok(bobPeak.xSwayM > 0, "sway should be positive at t=0.125s");

  // Lateral sway peak at t = 0.25s (1 Hz * 0.25s = 0.25 cycle = 90°)
  const swayPeak = walkingBob(0.25, 1.4);
  assert.ok(
    Math.abs(swayPeak.xSwayM - 0.02) < 1e-4,
    `expected ~0.02m peak lateral sway, got ${swayPeak.xSwayM}`,
  );

  // Check bounds over an entire stride cycle (0 to 1s in increments of 0.05s)
  for (let t = 0; t <= 1.0; t += 0.05) {
    const bob = walkingBob(t, 1.4);
    assert.ok(
      Math.abs(bob.yBobM) <= 0.045,
      `vertical bob ${bob.yBobM} exceeded realistic threshold`,
    );
    assert.ok(
      Math.abs(bob.xSwayM) <= 0.025,
      `lateral sway ${bob.xSwayM} exceeded realistic threshold`,
    );
  }
});
