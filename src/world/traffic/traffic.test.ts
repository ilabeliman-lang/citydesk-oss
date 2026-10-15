import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateIdmAcceleration, stepVehiclePhysics } from "./idm.ts";
import { TrafficSimulator, createPrng } from "./simTraffic.ts";
import { VEHICLE_DIMENSIONS, TIER_VEHICLE_CAPS, type VehicleType } from "./types.ts";

describe("Traffic & Transit Simulation (Category 5)", () => {
  describe("IDM Physics (idm.ts)", () => {
    it("accelerates when traveling below desired speed on free road", () => {
      const accel = calculateIdmAcceleration(5.0, null, null, { desiredSpeedMps: 10.0 });
      assert.ok(accel > 0, `Expected positive acceleration, got ${accel}`);
    });

    it("decelerates when traveling above desired speed on free road", () => {
      const accel = calculateIdmAcceleration(15.0, null, null, { desiredSpeedMps: 10.0 });
      assert.ok(accel < 0, `Expected negative acceleration, got ${accel}`);
    });

    it("brakes strongly when approaching a stopped vehicle with small gap", () => {
      const accel = calculateIdmAcceleration(10.0, 0, 5.0, {
        minDistanceM: 2.0,
        safeTimeHeadwayS: 1.5,
      });
      assert.ok(accel < -1.0, `Expected significant braking, got ${accel}`);
    });

    it("integrates physics smoothly over dt", () => {
      const res = stepVehiclePhysics(10.0, 2.0, 0.5);
      assert.equal(res.v, 11.0);
      assert.equal(res.distanceM, 5.25); // (10 + 11)/2 * 0.5
    });
  });

  describe("Vehicle Types & Caps (types.ts)", () => {
    it("has valid meter dimensions for all vehicle types", () => {
      const types: VehicleType[] = ["keke", "danfo", "bus", "car", "okada"];
      for (const t of types) {
        const d = VEHICLE_DIMENSIONS[t];
        assert.ok(d.lengthM > 0, `${t} length`);
        assert.ok(d.widthM > 0, `${t} width`);
        assert.ok(d.heightM > 0, `${t} height`);
      }
    });

    it("enforces tier caps strictly (Tier A 40, Tier B 20, Tier C 0)", () => {
      assert.equal(TIER_VEHICLE_CAPS.A, 40);
      assert.equal(TIER_VEHICLE_CAPS.B, 20);
      assert.equal(TIER_VEHICLE_CAPS.C, 0);
    });
  });

  describe("TrafficSimulator (simTraffic.ts)", () => {
    it("enforces tier caps when spawning", () => {
      const sim = new TrafficSimulator({ tier: "B" });
      assert.equal(sim.getCap(), 20);

      for (let i = 0; i < 25; i++) {
        sim.spawnVehicle("keke", { lat: 21.31, lng: -157.86 }, 0);
      }
      assert.equal(sim.getVehicleCount(), 20);
    });

    it("PRNG is deterministic with identical seeds", () => {
      const rng1 = createPrng(999);
      const rng2 = createPrng(999);
      for (let i = 0; i < 5; i++) {
        assert.equal(rng1(), rng2());
      }
    });

    it("steps vehicles and moves positions", () => {
      const sim = new TrafficSimulator({ tier: "A" });
      const v = sim.spawnVehicle("car", { lat: 21.31, lng: -157.86 }, 0);
      assert.ok(v);
      const initialLat = v.pos.lat;

      sim.step(1.0); // step 1 second
      assert.ok(v.pos.lat > initialLat, "Vehicle should have moved north");
    });
  });
});
