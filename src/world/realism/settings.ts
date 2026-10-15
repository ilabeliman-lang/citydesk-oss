/**
 * NDU-UPG #45 #19 #37: one source of truth for render settings (tier, pixel ratio, optional effects).
 * The device tier comes from perf's `getTier()` (src/world/perf/tier.ts); every realism effect reads its flags from here.
 */
import { getTier, type Tier } from "@/world/perf/tier";

export type { Tier };

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function deviceTier(): Tier {
  return getTier().tier;
}

export type RenderSettings = {
  tier: Tier;
  /** Clamp for map + three.js pixel ratio (#19). */
  dpr: number;
  /** Roof-cap extrusions (#58). */
  roofs: boolean;
  /** Emissive window pattern after sunset (#16). */
  nightWindows: boolean;
  /** Blurred contact shadow under scans (#10). */
  contactShadows: boolean;
  /** Hover highlight on buildings (#26), pointer devices only. */
  hover: boolean;
};

export function renderSettings(): RenderSettings {
  const tier = deviceTier();
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, tier === "A" ? 2 : tier === "B" ? 1.5 : 1);
  const finePointer = typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: fine)").matches);
  return { tier, dpr, roofs: tier !== "C", nightWindows: tier !== "C", contactShadows: tier !== "C", hover: finePointer && tier !== "C" };
}
