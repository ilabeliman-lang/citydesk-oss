/**
 * NDU Degrade Ladder & State Machine (Categories 11 & 21, items 501–550, 971–1000).
 *
 * Automatic graceful degradation state machine:
 * - Tier A: Full 3D, reflections, 60fps, shadows, particles.
 * - Tier B: Simplified lighting, halved crowd/traffic, no shadows, 30fps cap.
 * - Tier C: 2D extruded fallback, zero particles, zero 3D traffic.
 *
 * Trigger logic:
 * - Degrades upon consecutive sustained frame drops (e.g. 3 consecutive seconds below 24 FPS).
 * - Recovery ladder logic promotes back up only after sustained stability (e.g. 5 seconds sustained stable FPS).
 * - Hysteresis protection: asymmetric thresholds, minimum cooldowns, and sustained time requirements
 *   prevent tier flickering/flapping.
 *
 * Pure math and Node 22 built-ins (zero runtime dependencies, runs under --experimental-strip-types).
 */

import type { Tier } from "./tier.ts";

export interface TierProfile {
  readonly tier: Tier;
  readonly renderingMode: "full_3d" | "simplified_3d" | "2d_extruded";
  readonly targetFps: number;
  readonly shadows: boolean;
  readonly reflections: boolean;
  readonly particles: boolean;
  readonly crowdDensity: number;
  readonly trafficDensity: number;
  readonly lighting: "full" | "simplified" | "basic";
  readonly isFull3D: boolean;
  readonly is2DExtrudedFallback: boolean;
}

export const TIER_PROFILES: Record<Tier, TierProfile> = {
  A: {
    tier: "A",
    renderingMode: "full_3d",
    targetFps: 60,
    shadows: true,
    reflections: true,
    particles: true,
    crowdDensity: 1.0,
    trafficDensity: 1.0,
    lighting: "full",
    isFull3D: true,
    is2DExtrudedFallback: false,
  },
  B: {
    tier: "B",
    renderingMode: "simplified_3d",
    targetFps: 30,
    shadows: false,
    reflections: false,
    particles: false,
    crowdDensity: 0.5,
    trafficDensity: 0.5,
    lighting: "simplified",
    isFull3D: false,
    is2DExtrudedFallback: false,
  },
  C: {
    tier: "C",
    renderingMode: "2d_extruded",
    targetFps: 30,
    shadows: false,
    reflections: false,
    particles: false,
    crowdDensity: 0.0,
    trafficDensity: 0.0,
    lighting: "basic",
    isFull3D: false,
    is2DExtrudedFallback: true,
  },
} as const;

export function getTierProfile(tier: Tier): TierProfile {
  return TIER_PROFILES[tier];
}

export interface DegradeLadderConfig {
  /** FPS below which degradation timer starts (default: 24) */
  degradeFpsThreshold: number;
  /** Consecutive duration in ms below threshold before degradation occurs (default: 3000 ms) */
  degradeSustainedMs: number;
  /** Minimum FPS required to recover from C to B (default: 28) */
  recoveryFpsCtoB: number;
  /** Minimum FPS required to recover from B to A (default: 55) */
  recoveryFpsBtoA: number;
  /** Consecutive duration in ms of sustained stability before recovery occurs (default: 5000 ms) */
  recoverySustainedMs: number;
  /** Minimum cooldown in ms between any tier transitions to prevent flapping (default: 2000 ms) */
  transitionCooldownMs: number;
}

export const DEFAULT_DEGRADE_CONFIG: DegradeLadderConfig = {
  degradeFpsThreshold: 24,
  degradeSustainedMs: 3000,
  recoveryFpsCtoB: 28,
  recoveryFpsBtoA: 55,
  recoverySustainedMs: 5000,
  transitionCooldownMs: 2000,
};

export interface TierTransitionRecord {
  readonly timestamp: number;
  readonly from: Tier;
  readonly to: Tier;
  readonly reason: string;
}

export interface DegradeLadderState {
  tier: Tier;
  lastTransitionAt: number;
  lowFpsSince: number | null;
  stableFpsSince: number | null;
  history: TierTransitionRecord[];
}

export function createDegradeLadderState(initialTier: Tier = "A", initialTimeMs: number = 0): DegradeLadderState {
  return {
    tier: initialTier,
    lastTransitionAt: -Infinity,
    lowFpsSince: null,
    stableFpsSince: null,
    history: [
      {
        timestamp: initialTimeMs,
        from: initialTier,
        to: initialTier,
        reason: "initial",
      },
    ],
  };
}

export interface DegradeTransitionResult {
  previousTier: Tier;
  currentTier: Tier;
  transitioned: boolean;
  direction: "degrade" | "recover" | "none";
  reason: string | null;
  state: DegradeLadderState;
}

/**
 * Pure transition step for the degrade ladder.
 * Given the current state, an FPS sample, and the current timestamp,
 * calculates the next state and whether a degradation or recovery transition occurred.
 */
export function degradeTick(
  state: DegradeLadderState,
  fps: number,
  nowMs: number,
  customConfig?: Partial<DegradeLadderConfig>,
): DegradeTransitionResult {
  const config: DegradeLadderConfig = { ...DEFAULT_DEGRADE_CONFIG, ...customConfig };
  const currentTier = state.tier;
  const nextState: DegradeLadderState = {
    ...state,
    history: [...state.history],
  };

  const timeSinceLastTransition = nowMs - state.lastTransitionAt;
  const isCooldownActive = timeSinceLastTransition < config.transitionCooldownMs;

  // 1. Degradation check (FPS below degrade threshold)
  if (fps < config.degradeFpsThreshold) {
    // Break any pending recovery
    nextState.stableFpsSince = null;

    if (nextState.lowFpsSince === null) {
      nextState.lowFpsSince = nowMs;
    }

    const lowDuration = nowMs - nextState.lowFpsSince;
    if (lowDuration >= config.degradeSustainedMs && !isCooldownActive) {
      let targetTier: Tier | null = null;
      if (currentTier === "A") {
        targetTier = "B";
      } else if (currentTier === "B") {
        targetTier = "C";
      }

      if (targetTier && targetTier !== currentTier) {
        const reason = `sustained low FPS (${Math.round(fps)} < ${config.degradeFpsThreshold}) for ${lowDuration}ms`;
        nextState.tier = targetTier;
        nextState.lastTransitionAt = nowMs;
        nextState.lowFpsSince = null;
        nextState.stableFpsSince = null;
        nextState.history.push({
          timestamp: nowMs,
          from: currentTier,
          to: targetTier,
          reason,
        });

        return {
          previousTier: currentTier,
          currentTier: targetTier,
          transitioned: true,
          direction: "degrade",
          reason,
          state: nextState,
        };
      }
    }
  } else {
    // Reset degradation timer if FPS is at or above degradation threshold
    nextState.lowFpsSince = null;
  }

  // 2. Recovery check (FPS meets tier recovery threshold)
  let requiredRecoveryFps: number | null = null;
  let targetRecoveryTier: Tier | null = null;

  if (currentTier === "C") {
    requiredRecoveryFps = config.recoveryFpsCtoB;
    targetRecoveryTier = "B";
  } else if (currentTier === "B") {
    requiredRecoveryFps = config.recoveryFpsBtoA;
    targetRecoveryTier = "A";
  }

  if (requiredRecoveryFps !== null && targetRecoveryTier !== null && fps >= requiredRecoveryFps) {
    if (nextState.stableFpsSince === null) {
      nextState.stableFpsSince = nowMs;
    }

    const stableDuration = nowMs - nextState.stableFpsSince;
    if (stableDuration >= config.recoverySustainedMs && !isCooldownActive) {
      const reason = `sustained stable FPS (${Math.round(fps)} >= ${requiredRecoveryFps}) for ${stableDuration}ms`;
      nextState.tier = targetRecoveryTier;
      nextState.lastTransitionAt = nowMs;
      nextState.stableFpsSince = null;
      nextState.lowFpsSince = null;
      nextState.history.push({
        timestamp: nowMs,
        from: currentTier,
        to: targetRecoveryTier,
        reason,
      });

      return {
        previousTier: currentTier,
        currentTier: targetRecoveryTier,
        transitioned: true,
        direction: "recover",
        reason,
        state: nextState,
      };
    }
  } else {
    // Reset recovery timer if FPS drops below recovery threshold
    nextState.stableFpsSince = null;
  }

  return {
    previousTier: currentTier,
    currentTier: nextState.tier,
    transitioned: false,
    direction: "none",
    reason: null,
    state: nextState,
  };
}

/**
 * State machine managing automatic graceful degradation and recovery.
 */
export class DegradeStateMachine {
  private state: DegradeLadderState;
  private config: DegradeLadderConfig;

  constructor(
    initialTier: Tier = "A",
    config?: Partial<DegradeLadderConfig>,
    initialTimeMs: number = 0,
  ) {
    this.config = { ...DEFAULT_DEGRADE_CONFIG, ...config };
    this.state = createDegradeLadderState(initialTier, initialTimeMs);
  }

  public tick(fps: number, nowMs: number): DegradeTransitionResult {
    const result = degradeTick(this.state, fps, nowMs, this.config);
    this.state = result.state;
    return result;
  }

  public getTier(): Tier {
    return this.state.tier;
  }

  public getProfile(): TierProfile {
    return getTierProfile(this.state.tier);
  }

  public getState(): Readonly<DegradeLadderState> {
    return this.state;
  }

  public getConfig(): Readonly<DegradeLadderConfig> {
    return this.config;
  }

  public setConfig(customConfig: Partial<DegradeLadderConfig>): void {
    this.config = { ...this.config, ...customConfig };
  }

  public forceTier(tier: Tier, reason: string = "manual", nowMs: number = 0): void {
    const prev = this.state.tier;
    this.state = {
      ...this.state,
      tier,
      lastTransitionAt: nowMs,
      lowFpsSince: null,
      stableFpsSince: null,
      history: [
        ...this.state.history,
        {
          timestamp: nowMs,
          from: prev,
          to: tier,
          reason,
        },
      ],
    };
  }

  public reset(tier: Tier = "A", nowMs: number = 0): void {
    this.state = createDegradeLadderState(tier, nowMs);
  }
}
