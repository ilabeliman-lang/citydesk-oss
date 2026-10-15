import { getQuality, perfStats } from "./degrade";
import { getTier } from "./tier";

/**
 * NDU-UPG 509/528/537/550: QA perf HUD, only with `?perf` in the URL (never shipped to players by default).
 * Shows frame time p50/p95, fps, draw calls per frame, tier + ladder rung, bytes downloaded this session
 * (a floor: cross-origin files without Timing-Allow-Origin report 0),
 * long tasks, and LCP/CLS/INP (own PerformanceObservers, no web-vitals dependency). Also on window.__nduPerf.
 */
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export type Vitals = { lcp: number; cls: number; inp: number; longTasks: number; longTaskMs: number };

/** First-person status. Caller supplies eye height in metres; this is not a frame time. */
export function fpLine(eyeHeightM: number): string {
  const n = eyeHeightM;
  return `eye ${n} m`;
}

export function mountHud(canvas: HTMLCanvasElement): () => void {
  const vitals: Vitals = { lcp: 0, cls: 0, inp: 0, longTasks: 0, longTaskMs: 0 };
  const observers: PerformanceObserver[] = [];
  const watch = (type: string, fn: (e: PerformanceEntry) => void, extra: Record<string, unknown> = {}) => {
    try {
      const o = new PerformanceObserver((list) => list.getEntries().forEach(fn));
      o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      observers.push(o);
    } catch {
      // entry type not supported here
    }
  };
  watch("largest-contentful-paint", (e) => (vitals.lcp = e.startTime));
  watch("layout-shift", (e) => {
    const ls = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (!ls.hadRecentInput) vitals.cls += ls.value;
  });
  watch("event", (e) => (vitals.inp = Math.max(vitals.inp, e.duration)), { durationThreshold: 40 });
  watch("longtask", (e) => {
    vitals.longTasks += 1;
    vitals.longTaskMs += e.duration;
  });

  // Draw calls: count on the map's own context (getContext returns the existing one).
  let calls = 0;
  let perFrame = 0;
  const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as (WebGLRenderingContext & Record<string, unknown>) | null;
  const wrapped: [string, unknown][] = [];
  if (gl) {
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = gl[name];
      if (typeof orig !== "function") continue;
      wrapped.push([name, orig]);
      gl[name] = function (this: unknown, ...args: unknown[]) {
        calls += 1;
        return (orig as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
  }

  const bytes = () => {
    let total = 0;
    for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) total += e.transferSize || 0;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return total + (nav?.transferSize ?? 0);
  };

  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText =
    "position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:2147483000;pointer-events:none;padding:6px 9px;border-radius:10px;background:rgba(20,17,14,.88);color:#f6efe2;font:11px/1.35 ui-monospace,monospace;white-space:pre;box-shadow:0 2px 0 #3a3028 inset,0 6px 14px rgba(0,0,0,.4)";
  document.body.append(box);
  let raf = 0;
  let lastPaint = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    perFrame = calls;
    calls = 0;
    if (now - lastPaint < 500) return;
    lastPaint = now;
    const { frameMs, fps } = perfStats();
    const t = getTier();
    const q = getQuality();
    box.textContent =
      `tier ${t.tier} (${t.source}: ${t.reason}) rung ${q.step}\n` +
      `fps ${Math.round(fps.at(-1) ?? 0)}  frame p50 ${pct(frameMs, 50).toFixed(1)} p95 ${pct(frameMs, 95).toFixed(1)} ms\n` +
      `draws/frame ${perFrame}  down>=${(bytes() / 1048576).toFixed(2)} MB\n` +
      `LCP ${Math.round(vitals.lcp)} ms  CLS ${vitals.cls.toFixed(3)}  INP~${Math.round(vitals.inp)} ms\n` +
      `long tasks ${vitals.longTasks} (${Math.round(vitals.longTaskMs)} ms)\n` +
      `first person: fpLine(eyeHeightM) = eye {n} m`;
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    observers.forEach((o) => o.disconnect());
    if (gl) for (const [name, orig] of wrapped) gl[name] = orig;
    box.remove();
  };
}
