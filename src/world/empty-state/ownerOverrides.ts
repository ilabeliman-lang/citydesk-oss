/**
 * Owner customisations for the empty-state view. Private by default: saved only in this browser
 * (localStorage), never sent to the server, until a real ownership + sync path exists (the property
 * slice). Tags mirror the scan `visibility` enum (private / family / public) and the Personal /
 * Family / Community ownership tags.
 */

export type OwnerTag = "personal" | "family" | "community";
export type Visibility = "private" | "family" | "public";
export type ItemKind = "counter" | "table" | "chairs" | "bed" | "shelf" | "plant";

export type OwnerOverride = {
  key: string;
  name?: string;
  wall?: string;
  roof?: string;
  /** Owner's floor count; the map's own height stays the default. */
  levels?: number;
  items: ItemKind[];
  tag: OwnerTag;
  visibility: Visibility;
  /** Small owner GLB (data: URL), kept on this phone only. */
  glb?: string;
  glbName?: string;
  /** Who customised it on this device (signed-in user id), if known. */
  ownerId?: string | null;
  updatedAt: number;
};

export const ITEM_LABEL: Record<ItemKind, string> = {
  counter: "Counter",
  table: "Table",
  chairs: "Chairs",
  bed: "Bed",
  shelf: "Shelf",
  plant: "Plant",
};

export const WALLS = ["#f6efe2", "#e8843a", "#2f6f5e", "#3b5b92", "#c94f4f", "#f0c14a"] as const;
export const ROOFS = ["#1a1511", "#8a3b2b", "#55606e", "#2f6f5e", "#e8843a", "#f6efe2"] as const;

const STORE = "ndu:owner-overrides:v1";
export const MAX_GLB_BYTES = 1_500_000;
const EVENT = "ndu:owner-overrides";

function readAll(): Record<string, OwnerOverride> {
  try {
    const raw = window.localStorage.getItem(STORE);
    const parsed = raw ? (JSON.parse(raw) as Record<string, OwnerOverride>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getOverride(key: string): OwnerOverride | null {
  if (typeof window === "undefined") return null;
  const row = readAll()[key];
  return row && typeof row === "object" ? { ...row, items: Array.isArray(row.items) ? row.items : [] } : null;
}

export function saveOverride(row: OwnerOverride): boolean {
  try {
    const all = readAll();
    all[row.key] = { ...row, updatedAt: Date.now() };
    window.localStorage.setItem(STORE, JSON.stringify(all));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false; // storage full/blocked — the default empty view stays
  }
}

export function clearOverride(key: string) {
  try {
    const all = readAll();
    delete all[key];
    window.localStorage.setItem(STORE, JSON.stringify(all));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // nothing saved, nothing to clear
  }
}

export function blankOverride(key: string, ownerId: string | null): OwnerOverride {
  return { key, items: [], tag: "personal", visibility: "private", ownerId, updatedAt: Date.now() };
}

export function onOverridesChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
