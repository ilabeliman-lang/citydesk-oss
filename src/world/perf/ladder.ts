/**
 * NDU-UPG 503 (pure part): the bible's degrade order, one rung at a time:
 *   1 SSAO -> 2 bloom -> 3 extrusion distance -> 4 skinned count -> Tier C if fps < 20 for 10 s.
 * Names, ticks and the phone UI are never touched. Fed one fps sample per second; unit tested.
 * No runtime imports (node --experimental-strip-types tests it directly).
 */
export const LADDER = ["ssao", "bloom", "extrusion", "skinned", "tierC"] as const;
export type Rung = (typeof LADDER)[number];

export type LadderOpts = {
  /** Below this a rung is dropped every `stepAfterMs` (bible: Tier A/B >= 30 fps). */
  target: number;
  /** Below this for `tierCAfterMs` the session goes to Tier C. */
  floor: number;
  stepAfterMs: number;
  tierCAfterMs: number;
  allowTierC: boolean;
};

export const LADDER_DEFAULTS: LadderOpts = { target: 30, floor: 20, stepAfterMs: 5000, tierCAfterMs: 10000, allowTierC: true };

export type LadderState = {
  /** Rungs already dropped (0..4); Tier C is tracked separately. */
  step: number;
  tierC: boolean;
  lowSince: number | null;
  veryLowSince: number | null;
  lastStepAt: number;
};

export const LADDER_START: LadderState = { step: 0, tierC: false, lowSince: null, veryLowSince: null, lastStepAt: -Infinity };

export function ladderTick(
  s: LadderState,
  fps: number,
  now: number,
  o: LadderOpts = LADDER_DEFAULTS,
): { state: LadderState; dropped: Rung | null } {
  if (s.tierC) return { state: s, dropped: null };
  const next = { ...s };
  if (fps < o.floor) {
    next.veryLowSince ??= now;
    if (o.allowTierC && now - next.veryLowSince >= o.tierCAfterMs) {
      next.tierC = true;
      return { state: next, dropped: "tierC" };
    }
  } else {
    next.veryLowSince = null;
  }
  if (fps < o.target) {
    next.lowSince ??= now;
    if (next.step < 4 && now - next.lowSince >= o.stepAfterMs && now - next.lastStepAt >= o.stepAfterMs) {
      next.step += 1;
      next.lastStepAt = now;
      next.lowSince = now;
      return { state: next, dropped: LADDER[next.step - 1] };
    }
  } else {
    next.lowSince = null;
  }
  return { state: next, dropped: null };
}

/** Bible budgets per tier. A/B extrusion limits are for Three buildings; MapLibre extrusion is cut only on rung 3 / Tier C. */
export const EXTRUSION_M = { A: 500, B: 250, C: 400 } as const;
export const SKINNED_MAX = { A: 40, B: 25, C: 0 } as const;

export type Quality = {
  tier: "A" | "B" | "C";
  ssao: boolean;
  bloom: boolean;
  /** Metres of extruded buildings for Three-drawn buildings (bible #508). */
  extrusionM: number;
  /** MapLibre fill-extrusion distance cap in metres, or null = unlimited (today's look). */
  mapExtrusionM: number | null;
  skinned: number;
  step: number;
};

export function quality(tier: "A" | "B" | "C", step: number, reducedMotion: boolean): Quality {
  const c = tier === "C";
  return {
    tier,
    ssao: tier === "A" && step < 1,
    bloom: tier === "A" && step < 2 && !reducedMotion,
    extrusionM: EXTRUSION_M[tier],
    mapExtrusionM: c ? EXTRUSION_M.C : step >= 3 ? EXTRUSION_M[tier] : null,
    skinned: c ? 0 : step >= 4 ? Math.floor(SKINNED_MAX[tier] / 2) : SKINNED_MAX[tier],
    step,
  };
}
