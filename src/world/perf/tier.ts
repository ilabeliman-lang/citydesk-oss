/**
 * NDU-UPG 502: device tiers (bible 02 "Tiers"). A = desktop or recent flagship, B = mid Android
 * (4 GB, 4G, 30 fps), C = everything else incl. software GL and WebGL loss (flat map, no Three
 * buildings, phone UI unchanged). `classifyTier` is pure (unit tested); `getTier` runs the startup
 * heuristics once and keeps the answer for the session. The 2 s fps probe (degrade.ts) can only
 * lower it. Overrides: `?tier=A|B|C` (QA) or the player's "Restore full map" opt-back.
 * Keep this file free of path aliases and runtime imports so node --experimental-strip-types can test it.
 */
export type Tier = "A" | "B" | "C";

export type TierSignals = {
  webgl: boolean;
  renderer: string;
  memoryGb: number | null;
  cores: number | null;
  mobile: boolean;
  fps: number | null;
  saveData: boolean;
};

export type TierSource = "heuristic" | "probe" | "ladder" | "memory" | "webgl-lost" | "override" | "player";

export type TierState = { tier: Tier; reason: string; source: TierSource; signals: TierSignals | null };

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|offscreen/i;
const WEAK_GPU = /mali-(4\d\d|t[0-7]\d\d)|adreno[^0-9]*[1-4]\d\d\b|powervr|sgx|videocore|\bgma\b/i;
const STRONG_GPU =
  /apple m\d|adreno[^0-9]*[7-9]\d\d|nvidia|geforce|quadro|\brtx\b|radeon|apple a1[5-9]|mali-g7[1-9]|mali-g[7-9]\d\d|immortalis|xclipse/i;

export function classifyTier(s: TierSignals): { tier: Tier; reason: string } {
  if (!s.webgl) return { tier: "C", reason: "no WebGL" };
  if (SOFTWARE_GL.test(s.renderer)) return { tier: "C", reason: "software GL" };
  if (s.fps !== null && s.fps < 20) return { tier: "C", reason: `probe ${Math.round(s.fps)} fps < 20` };
  if (s.memoryGb !== null && s.memoryGb <= 2) return { tier: "C", reason: `${s.memoryGb} GB RAM` };
  if (s.cores !== null && s.cores <= 2) return { tier: "C", reason: `${s.cores} CPU cores` };
  if (WEAK_GPU.test(s.renderer)) return { tier: "C", reason: "weak GPU" };
  if (s.fps !== null && s.fps < 45) return { tier: "B", reason: `probe ${Math.round(s.fps)} fps` };
  if (s.saveData) return { tier: "B", reason: "data saver" };
  if (s.memoryGb !== null && s.memoryGb < 4) return { tier: "B", reason: `${s.memoryGb} GB RAM` };
  const strong = STRONG_GPU.test(s.renderer);
  if (!s.mobile) {
    if (strong || ((s.cores ?? 8) >= 8 && (s.memoryGb ?? 8) >= 8)) return { tier: "A", reason: "desktop" };
    return { tier: "B", reason: "desktop, modest GPU" };
  }
  if (strong && (s.memoryGb ?? 6) >= 6) return { tier: "A", reason: "flagship phone" };
  return { tier: "B", reason: "phone" };
}

const RANK: Record<Tier, number> = { A: 0, B: 1, C: 2 };
/** The lower (cheaper) of two tiers. */
export const lowerTier = (a: Tier, b: Tier): Tier => (RANK[a] >= RANK[b] ? a : b);

const KEY = "ndu.perf.tier";
const listeners = new Set<(state: TierState) => void>();
let current: TierState | null = null;

function readSignals(): TierSignals {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
    userAgentData?: { mobile?: boolean };
  };
  let webgl = false;
  let renderer = "";
  try {
    // A throwaway context only to read the GPU string; released at once so the map keeps the only one.
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      webgl = true;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    webgl = false;
  }
  const mobile =
    nav.userAgentData?.mobile ?? (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || matchMedia("(pointer: coarse)").matches);
  return {
    webgl,
    renderer,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    mobile,
    fps: null,
    saveData: Boolean(nav.connection?.saveData),
  };
}

function save(state: TierState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tier: state.tier, reason: state.reason, source: state.source }));
  } catch {
    // private mode: the tier just is not remembered
  }
}

function apply(state: TierState) {
  current = state;
  if (typeof document !== "undefined") document.documentElement.dataset.nduTier = state.tier;
  for (const fn of listeners) fn(state);
}

/** The session's tier (detected on first call). Safe to call during SSR: answers Tier B there. */
export function getTier(): TierState {
  if (current) return current;
  if (typeof window === "undefined") return { tier: "B", reason: "server render", source: "heuristic", signals: null };
  const forced = new URLSearchParams(location.search).get("tier")?.toUpperCase();
  if (forced === "A" || forced === "B" || forced === "C") {
    const state: TierState = { tier: forced, reason: "?tier override", source: "override", signals: null };
    save(state);
    apply(state);
    return state;
  }
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Omit<TierState, "signals"> | null;
    if (kept && (kept.tier === "A" || kept.tier === "B" || kept.tier === "C")) {
      apply({ ...kept, signals: null });
      return current as unknown as TierState;
    }
  } catch {
    // fall through to detection
  }
  const signals = readSignals();
  const verdict = classifyTier(signals);
  const state: TierState = { ...verdict, source: "heuristic", signals };
  save(state);
  apply(state);
  return state;
}

/** Change the session tier (ladder, probe, memory pressure, WebGL loss, or the player's opt-back). */
export function setTier(tier: Tier, reason: string, source: TierSource) {
  const prev = getTier();
  if (prev.tier === tier && prev.source === source) return;
  const state: TierState = { tier, reason, source, signals: prev.signals };
  save(state);
  apply(state);
}

export function onTier(fn: (state: TierState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The player chose "Restore full map": back to the heuristic tier (never below B) and no auto Tier C this session. */
export function optBack() {
  try {
    sessionStorage.setItem("ndu.perf.noAutoC", "1");
  } catch {
    // ignore
  }
  const signals = getTier().signals ?? readSignals();
  const heuristic = classifyTier({ ...signals, fps: null }).tier;
  setTier(heuristic === "C" ? "B" : heuristic, "player restored the full map", "player");
}

export function autoTierCAllowed(): boolean {
  try {
    return sessionStorage.getItem("ndu.perf.noAutoC") !== "1";
  } catch {
    return true;
  }
}
