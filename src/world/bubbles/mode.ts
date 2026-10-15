import { useEffect, useSyncExternalStore } from "react";

/**
 * NDU-UPG bubbles: which on-screen style the map uses. "bubbles" (default) tucks every card into a small
 * embossed bubble that opens on tap; "classic" keeps the original full cards. `?ui=classic` or the
 * "Classic cards" switch in the top pill's menu opts out, and the choice is remembered on this phone.
 */
export type UiMode = "bubbles" | "classic";
// NDU-UPG bubbles: v2 resets phones that were left on classic cards so everyone starts on bubbles.
const KEY = "ndu.ui.v2";
const OLD_KEYS = ["ndu.ui.v1"];
const CLEAR_KEY = "ndu.bubbles.clear";
const listeners = new Set<() => void>();
let mode: UiMode | null = null;
let clear: boolean | null = null;

function readMode(): UiMode {
  if (typeof window === "undefined") return "bubbles";
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
    const q = new URLSearchParams(window.location.search).get("ui");
    if (q === "classic" || q === "bubbles") {
      localStorage.setItem(KEY, q);
      return q;
    }
    return localStorage.getItem(KEY) === "classic" ? "classic" : "bubbles";
  } catch {
    return "bubbles";
  }
}

function readClear(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CLEAR_KEY) === "1";
  } catch {
    return false;
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export function getUiMode(): UiMode {
  if (mode === null) mode = readMode();
  return mode;
}

export function setUiMode(next: UiMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // private mode: still switches for this visit
  }
  emit();
}

export function getClearMap(): boolean {
  if (clear === null) clear = readClear();
  return clear;
}

export function setClearMap(next: boolean) {
  clear = next;
  try {
    localStorage.setItem(CLEAR_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
  emit();
}

/** True when the bubble style is on. Also mirrors the mode onto <html data-ndu-ui> so plain CSS can follow. */
export function useBubbleMode(): boolean {
  const m = useSyncExternalStore(subscribe, getUiMode, () => "bubbles" as UiMode);
  const c = useSyncExternalStore(subscribe, getClearMap, () => false);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.nduUi = m;
    if (m === "bubbles" && c) root.dataset.nduClear = "1";
    else delete root.dataset.nduClear;
  }, [m, c]);
  return m === "bubbles";
}

export function useClearMap(): boolean {
  return useSyncExternalStore(subscribe, getClearMap, () => false);
}

/** A soft tap: a tiny buzz where phones allow it. */
export function tapBuzz() {
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch {
    // ignore
  }
}
