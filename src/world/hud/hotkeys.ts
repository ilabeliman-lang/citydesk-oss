/**
 * NDU-UPG hud (#474): global keyboard shortcuts for the CityDesk HUD.
 * Returns a cleanup function to unbind all listeners.
 */

export type HotkeyHandlers = {
  onToggleHud?: () => void;
  onCycleCamera?: () => void;
  onDismiss?: () => void;
  /** NDU-UPG inspect (#04): inspect what is at the centre of the map. */
  onInspect?: () => void;
};

/**
 * Bind global hotkeys to HUD actions.
 * - 'h' / 'H': toggle HUD visibility
 * - 'c' / 'C': cycle camera view mode
 * - 'Escape': dismiss open sheets / cards
 * - 'i' / 'I': inspect the object at the map centre (NDU-UPG inspect #04, only when a handler is bound)
 * Returns a cleanup function that removes all listeners.
 */
export function bindHotkeys(handlers: HotkeyHandlers): () => void {
  const listener = (e: KeyboardEvent) => {
    // Don't hijack input fields
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    switch (e.key) {
      case "h":
      case "H":
        handlers.onToggleHud?.();
        break;
      case "c":
      case "C":
        handlers.onCycleCamera?.();
        break;
      case "i":
      case "I":
        handlers.onInspect?.();
        break;
      case "Escape":
        handlers.onDismiss?.();
        break;
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", listener);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", listener);
    }
  };
}
