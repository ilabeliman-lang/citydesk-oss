import { LADDER_DEFAULTS, LADDER_START, ladderTick, quality, type LadderState, type Quality } from "./ladder";
import { autoTierCAllowed, classifyTier, getTier, lowerTier, onTier, setTier } from "./tier";

/**
 * NDU-UPG 503 (runtime): measures fps once a second with rAF and walks the degrade ladder.
 * The first 2 s after the map settles are the startup fps probe (#502) and can only lower the tier.
 * Also: memory watchdog (#539, Chrome's performance.memory over the 250 MB budget -> Tier C).
 * Everything is sticky for the session. QA: `?perf-sim-fps=15` (or __nduPerf.simulateFps) feeds fake fps.
 */
const STEP_KEY = "ndu.perf.step";
const MEMORY_BUDGET = 250 * 1024 * 1024;

export type PerfStats = { fps: number[]; frameMs: number[] };

let quality$: Quality | null = null;
const listeners = new Set<(q: Quality) => void>();
const stats: PerfStats = { fps: [], frameMs: [] };
let simulated: number | null = null;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function readStep(): number {
  try {
    return Math.max(0, Math.min(4, Number(sessionStorage.getItem(STEP_KEY)) || 0));
  } catch {
    return 0;
  }
}

function publish(step: number) {
  quality$ = quality(getTier().tier, step, reducedMotion());
  for (const fn of listeners) fn(quality$);
}

export function getQuality(): Quality {
  return quality$ ?? quality(getTier().tier, readStep(), reducedMotion());
}

export function onQuality(fn: (q: Quality) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function perfStats(): PerfStats {
  return stats;
}

export function simulateFps(fps: number | null) {
  simulated = fps;
}

/** Start the fps monitor (idempotent per call; returns stop). */
export function startLadder(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const sim = Number(new URLSearchParams(location.search).get("perf-sim-fps"));
  if (sim > 0) simulated = sim;
  let state: LadderState = { ...LADDER_START, step: readStep(), tierC: getTier().tier === "C" };
  const startedAt = performance.now();
  let probed = false;
  let frames = 0;
  let windowStart = startedAt;
  let last = startedAt;
  let raf = 0;
  let memTimer = 0;
  publish(state.step);
  const offTier = onTier(() => publish(state.step));

  const sample = (fps: number, now: number) => {
    stats.fps.push(fps);
    if (stats.fps.length > 120) stats.fps.shift();
    if (!probed && now - startedAt >= 2000) {
      probed = true;
      const t = getTier();
      if (t.source === "heuristic" && t.signals) {
        const verdict = classifyTier({ ...t.signals, fps });
        const lower = lowerTier(t.tier, verdict.tier);
        if (lower !== t.tier && (lower !== "C" || autoTierCAllowed())) setTier(lower, verdict.reason, "probe");
      }
    }
    const res = ladderTick(state, fps, now, { ...LADDER_DEFAULTS, allowTierC: autoTierCAllowed() && getTier().tier !== "C" });
    state = res.state;
    if (!res.dropped) return;
    if (res.dropped === "tierC") {
      setTier("C", `fps under ${LADDER_DEFAULTS.floor} for 10 s`, "ladder");
    } else {
      try {
        sessionStorage.setItem(STEP_KEY, String(state.step));
      } catch {
        // ignore
      }
      publish(state.step);
    }
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = now - last;
    last = now;
    stats.frameMs.push(dt);
    if (stats.frameMs.length > 600) stats.frameMs.shift();
    frames += 1;
    const span = now - windowStart;
    if (span < 1000) return;
    const fps = (frames * 1000) / span;
    frames = 0;
    windowStart = now;
    // A hidden or frozen tab is not a slow phone: skip windows with long gaps.
    if (document.hidden || span > 2500) return;
    sample(simulated ?? fps, now);
  };
  raf = requestAnimationFrame(tick);

  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  if (perf.memory) {
    memTimer = window.setInterval(() => {
      const used = perf.memory?.usedJSHeapSize ?? 0;
      if (used > MEMORY_BUDGET && getTier().tier !== "C" && autoTierCAllowed()) {
        setTier("C", `JS heap ${Math.round(used / 1048576)} MB over 250 MB`, "memory");
      }
    }, 5000);
  }
  const onVisible = () => {
    frames = 0;
    windowStart = last = performance.now();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    cancelAnimationFrame(raf);
    clearInterval(memTimer);
    offTier();
    document.removeEventListener("visibilitychange", onVisible);
  };
}
