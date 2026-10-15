import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHETYPE_SPEEDS_MPS,
  TIER_CROWD_CAPS,
  type WalkerAgent,
  type WalkerArchetype,
} from "./types.ts";
import { computeSteeringForces } from "./boids.ts";
import {
  checkGreetingProximity,
  getGreetingLine,
  triggerWaveHello,
  stepInteractionTimer,
} from "./interaction.ts";

describe("Crowd & Avatar Behaviors (Category 6)", () => {
  describe("Archetypes & Speeds (types.ts)", () => {
    it("has realistic walk speeds for all archetypes", () => {
      const archetypes: WalkerArchetype[] = ["student", "worker", "shopper", "vendor", "elder"];
      for (const a of archetypes) {
        const speed = ARCHETYPE_SPEEDS_MPS[a];
        assert.ok(speed >= 0.5 && speed <= 2.0, `${a} speed ${speed} m/s out of range`);
      }
    });

    it("verifies tier crowd caps (Tier A 72, Tier B 28, Tier C 0)", () => {
      assert.equal(TIER_CROWD_CAPS.A, 72);
      assert.equal(TIER_CROWD_CAPS.B, 28);
      assert.equal(TIER_CROWD_CAPS.C, 0);
    });
  });

  describe("Social Force Steering (boids.ts)", () => {
    it("applies repulsive separation force when walkers are too close", () => {
      const agent: WalkerAgent = {
        id: "w1",
        name: "Kano",
        pos: { lat: 21.312, lng: -157.862 },
        velocity: { x: 0, y: 1 },
        headingDeg: 0,
        mood: "walking",
        archetype: "shopper",
        speedMps: 1.1,
        stamina: 100,
      };

      // Neighbor is 0.5m north of agent (inside personal space 1.2m)
      const neighbor: WalkerAgent = {
        id: "w2",
        name: "Lani",
        pos: { lat: 21.312 + 0.5 / 111139, lng: -157.862 },
        velocity: { x: 0, y: 1 },
        headingDeg: 0,
        mood: "walking",
        archetype: "worker",
        speedMps: 1.4,
        stamina: 100,
      };

      const force = computeSteeringForces(agent, [neighbor]);
      // Neighbor is north (positive Y), so separation force should push south (negative Y)
      assert.ok(force.y < 0, `Expected southward push, got ${force.y}`);
    });

    it("returns zero force when no neighbors are present", () => {
      const agent: WalkerAgent = {
        id: "w1",
        name: "Sole",
        pos: { lat: 21.312, lng: -157.862 },
        velocity: { x: 1, y: 0 },
        headingDeg: 90,
        mood: "walking",
        archetype: "student",
        speedMps: 1.5,
        stamina: 100,
      };
      const force = computeSteeringForces(agent, []);
      assert.equal(force.x, 0);
      assert.equal(force.y, 0);
    });
  });

  describe("Pedestrian Greetings & Interactions (interaction.ts)", () => {
    it("triggers greeting within proximity distance", () => {
      const agent: WalkerAgent = {
        id: "w1",
        name: "Koa",
        pos: { lat: 21.312, lng: -157.862 },
        velocity: { x: 0, y: 0 },
        headingDeg: 0,
        mood: "walking",
        archetype: "shopper",
        speedMps: 1.1,
        stamina: 100,
      };
      const playerPos = { lat: 21.312 + 2.0 / 111139, lng: -157.862 }; // ~2m away
      const res = checkGreetingProximity(agent, playerPos, 4.0);
      assert.equal(res.shouldGreet, true);
      assert.ok(res.distanceM <= 4.0);
    });

    it("returns cultural greeting lines for Honolulu and Port Harcourt", () => {
      const gHono = getGreetingLine("honolulu", 0);
      assert.equal(gHono, "Aloha!");
      const gPH = getGreetingLine("portharcourt", 0);
      assert.equal(gPH, "How far!");
    });

    it("transitions waving mood and restores walking after timer expires", () => {
      const agent: WalkerAgent = {
        id: "w1",
        name: "Ngozi",
        pos: { lat: 21.312, lng: -157.862 },
        velocity: { x: 0, y: 0 },
        headingDeg: 0,
        mood: "walking",
        archetype: "vendor",
        speedMps: 0.9,
        stamina: 100,
      };

      triggerWaveHello(agent, 2.0);
      assert.equal(agent.mood, "waving");
      assert.equal(agent.waveTimerSeconds, 2.0);

      stepInteractionTimer(agent, 1.0);
      assert.equal(agent.mood, "waving");

      stepInteractionTimer(agent, 1.5);
      assert.equal(agent.mood, "walking");
      assert.equal(agent.waveTimerSeconds, 0);
    });
  });
});
