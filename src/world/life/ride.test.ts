import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canHail,
  calculateFare,
  createTicket,
  stepRideProgress,
  interactProp,
  MAX_HAIL_SPEED_MPS,
  MAX_HAIL_DISTANCE_M,
  STALL_VOUCHER_COST,
  type RidePhase,
  type RideTicket,
  type PropKind,
  type PropInteractionResult,
} from "./ride.ts";

test("canHail: validates vehicle speed and distance limits", () => {
  // Within valid limits
  assert.equal(canHail(0, 0), true, "stopped vehicle at 0m distance can be hailed");
  assert.equal(canHail(4, 10), true, "moderate speed and distance can be hailed");
  assert.equal(
    canHail(MAX_HAIL_SPEED_MPS, MAX_HAIL_DISTANCE_M),
    true,
    "boundary values at max speed and max distance can be hailed",
  );

  // Speed exceeds limits
  assert.equal(
    canHail(MAX_HAIL_SPEED_MPS + 0.1, 5),
    false,
    "speed slightly over max speed cannot be hailed",
  );
  assert.equal(canHail(20, 2), false, "highway speed cannot be hailed");

  // Distance exceeds limits
  assert.equal(
    canHail(2, MAX_HAIL_DISTANCE_M + 0.5),
    false,
    "distance slightly beyond max distance cannot be hailed",
  );
  assert.equal(canHail(0, 50), false, "far away vehicle cannot be hailed");

  // Both speed and distance exceed limits
  assert.equal(canHail(30, 100), false, "fast and far vehicle cannot be hailed");

  // Negative and non-finite values rejected
  assert.equal(canHail(-1, 5), false, "negative speed cannot be hailed");
  assert.equal(canHail(2, -3), false, "negative distance cannot be hailed");
  assert.equal(canHail(NaN, 5), false, "NaN speed cannot be hailed");
  assert.equal(canHail(2, Infinity), false, "infinite distance cannot be hailed");
});

test("calculateFare and createTicket: fares, vehicle kinds, and ticket creation", () => {
  // calculateFare base fares
  assert.equal(calculateFare("keke", 0), 5);
  assert.equal(calculateFare("danfo", 0), 5);
  assert.equal(calculateFare("bus", 0), 8);
  assert.equal(calculateFare("car", 0), 15);
  assert.equal(calculateFare("unknown_kind", 0), 5, "defaults to base 5 for unknown kind");

  // calculateFare distance scaling
  // keke: base 5, 2 per km -> 1000m: 5 + 2 = 7; 2500m: 5 + 5 = 10
  assert.equal(calculateFare("keke", 1000), 7);
  assert.equal(calculateFare("keke", 2500), 10);
  // car: base 15, 4 per km -> 2000m: 15 + 8 = 23
  assert.equal(calculateFare("car", 2000), 23);
  // negative distance should clamp to 0 (base fare)
  assert.equal(calculateFare("keke", -100), 5);

  // createTicket with explicit fare
  const now = Date.now();
  const ticket1 = createTicket(42, "keke", 12);
  assert.equal(ticket1.vehicleId, 42);
  assert.equal(ticket1.kind, "keke");
  assert.equal(ticket1.fare, 12);
  assert.ok(ticket1.startTime >= now && ticket1.startTime <= Date.now() + 1000);
  assert.equal(ticket1.distanceM, 0);

  // createTicket with default calculated fare
  const ticket2 = createTicket(101, "bus");
  assert.equal(ticket2.vehicleId, 101);
  assert.equal(ticket2.kind, "bus");
  assert.equal(ticket2.fare, 8, "defaults to base fare of vehicle kind");
  assert.equal(ticket2.distanceM, 0);

  // createTicket across all kinds
  const kinds: Array<RideTicket["kind"]> = ["keke", "danfo", "car", "bus"];
  for (const k of kinds) {
    const t = createTicket(1, k);
    assert.equal(t.kind, k);
    assert.equal(t.fare, calculateFare(k, 0));
  }
});

test("stepRideProgress: distance accumulation and immutability", () => {
  const initialTicket = createTicket(99, "keke", 5);
  assert.equal(initialTicket.distanceM, 0);

  // Step 1: 3 seconds at 10 m/s -> +30m
  const step1 = stepRideProgress(initialTicket, 3, 10);
  assert.equal(step1.distanceM, 30);
  assert.equal(initialTicket.distanceM, 0, "original ticket remains unmodified");
  assert.equal(step1.vehicleId, 99);
  assert.equal(step1.fare, 5);
  assert.equal(step1.kind, "keke");
  assert.equal(step1.startTime, initialTicket.startTime);

  // Step 2: 2.5 seconds at 12 m/s -> +30m -> total 60m
  const step2 = stepRideProgress(step1, 2.5, 12);
  assert.equal(step2.distanceM, 60);

  // Zero or negative delta/speed doesn't add or subtract distance
  const step3 = stepRideProgress(step2, 0, 15);
  assert.equal(step3.distanceM, 60, "dt 0 adds no distance");

  const step4 = stepRideProgress(step2, 5, 0);
  assert.equal(step4.distanceM, 60, "speed 0 adds no distance");

  const step5 = stepRideProgress(step2, -2, 10);
  assert.equal(step5.distanceM, 60, "negative dt adds no distance");

  const step6 = stepRideProgress(step2, 2, -10);
  assert.equal(step6.distanceM, 60, "negative speed adds no distance");
});

test("interactProp: bench, standpipe, and stall with voucher validation", () => {
  // Bench: restores energy +25, comfort +20, free
  const benchResult: PropInteractionResult = interactProp("bench", 0);
  assert.equal(benchResult.kind, "bench");
  assert.equal(benchResult.cost, 0);
  assert.deepEqual(benchResult.deltaNeeds, { energy: 25, comfort: 20 });
  assert.ok(benchResult.message.length > 0);

  // Standpipe: restores hygiene +40, free
  const standpipeResult = interactProp("standpipe", 0);
  assert.equal(standpipeResult.kind, "standpipe");
  assert.equal(standpipeResult.cost, 0);
  assert.deepEqual(standpipeResult.deltaNeeds, { hygiene: 40 });
  assert.ok(standpipeResult.message.length > 0);

  // Stall: costs STALL_VOUCHER_COST (10) vouchers, restores hunger +40, health +10
  assert.equal(STALL_VOUCHER_COST, 10);
  // Case A: sufficient vouchers
  const stallSuccess = interactProp("stall", STALL_VOUCHER_COST);
  assert.equal(stallSuccess.kind, "stall");
  assert.equal(stallSuccess.cost, STALL_VOUCHER_COST);
  assert.deepEqual(stallSuccess.deltaNeeds, { hunger: 40, health: 10 });
  assert.ok(stallSuccess.message.length > 0);

  const stallAbundant = interactProp("stall", 100);
  assert.equal(stallAbundant.cost, 10);
  assert.deepEqual(stallAbundant.deltaNeeds, { hunger: 40, health: 10 });

  // Case B: insufficient vouchers
  const stallInsufficient = interactProp("stall", 9);
  assert.equal(stallInsufficient.kind, "stall");
  assert.equal(stallInsufficient.cost, 0);
  assert.deepEqual(stallInsufficient.deltaNeeds, {});
  assert.ok(
    stallInsufficient.message.toLowerCase().includes("insufficient") ||
      stallInsufficient.message.toLowerCase().includes("vouchers"),
  );

  const stallZero = interactProp("stall", 0);
  assert.equal(stallZero.cost, 0);
  assert.deepEqual(stallZero.deltaNeeds, {});

  const stallNegative = interactProp("stall", -5);
  assert.equal(stallNegative.cost, 0);
  assert.deepEqual(stallNegative.deltaNeeds, {});
});

test("type safety and phase coverage", () => {
  const phases: RidePhase[] = ["idle", "hailing", "boarding", "riding", "alighting"];
  assert.equal(phases.length, 5);

  const props: PropKind[] = ["bench", "standpipe", "stall"];
  assert.equal(props.length, 3);
});
