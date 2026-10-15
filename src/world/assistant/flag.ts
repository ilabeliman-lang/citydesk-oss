/**
 * NDU-AI avatar-bot assistant: feature flag. ON in dev (`vite dev`), OFF in production builds unless
 * the build env sets VITE_NDU_ASSISTANT=on (Wei's switch). `?assistant=0` hides it anywhere.
 * Tiny and dependency-free: CityBuildings imports it eagerly.
 */
export function assistantEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("assistant");
  if (q === "0" || q === "off") return false;
  if (import.meta.env.DEV) return true;
  return import.meta.env.VITE_NDU_ASSISTANT === "on";
}
