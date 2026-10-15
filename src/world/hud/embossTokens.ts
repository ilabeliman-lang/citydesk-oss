/**
 * NDU-UPG hud (#451–#500): embossed design tokens.
 * CSS variables shared by all NDU panels for the chunky, tactile 3D-button look.
 */

export const EMBOSS_TOKENS: Record<string, string> = {
  "--e-bg": "#1a1511",
  "--e-surface": "#2c241c",
  "--e-hi": "rgba(255,255,255,0.14)",
  "--e-lo": "rgba(0,0,0,0.30)",
  "--e-accent": "#e8843a",
  "--e-accent-hi": "#f7b47a",
  "--e-accent-lo": "#6e3612",
  "--e-fg": "#f6efe2",
  "--e-muted": "#b5a48e",
  "--e-shadow-out": "0 3px 0 rgba(0,0,0,0.42), 0 8px 18px rgba(0,0,0,0.38)",
  "--e-shadow-in": "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -3px 6px rgba(0,0,0,0.38)",
  "--e-radius": "18px",
  "--e-radius-pill": "999px",
};

/** Returns a CSS string declaring all emboss tokens as :root variables. */
export function embossTokensCss(): string {
  return `:root {\n${Object.entries(EMBOSS_TOKENS)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")}\n}`;
}

/** Inject emboss tokens into the document head (idempotent). */
export function injectEmbossTokens(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("ndu-emboss-tokens")) return;
  const style = document.createElement("style");
  style.id = "ndu-emboss-tokens";
  style.textContent = embossTokensCss();
  document.head.appendChild(style);
}

/**
 * Haptic feedback via the Vibration API, with safe fallback.
 * - 'tap': short pulse (10ms)
 * - 'press': medium pulse (25ms)
 * - 'warning': double buzz (50ms, pause, 50ms)
 */
export function hapticFeedback(type: "tap" | "press" | "warning" = "tap"): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    if (type === "tap") navigator.vibrate(10);
    else if (type === "press") navigator.vibrate(25);
    else navigator.vibrate([50, 30, 50]);
  } catch {
    // Vibration not permitted or not available — silent
  }
}
