// NDU-UPG 502/503/504, Categories 11 & 21: run by scripts/perf-budget.test.mjs (node --experimental-strip-types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTier, lowerTier, type TierSignals } from "./tier.ts";
import { LADDER_START, ladderTick, quality, type LadderState } from "./ladder.ts";
import {
  PERF_BUDGETS,
  getPerfBudget,
  checkRenderBudget,
  isDroppedFrame,
  FrameTelemetryAccumulator,
  createFrameTelemetryAccumulator,
} from "./perfBudgets.ts";
import {
  TIER_PROFILES,
  getTierProfile,
  degradeTick,
  createDegradeLadderState,
  DegradeStateMachine,
} from "./degradeLadder.ts";

const base: TierSignals = { webgl: true, renderer: "", memoryGb: null, cores: null, mobile: false, fps: null, saveData: false };

test("tiers from startup signals", () => {
  assert.equal(classifyTier({ ...base, webgl: false }).tier, "C");
  assert.equal(classifyTier({ ...base, renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))" }).tier, "C");
  assert.equal(classifyTier({ ...base, mobile: true, renderer: "Mali-T720", memoryGb: 2 }).tier, "C");
  assert.equal(classifyTier({ ...base, mobile: true, renderer: "Adreno (TM) 610", memoryGb: 4, cores: 8 }).tier, "B");
  assert.equal(classifyTier({ ...base, mobile: true, renderer: "Apple GPU" }).tier, "B");
  assert.equal(classifyTier({ ...base, mobile: true, renderer: "Adreno (TM) 740", memoryGb: 8, cores: 8 }).tier, "A");
  assert.equal(classifyTier({ ...base, renderer: "ANGLE (NVIDIA GeForce RTX 3060)", cores: 12, memoryGb: 8 }).tier, "A");
  assert.equal(classifyTier({ ...base, renderer: "ANGLE (NVIDIA GeForce RTX 3060)", fps: 18 }).tier, "C");
  assert.equal(classifyTier({ ...base, renderer: "ANGLE (NVIDIA GeForce RTX 3060)", fps: 35 }).tier, "B");
  assert.equal(classifyTier({ ...base, mobile: true, renderer: "Adreno (TM) 740", memoryGb: 8, saveData: true }).tier, "B");
  assert.equal(lowerTier("A", "C"), "C");
  assert.equal(lowerTier("B", "A"), "B");
});

const run = (samples: number[]) => {
  let s: LadderState = LADDER_START;
  const dropped: string[] = [];
  samples.forEach((fps, i) => {
    const r = ladderTick(s, fps, i * 1000);
    s = r.state;
    if (r.dropped) dropped.push(`${r.dropped}@${i}s`);
  });
  return { s, dropped };
};

test("degrade ladder keeps the bible order and reaches Tier C after 10 s under 20 fps", () => {
  const { s, dropped } = run(Array(12).fill(15));
  assert.deepEqual(dropped, ["ssao@5s", "tierC@10s"]);
  assert.equal(s.tierC, true);
});

test("25 fps walks every rung but never Tier C", () => {
  const { s, dropped } = run(Array(40).fill(25));
  assert.deepEqual(dropped, ["ssao@5s", "bloom@10s", "extrusion@15s", "skinned@20s"]);
  assert.equal(s.tierC, false);
});

test("recovery resets the low window; 60 fps never degrades", () => {
  assert.deepEqual(run([25, 25, 25, 25, 60, 25, 25, 25, 25, 60]).dropped, []);
  assert.deepEqual(run(Array(30).fill(60)).dropped, []);
});

test("quality per tier and rung", () => {
  assert.equal(quality("A", 0, false).bloom, true);
  assert.equal(quality("A", 0, true).bloom, false); // reduced motion kills bloom
  assert.equal(quality("A", 1, false).ssao, false);
  assert.equal(quality("B", 0, false).mapExtrusionM, null);
  assert.equal(quality("B", 3, false).mapExtrusionM, 250);
  assert.equal(quality("C", 0, false).mapExtrusionM, 400);
  assert.equal(quality("C", 0, false).skinned, 0);
  assert.equal(quality("B", 4, false).skinned, 12);
});

// ============================================================================
// Categories 11 & 21: Mobile Performance Budgets & Drop Frame Detector Tests
// ============================================================================

test("performance budgets match tier specifications", () => {
  // Tier A: draw calls: 80, triangles: 200k, 60fps, 16.6ms max jitter
  assert.equal(PERF_BUDGETS.A.drawCalls, 80);
  assert.equal(PERF_BUDGETS.A.triangles, 200_000);
  assert.equal(PERF_BUDGETS.A.targetFps, 60);
  assert.equal(PERF_BUDGETS.A.maxFrameTimeJitterMs, 16.6);

  // Tier B: draw calls: 40, triangles: 80k, 30fps, 33.3ms max jitter
  assert.equal(PERF_BUDGETS.B.drawCalls, 40);
  assert.equal(PERF_BUDGETS.B.triangles, 80_000);
  assert.equal(PERF_BUDGETS.B.targetFps, 30);
  assert.equal(PERF_BUDGETS.B.maxFrameTimeJitterMs, 33.3);

  // Tier C: draw calls: 20, triangles: 20k, 30fps, 33.3ms max jitter
  assert.equal(PERF_BUDGETS.C.drawCalls, 20);
  assert.equal(PERF_BUDGETS.C.triangles, 20_000);
  assert.equal(PERF_BUDGETS.C.targetFps, 30);
  assert.equal(PERF_BUDGETS.C.maxFrameTimeJitterMs, 33.3);

  assert.deepEqual(getPerfBudget("A"), PERF_BUDGETS.A);
  assert.deepEqual(getPerfBudget("B"), PERF_BUDGETS.B);
  assert.deepEqual(getPerfBudget("C"), PERF_BUDGETS.C);
});

test("checkRenderBudget validates within budget and flags violations", () => {
  // Tier A within budget
  const passA = checkRenderBudget({ drawCalls: 75, triangles: 180_000 }, "A");
  assert.equal(passA.withinBudget, true);
  assert.equal(passA.violations.length, 0);
  assert.equal(passA.drawCalls.exceeded, false);
  assert.equal(passA.triangles.exceeded, false);

  // Tier A exceeding draw calls
  const failDrawCalls = checkRenderBudget({ drawCalls: 85, triangles: 150_000 }, "A");
  assert.equal(failDrawCalls.withinBudget, false);
  assert.equal(failDrawCalls.violations.length, 1);
  assert.equal(failDrawCalls.violations[0].metric, "drawCalls");
  assert.equal(failDrawCalls.drawCalls.exceeded, true);
  assert.equal(failDrawCalls.triangles.exceeded, false);

  // Tier B exceeding triangles
  const failTriangles = checkRenderBudget({ drawCalls: 35, triangles: 95_000 }, "B");
  assert.equal(failTriangles.withinBudget, false);
  assert.equal(failTriangles.violations.length, 1);
  assert.equal(failTriangles.violations[0].metric, "triangles");
  assert.equal(failTriangles.drawCalls.exceeded, false);
  assert.equal(failTriangles.triangles.exceeded, true);

  // Tier C exceeding both
  const failBoth = checkRenderBudget({ drawCalls: 25, triangles: 25_000 }, "C");
  assert.equal(failBoth.withinBudget, false);
  assert.equal(failBoth.violations.length, 2);
  assert.equal(failBoth.drawCalls.exceeded, true);
  assert.equal(failBoth.triangles.exceeded, true);
});

test("isDroppedFrame detects frame drops based on tier target FPS and jitter threshold", () => {
  // Tier A (60fps, expected ~16.67ms, jitter 16.6ms -> threshold ~33.27ms)
  assert.equal(isDroppedFrame(16.6, "A"), false);
  assert.equal(isDroppedFrame(30.0, "A"), false);
  assert.equal(isDroppedFrame(33.5, "A"), true);
  assert.equal(isDroppedFrame(45.0, "A"), true);

  // Tier B (30fps, expected ~33.33ms, jitter 33.3ms -> threshold ~66.63ms)
  assert.equal(isDroppedFrame(33.3, "B"), false);
  assert.equal(isDroppedFrame(60.0, "B"), false);
  assert.equal(isDroppedFrame(67.0, "B"), true);
  assert.equal(isDroppedFrame(100.0, "B"), true);

  // Target FPS numeric override
  assert.equal(isDroppedFrame(15.0, 60), false);
  assert.equal(isDroppedFrame(35.0, 60), true);
});

// ============================================================================
// Real-time Frame Telemetry Accumulator & Rolling Averages Tests
// ============================================================================

test("FrameTelemetryAccumulator calculates rolling average frame duration and FPS", () => {
  const acc = new FrameTelemetryAccumulator({ windowSize: 5, tier: "A" });

  // Add 5 frames of 16.66ms each (~60 FPS)
  for (let i = 0; i < 5; i++) {
    acc.recordFrame(16.666, i * 16.666);
  }

  assert.equal(acc.getSampleCount(), 5);
  assert.ok(Math.abs(acc.getAverageFrameDuration() - 16.666) < 0.001);
  assert.ok(Math.abs(acc.getRollingFps() - 60) < 0.1);

  // Now push 5 frames of 33.333ms each (~30 FPS), window will shift out old frames
  for (let i = 5; i < 10; i++) {
    acc.recordFrame(33.333, i * 33.333);
  }

  assert.equal(acc.getSampleCount(), 5); // Window bounded at 5
  assert.ok(Math.abs(acc.getAverageFrameDuration() - 33.333) < 0.001);
  assert.ok(Math.abs(acc.getRollingFps() - 30) < 0.1);
});

test("FrameTelemetryAccumulator detects dropped frames, jitter, and generates snapshot", () => {
  const acc = createFrameTelemetryAccumulator({ windowSize: 10, tier: "A" });

  // Record normal frames followed by a dropped frame (> 33.27ms)
  acc.recordFrame(16.6, 0);
  acc.recordFrame(16.7, 16.7);
  acc.recordFrame(16.5, 33.2);
  const dropped = acc.recordFrame(40.0, 73.2);

  assert.equal(dropped.dropped, true);
  assert.equal(acc.getDroppedFramesCount(), 1);
  assert.equal(acc.getTotalDroppedFrames(), 1);
  assert.equal(acc.getConsecutiveDroppedFrames(), 1);

  // Another good frame resets consecutive dropped
  acc.recordFrame(16.6, 89.8);
  assert.equal(acc.getConsecutiveDroppedFrames(), 0);
  assert.equal(acc.getTotalDroppedFrames(), 1);

  // Check jitter tracking: jump from 16.5 to 40.0 is ~23.5ms jitter, exceeding 16.6ms threshold
  assert.ok(acc.getMaxJitter() >= 23.4);
  assert.equal(acc.isJitterExceeded(), true);

  // Telemetry snapshot
  const snapshot = acc.getSnapshot();
  assert.equal(snapshot.tier, "A");
  assert.equal(snapshot.targetFps, 60);
  assert.equal(snapshot.windowDroppedFramesCount, 1);
  assert.equal(snapshot.totalDroppedFramesCount, 1);
  assert.equal(snapshot.isJitterExceeded, true);
  assert.ok(snapshot.dropFrameRate > 0);

  // Reset
  acc.reset();
  assert.equal(acc.getSampleCount(), 0);
  assert.equal(acc.getAverageFrameDuration(), 0);
  assert.equal(acc.getRollingFps(), 0);
  assert.equal(acc.getDroppedFramesCount(), 0);
  assert.equal(acc.getTotalDroppedFrames(), 0);
});

// ============================================================================
// Categories 11 & 21: Degrade Ladder & State Machine Transitions Tests
// ============================================================================

test("tier profiles define expected rendering features per tier", () => {
  // Tier A: full 3D, reflections, 60fps, shadows, particles
  const a = getTierProfile("A");
  assert.equal(a.renderingMode, "full_3d");
  assert.equal(a.reflections, true);
  assert.equal(a.targetFps, 60);
  assert.equal(a.shadows, true);
  assert.equal(a.particles, true);
  assert.equal(a.crowdDensity, 1.0);
  assert.equal(a.trafficDensity, 1.0);
  assert.equal(a.lighting, "full");
  assert.equal(a.isFull3D, true);
  assert.equal(a.is2DExtrudedFallback, false);

  // Tier B: simplified lighting, halved crowd/traffic, no shadows, 30fps cap
  const b = getTierProfile("B");
  assert.equal(b.renderingMode, "simplified_3d");
  assert.equal(b.reflections, false);
  assert.equal(b.targetFps, 30);
  assert.equal(b.shadows, false);
  assert.equal(b.particles, false);
  assert.equal(b.crowdDensity, 0.5);
  assert.equal(b.trafficDensity, 0.5);
  assert.equal(b.lighting, "simplified");
  assert.equal(b.isFull3D, false);
  assert.equal(b.is2DExtrudedFallback, false);

  // Tier C: 2D extruded fallback, zero particles, zero 3D traffic
  const c = getTierProfile("C");
  assert.equal(c.renderingMode, "2d_extruded");
  assert.equal(c.reflections, false);
  assert.equal(c.targetFps, 30);
  assert.equal(c.shadows, false);
  assert.equal(c.particles, false);
  assert.equal(c.crowdDensity, 0.0);
  assert.equal(c.trafficDensity, 0.0);
  assert.equal(c.lighting, "basic");
  assert.equal(c.isFull3D, false);
  assert.equal(c.is2DExtrudedFallback, true);
});

test("degrade ladder transitions from Tier A -> B -> C upon consecutive sustained low FPS (< 24 FPS for 3s)", () => {
  const machine = new DegradeStateMachine("A", {
    degradeFpsThreshold: 24,
    degradeSustainedMs: 3000,
    transitionCooldownMs: 1000,
  });

  // 1s and 2s under 24 FPS: no degradation yet
  let res = machine.tick(20, 1000);
  assert.equal(res.transitioned, false);
  assert.equal(machine.getTier(), "A");

  res = machine.tick(20, 2000);
  assert.equal(res.transitioned, false);
  assert.equal(machine.getTier(), "A");

  // 3s reached (low since 1000ms -> duration 3000ms at 4000ms): degrades to Tier B
  res = machine.tick(20, 4000);
  assert.equal(res.transitioned, true);
  assert.equal(res.direction, "degrade");
  assert.equal(res.previousTier, "A");
  assert.equal(res.currentTier, "B");
  assert.equal(machine.getTier(), "B");

  // Wait past cooldown (cooldown is 1000ms), now continue low FPS for another 3s
  machine.tick(18, 5500); // starts lowFpsSince at 5500
  machine.tick(18, 6500);
  machine.tick(18, 7500);
  res = machine.tick(18, 8500); // 3000ms elapsed -> degrades to Tier C
  assert.equal(res.transitioned, true);
  assert.equal(res.direction, "degrade");
  assert.equal(res.previousTier, "B");
  assert.equal(res.currentTier, "C");
  assert.equal(machine.getTier(), "C");

  // Further low FPS at Tier C does not degrade further
  res = machine.tick(15, 12000);
  assert.equal(res.transitioned, false);
  assert.equal(machine.getTier(), "C");
});

test("recovery ladder promotes Tier C -> B -> A only after sustained stability", () => {
  const machine = new DegradeStateMachine("C", {
    recoveryFpsCtoB: 28,
    recoveryFpsBtoA: 55,
    recoverySustainedMs: 5000,
    transitionCooldownMs: 1000,
  });

  // Sustained 30 FPS at Tier C for 4 seconds: not yet recovered
  machine.tick(30, 1000); // stable since 1000
  machine.tick(30, 2000);
  machine.tick(30, 3000);
  let res = machine.tick(30, 5000); // 4000ms < 5000ms
  assert.equal(res.transitioned, false);
  assert.equal(machine.getTier(), "C");

  // At 6000ms (5000ms sustained >= 28 FPS): promotes to Tier B
  res = machine.tick(30, 6000);
  assert.equal(res.transitioned, true);
  assert.equal(res.direction, "recover");
  assert.equal(res.previousTier, "C");
  assert.equal(res.currentTier, "B");
  assert.equal(machine.getTier(), "B");

  // Sustained 58 FPS at Tier B for 5 seconds promotes to Tier A
  machine.tick(58, 7500); // after cooldown, stable since 7500
  machine.tick(58, 9500);
  machine.tick(58, 11500);
  res = machine.tick(58, 12500); // 5000ms sustained >= 55 FPS
  assert.equal(res.transitioned, true);
  assert.equal(res.direction, "recover");
  assert.equal(res.previousTier, "B");
  assert.equal(res.currentTier, "A");
  assert.equal(machine.getTier(), "A");
});

// ============================================================================
// Hysteresis Protection Against Flickering Tiers Tests
// ============================================================================

test("hysteresis: FPS oscillating around 24 FPS resets degradation timer and prevents tier flapping", () => {
  const machine = new DegradeStateMachine("A", {
    degradeFpsThreshold: 24,
    degradeSustainedMs: 3000,
  });

  // 2s below 24 FPS
  machine.tick(20, 1000);
  machine.tick(20, 2000);

  // 1s spike to 26 FPS (above 24 FPS threshold) -> resets lowFpsSince
  let res = machine.tick(26, 3000);
  assert.equal(res.transitioned, false);
  assert.equal(machine.getTier(), "A");

  // Another 2s below 24 FPS (timer restarted from scratch at 4000)
  machine.tick(20, 4000);
  res = machine.tick(20, 5000);
  assert.equal(res.transitioned, false);
  assert.equal(machine.getTier(), "A"); // Still Tier A! No flickering!
});

test("hysteresis: deadband between 24 FPS and 55 FPS prevents flickering at Tier B", () => {
  const machine = new DegradeStateMachine("B", {
    degradeFpsThreshold: 24,
    recoveryFpsBtoA: 55,
    degradeSustainedMs: 3000,
    recoverySustainedMs: 5000,
  });

  // FPS hovering between 30 and 45 FPS (deadband range)
  // Does not degrade because >= 24; does not recover because < 55
  for (let i = 1; i <= 10; i++) {
    const fps = 30 + (i % 10);
    const res = machine.tick(fps, i * 1000);
    assert.equal(res.transitioned, false);
    assert.equal(machine.getTier(), "B");
  }
});

test("hysteresis: brief FPS spike does not prematurely promote tier without sustained stability", () => {
  const machine = new DegradeStateMachine("B", {
    recoveryFpsBtoA: 55,
    recoverySustainedMs: 5000,
  });

  // 2s spike of 60 FPS
  machine.tick(60, 1000);
  machine.tick(60, 2000);

  // Dips back down to 40 FPS before 5s required stability elapsed
  const dip = machine.tick(40, 3000);
  assert.equal(dip.transitioned, false);
  assert.equal(machine.getTier(), "B");

  // Later 60 FPS starts timer over again
  machine.tick(60, 4000);
  const stillB = machine.tick(60, 6000); // only 2s elapsed since 4000
  assert.equal(stillB.transitioned, false);
  assert.equal(machine.getTier(), "B");
});

test("hysteresis: transition cooldown prevents immediate re-transition", () => {
  const state = createDegradeLadderState("A", 0);
  // Configure cooldown to 5000ms
  const config = {
    degradeFpsThreshold: 24,
    degradeSustainedMs: 1000,
    transitionCooldownMs: 5000,
  };

  // Start low FPS at 1000ms, then at 2000ms (1000ms sustained) degrades to B
  state.lastTransitionAt = -Infinity;
  const tick1 = degradeTick(state, 20, 1000, config);
  assert.equal(tick1.transitioned, false);

  const step1 = degradeTick(tick1.state, 20, 2000, config);
  assert.equal(step1.transitioned, true);
  assert.equal(step1.currentTier, "B");
  assert.equal(step1.state.lastTransitionAt, 2000);

  // Low FPS continues at 3000ms and 4500ms (more than 1000ms low, but within 5000ms cooldown)
  const tick2 = degradeTick(step1.state, 20, 3000, config);
  assert.equal(tick2.transitioned, false);
  const step2 = degradeTick(tick2.state, 20, 4500, config);
  assert.equal(step2.transitioned, false);
  assert.equal(step2.currentTier, "B"); // Protected by cooldown

  // Once cooldown has passed (at 7500ms, which is > 5000ms since 2000ms) and low for 1000ms, degrades to C
  const tick3 = degradeTick(step2.state, 20, 6000, config);
  const step3 = degradeTick(tick3.state, 20, 7500, config);
  assert.equal(step3.transitioned, true);
  assert.equal(step3.currentTier, "C");
});
