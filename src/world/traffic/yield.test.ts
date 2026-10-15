import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldHold } from "./yield.ts";
import { TrafficSimulator } from "./simTraffic.ts";

describe("yield (avatar lane + signal phase)", () => {
  it("holds on red and amber regardless of lane", () => {
    assert.equal(shouldHold(0, "red", 1), true);
    assert.equal(shouldHold(null, "red", null), true);
    assert.equal(shouldHold(2, "amber", 2), true);
    assert.equal(shouldHold(null, "amber", 0), true);
  });

  it("proceeds on green unless the avatar is in the same lane", () => {
    assert.equal(shouldHold(0, "green", 1), false);
    assert.equal(shouldHold(null, "green", 1), false);
    assert.equal(shouldHold(0, "green"), false);
    assert.equal(shouldHold(3, "green", 3), true);
  });

  it("vehicle holds on red and moves on green when the avatar is in another lane", () => {
    const sim = new TrafficSimulator({ tier: "A", seed: 7 });
    const v = sim.spawnVehicle("car", { lat: 21.31, lng: -157.86 }, 0, "yield-car");
    assert.ok(v);
    v.laneIndex = 1;
    const origin = v.pos.lat;

    sim.step(1, { avatarLane: 0, phase: "red" });
    assert.equal(v.speedMps, 0, "red: vehicle speed is held at 0");
    assert.equal(v.pos.lat, origin, "red: vehicle does not advance");

    sim.step(1, { avatarLane: 0, phase: "green" });
    assert.ok(v.speedMps > 0, `green, other lane: vehicle rolls, speed=${v.speedMps}`);
    assert.ok(v.pos.lat > origin, "green, other lane: vehicle advances");
  });

  it("vehicle holds on green when the avatar shares its lane", () => {
    const sim = new TrafficSimulator({ tier: "A", seed: 7 });
    const v = sim.spawnVehicle("keke", { lat: 21.31, lng: -157.86 }, 0, "yield-keke");
    assert.ok(v);
    v.laneIndex = 2;
    const origin = v.pos.lat;

    sim.step(1, { avatarLane: 2, phase: "green" });
    assert.equal(v.speedMps, 0, "green, same lane: yield to the avatar");
    assert.equal(v.pos.lat, origin, "green, same lane: vehicle does not advance");
  });
});
