// NDU-FP (FPXR-02): build flag + soft switch + preferences. Tiny and eager (imported by CityBuildings).
// VITE_NDU_FP = off | dev | on (default dev = only ?fp=1 or a saved soft switch). ?fp=0 always wins.
import { prefersReducedMotion } from "../orbit/orbitCore.ts";

export type FpMode = "off" | "dev" | "on";
export type FpPrefs = {
  v: 1;
  enabled: boolean;
  statureM: number;
  posture: "stand" | "wheelchair";
  hFovDeg: number;
  sensitivity: number;
  touchScale: number;
  invertY: boolean;
  bob: number;
  vignette: "off" | "auto" | "strong";
  reticle: boolean;
  gyro: boolean;
  snapTurnDeg: 0 | 30 | 45;
  footsteps: boolean;
};
export const FP_KEY = "ndu.fp.v1";

const coarse = () => {
  try {
    return typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);
  } catch {
    return false;
  }
};
export function defaultPrefs(pointerCoarse = coarse()): FpPrefs {
  return {
    v: 1,
    enabled: false,
    statureM: 1.75,
    posture: "stand",
    hFovDeg: 90,
    sensitivity: 0.11,
    touchScale: 1,
    invertY: false,
    bob: 0.5,
    vignette: pointerCoarse ? "auto" : "off",
    reticle: pointerCoarse,
    gyro: false,
    snapTurnDeg: 0,
    footsteps: true,
  };
}
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Validate + clamp anything (parsed JSON, a patch) into FpPrefs. */
export function sanitizePrefs(raw: unknown, base: FpPrefs = defaultPrefs()): FpPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    v: 1,
    enabled: bool(r.enabled, base.enabled),
    statureM: num(r.statureM, 1.45, 2.0, base.statureM),
    posture: r.posture === "wheelchair" || r.posture === "stand" ? r.posture : base.posture,
    hFovDeg: num(r.hFovDeg, 70, 100, base.hFovDeg),
    sensitivity: num(r.sensitivity, 0.03, 0.3, base.sensitivity),
    touchScale: num(r.touchScale, 0.5, 2.0, base.touchScale),
    invertY: bool(r.invertY, base.invertY),
    bob: num(r.bob, 0, 1, base.bob),
    vignette: r.vignette === "off" || r.vignette === "auto" || r.vignette === "strong" ? r.vignette : base.vignette,
    reticle: bool(r.reticle, base.reticle),
    gyro: bool(r.gyro, base.gyro),
    snapTurnDeg: r.snapTurnDeg === 0 || r.snapTurnDeg === 30 || r.snapTurnDeg === 45 ? r.snapTurnDeg : base.snapTurnDeg,
    footsteps: bool(r.footsteps, base.footsteps),
  };
}
export function parsePrefs(json: string | null | undefined): FpPrefs {
  if (!json) return defaultPrefs();
  try {
    const p = JSON.parse(json);
    if (!p || p.v !== 1) return defaultPrefs();
    return sanitizePrefs(p);
  } catch {
    return defaultPrefs();
  }
}

let cached: FpPrefs | null = null;
const subs = new Set<(p: FpPrefs) => void>();
export function fpPrefs(): FpPrefs {
  if (cached) return cached;
  try {
    cached = parsePrefs(typeof localStorage === "undefined" ? null : localStorage.getItem(FP_KEY));
  } catch {
    cached = defaultPrefs();
  }
  return cached;
}
export function setFpPrefs(patch: Partial<FpPrefs>): FpPrefs {
  cached = sanitizePrefs({ ...fpPrefs(), ...patch }, fpPrefs());
  try {
    localStorage.setItem(FP_KEY, JSON.stringify(cached));
  } catch {
    // private mode: not remembered
  }
  subs.forEach((fn) => fn(cached as FpPrefs));
  return cached;
}
export function onFpPrefs(fn: (p: FpPrefs) => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function fpBuildMode(): FpMode {
  const v = String((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NDU_FP ?? "dev").toLowerCase();
  return v === "off" || v === "on" ? v : "dev";
}
/** Pure decision: build mode, query string, saved soft switch. */
export function fpAllowedFrom(mode: FpMode, search: string, prefs: Pick<FpPrefs, "enabled">): { allowed: boolean; persistEnable: boolean } {
  const q = new URLSearchParams(search).get("fp");
  if (mode === "off" || q === "0") return { allowed: false, persistEnable: false };
  if (mode === "on") return { allowed: true, persistEnable: false };
  if (q === "1") return { allowed: true, persistEnable: !prefs.enabled };
  return { allowed: prefs.enabled, persistEnable: false };
}
export function fpAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const r = fpAllowedFrom(fpBuildMode(), location.search, fpPrefs());
  if (r.persistEnable) setFpPrefs({ enabled: true });
  return r.allowed;
}
/** Head bob after reduced motion (always 0 under prefers-reduced-motion). */
export function effectiveBob(p: FpPrefs = fpPrefs(), reduced = prefersReducedMotion()): number {
  return reduced ? 0 : p.bob;
}
