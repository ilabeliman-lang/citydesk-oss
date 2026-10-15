/**
 * NDU Mobile Performance Budgets (Categories 11 & 21, items 501–550, 971–1000).
 *
 * Client render loop performance budget tracker:
 * - Draw calls budget: Tier A: 80, Tier B: 40, Tier C: 20
 * - Triangle budget: Tier A: 200k, Tier B: 80k, Tier C: 20k
 * - Target FPS: Tier A: 60, Tier B: 30, Tier C: 30
 * - Max frame time jitter threshold: Tier A: 16.6ms, Tier B: 33.3ms, Tier C: 33.3ms
 *
 * Real-time frame telemetry accumulator, rolling average frame duration, drop frame detector.
 * Pure math and Node 22 built-ins (zero runtime dependencies, runs under --experimental-strip-types).
 */

import type { Tier } from "./tier.ts";

export interface PerfBudget {
  readonly tier: Tier;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly targetFps: number;
  readonly maxFrameTimeJitterMs: number;
}

/**
 * Standard performance budgets by tier.
 * Items 501–504, 971–975.
 */
export const PERF_BUDGETS: Record<Tier, PerfBudget> = {
  A: {
    tier: "A",
    drawCalls: 80,
    triangles: 200_000,
    targetFps: 60,
    maxFrameTimeJitterMs: 16.6,
  },
  B: {
    tier: "B",
    drawCalls: 40,
    triangles: 80_000,
    targetFps: 30,
    maxFrameTimeJitterMs: 33.3,
  },
  C: {
    tier: "C",
    drawCalls: 20,
    triangles: 20_000,
    targetFps: 30,
    maxFrameTimeJitterMs: 33.3,
  },
} as const;

export function getPerfBudget(tier: Tier): PerfBudget {
  return PERF_BUDGETS[tier];
}

export interface RenderMetrics {
  drawCalls: number;
  triangles: number;
}

export interface MetricBudgetReport {
  current: number;
  budget: number;
  exceeded: boolean;
  ratio: number;
}

export interface BudgetViolation {
  metric: "drawCalls" | "triangles" | "frameTimeJitter";
  current: number;
  budget: number;
  tier: Tier;
}

export interface BudgetCheckResult {
  withinBudget: boolean;
  tier: Tier;
  violations: BudgetViolation[];
  drawCalls: MetricBudgetReport;
  triangles: MetricBudgetReport;
}

/**
 * Checks client render loop metrics against the tier budget.
 */
export function checkRenderBudget(metrics: RenderMetrics, tier: Tier): BudgetCheckResult {
  const budget = PERF_BUDGETS[tier];
  const violations: BudgetViolation[] = [];

  const drawCallsExceeded = metrics.drawCalls > budget.drawCalls;
  if (drawCallsExceeded) {
    violations.push({
      metric: "drawCalls",
      current: metrics.drawCalls,
      budget: budget.drawCalls,
      tier,
    });
  }

  const trianglesExceeded = metrics.triangles > budget.triangles;
  if (trianglesExceeded) {
    violations.push({
      metric: "triangles",
      current: metrics.triangles,
      budget: budget.triangles,
      tier,
    });
  }

  return {
    withinBudget: violations.length === 0,
    tier,
    violations,
    drawCalls: {
      current: metrics.drawCalls,
      budget: budget.drawCalls,
      exceeded: drawCallsExceeded,
      ratio: budget.drawCalls > 0 ? metrics.drawCalls / budget.drawCalls : 0,
    },
    triangles: {
      current: metrics.triangles,
      budget: budget.triangles,
      exceeded: trianglesExceeded,
      ratio: budget.triangles > 0 ? metrics.triangles / budget.triangles : 0,
    },
  };
}

/**
 * Determines whether a frame duration constitutes a dropped frame for a given tier or target FPS.
 * For 60 FPS (target ~16.67ms) with 16.6ms jitter threshold, a frame taking > 33.27ms is dropped.
 * For 30 FPS (target ~33.33ms) with 33.3ms jitter threshold, a frame taking > 66.63ms is dropped.
 */
export function isDroppedFrame(
  frameDurationMs: number,
  tierOrTargetFps: Tier | number = "A",
  customJitterThresholdMs?: number,
): boolean {
  let targetFps: number;
  let jitterThresholdMs: number;

  if (typeof tierOrTargetFps === "string") {
    const budget = PERF_BUDGETS[tierOrTargetFps];
    targetFps = budget.targetFps;
    jitterThresholdMs = customJitterThresholdMs ?? budget.maxFrameTimeJitterMs;
  } else {
    targetFps = tierOrTargetFps;
    jitterThresholdMs = customJitterThresholdMs ?? (targetFps >= 60 ? 16.6 : 33.3);
  }

  const expectedFrameTimeMs = 1000 / targetFps;
  return frameDurationMs > expectedFrameTimeMs + jitterThresholdMs;
}

export interface TelemetryAccumulatorOptions {
  windowSize?: number;
  tier?: Tier;
  customTargetFps?: number;
  customJitterThresholdMs?: number;
}

export interface RecordedFrame {
  durationMs: number;
  timestamp: number;
  dropped: boolean;
  jitterMs: number;
}

export interface FrameTelemetrySnapshot {
  tier: Tier;
  targetFps: number;
  maxFrameTimeJitterMs: number;
  sampleCount: number;
  windowSize: number;
  averageFrameDurationMs: number;
  rollingFps: number;
  minFrameDurationMs: number;
  maxFrameDurationMs: number;
  averageJitterMs: number;
  maxJitterMs: number;
  isJitterExceeded: boolean;
  windowDroppedFramesCount: number;
  totalDroppedFramesCount: number;
  consecutiveDroppedFrames: number;
  dropFrameRate: number;
}

/**
 * Real-time frame telemetry accumulator for client render loops.
 * Accumulates frame durations in a rolling window, tracks jitter,
 * detects dropped frames, and computes rolling FPS averages.
 */
export class FrameTelemetryAccumulator {
  private windowSize: number;
  private tier: Tier;
  private targetFps: number;
  private maxFrameTimeJitterMs: number;

  private frameDurations: number[] = [];
  private jitters: number[] = [];
  private droppedWindowFlags: boolean[] = [];

  private lastFrameDurationMs: number | null = null;
  private consecutiveDropped: number = 0;
  private totalFramesRecorded: number = 0;
  private totalDroppedFramesCount: number = 0;

  constructor(options: TelemetryAccumulatorOptions = {}) {
    this.tier = options.tier ?? "A";
    const budget = PERF_BUDGETS[this.tier];
    this.windowSize = Math.max(2, options.windowSize ?? 60);
    this.targetFps = options.customTargetFps ?? budget.targetFps;
    this.maxFrameTimeJitterMs = options.customJitterThresholdMs ?? budget.maxFrameTimeJitterMs;
  }

  public setTier(tier: Tier): void {
    this.tier = tier;
    const budget = PERF_BUDGETS[tier];
    this.targetFps = budget.targetFps;
    this.maxFrameTimeJitterMs = budget.maxFrameTimeJitterMs;
  }

  public getTier(): Tier {
    return this.tier;
  }

  public recordFrame(durationMs: number, timestamp: number = performance.now()): RecordedFrame {
    this.totalFramesRecorded += 1;

    // Jitter: absolute difference from previous frame duration
    const jitterMs = this.lastFrameDurationMs !== null ? Math.abs(durationMs - this.lastFrameDurationMs) : 0;
    this.lastFrameDurationMs = durationMs;

    const dropped = isDroppedFrame(durationMs, this.targetFps, this.maxFrameTimeJitterMs);
    if (dropped) {
      this.consecutiveDropped += 1;
      this.totalDroppedFramesCount += 1;
    } else {
      this.consecutiveDropped = 0;
    }

    // Add to rolling window
    this.frameDurations.push(durationMs);
    this.jitters.push(jitterMs);
    this.droppedWindowFlags.push(dropped);

    if (this.frameDurations.length > this.windowSize) {
      this.frameDurations.shift();
      this.jitters.shift();
      this.droppedWindowFlags.shift();
    }

    return {
      durationMs,
      timestamp,
      dropped,
      jitterMs,
    };
  }

  public getAverageFrameDuration(): number {
    if (this.frameDurations.length === 0) return 0;
    const sum = this.frameDurations.reduce((acc, val) => acc + val, 0);
    return sum / this.frameDurations.length;
  }

  public getRollingFps(): number {
    const avgDuration = this.getAverageFrameDuration();
    if (avgDuration <= 0) return 0;
    return 1000 / avgDuration;
  }

  public getAverageJitter(): number {
    if (this.jitters.length === 0) return 0;
    const sum = this.jitters.reduce((acc, val) => acc + val, 0);
    return sum / this.jitters.length;
  }

  public getMaxJitter(): number {
    if (this.jitters.length === 0) return 0;
    return Math.max(...this.jitters);
  }

  public isJitterExceeded(): boolean {
    return this.getMaxJitter() > this.maxFrameTimeJitterMs;
  }

  public getDroppedFramesCount(): number {
    return this.droppedWindowFlags.filter(Boolean).length;
  }

  public getTotalDroppedFrames(): number {
    return this.totalDroppedFramesCount;
  }

  public getConsecutiveDroppedFrames(): number {
    return this.consecutiveDropped;
  }

  public getDropFrameRate(): number {
    if (this.droppedWindowFlags.length === 0) return 0;
    return this.getDroppedFramesCount() / this.droppedWindowFlags.length;
  }

  public getSampleCount(): number {
    return this.frameDurations.length;
  }

  public getTotalFramesRecorded(): number {
    return this.totalFramesRecorded;
  }

  public getSnapshot(): FrameTelemetrySnapshot {
    const avgDuration = this.getAverageFrameDuration();
    const minDuration = this.frameDurations.length > 0 ? Math.min(...this.frameDurations) : 0;
    const maxDuration = this.frameDurations.length > 0 ? Math.max(...this.frameDurations) : 0;
    const avgJitter = this.getAverageJitter();
    const maxJitter = this.getMaxJitter();
    const windowDropped = this.getDroppedFramesCount();

    return {
      tier: this.tier,
      targetFps: this.targetFps,
      maxFrameTimeJitterMs: this.maxFrameTimeJitterMs,
      sampleCount: this.frameDurations.length,
      windowSize: this.windowSize,
      averageFrameDurationMs: avgDuration,
      rollingFps: avgDuration > 0 ? 1000 / avgDuration : 0,
      minFrameDurationMs: minDuration,
      maxFrameDurationMs: maxDuration,
      averageJitterMs: avgJitter,
      maxJitterMs: maxJitter,
      isJitterExceeded: maxJitter > this.maxFrameTimeJitterMs,
      windowDroppedFramesCount: windowDropped,
      totalDroppedFramesCount: this.totalDroppedFramesCount,
      consecutiveDroppedFrames: this.consecutiveDropped,
      dropFrameRate: this.frameDurations.length > 0 ? windowDropped / this.frameDurations.length : 0,
    };
  }

  public reset(): void {
    this.frameDurations = [];
    this.jitters = [];
    this.droppedWindowFlags = [];
    this.lastFrameDurationMs = null;
    this.consecutiveDropped = 0;
    this.totalFramesRecorded = 0;
    this.totalDroppedFramesCount = 0;
  }
}

export function createFrameTelemetryAccumulator(options?: TelemetryAccumulatorOptions): FrameTelemetryAccumulator {
  return new FrameTelemetryAccumulator(options);
}
