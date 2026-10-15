export type ViewMode = "chase" | "fpv" | "iso" | "tactical" | "planet";

export const CYCLE_MODES: ViewMode[] = ["chase", "fpv", "iso", "tactical"];

let currentMode: ViewMode = "chase";
const subs = new Set<(mode: ViewMode) => void>();

export function getViewMode(): ViewMode {
  return currentMode;
}

export function setViewMode(mode: ViewMode): void {
  currentMode = mode;
  subs.forEach((fn) => fn(currentMode));
}

export function onViewMode(fn: (mode: ViewMode) => void): () => void {
  subs.add(fn);
  fn(currentMode);
  return () => {
    subs.delete(fn);
  };
}

/**
 * Cycles view mode through chase -> fpv -> iso -> tactical -> chase.
 */
export function cycleViewMode(): ViewMode {
  const currentIndex = CYCLE_MODES.indexOf(currentMode);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % CYCLE_MODES.length : 0;
  const nextMode = CYCLE_MODES[nextIndex];
  setViewMode(nextMode);
  return nextMode;
}
