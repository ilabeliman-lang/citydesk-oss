/**
 * NDU-UPG kids: local-only progress and settings for the Kids room.
 * Nothing here leaves the phone: no server calls, no account link, no names, no photos.
 * Keep this file free of path aliases and runtime imports so node --experimental-strip-types can test it.
 */
export type Fill = { x: number; y: number; c: string };
export type KidsProgress = {
  stars: number;
  meals: number;
  bestTower: number;
  rolls: number;
  pictures: number;
  hugs: number;
  fills: Record<string, Fill[]>;
};
export type KidsSettings = { verse: boolean; breakMin: 0 | 15 | 30 };

export const PROGRESS_KEY = "ndu.kids.v1";
export const SETTINGS_KEY = "ndu.kids.settings.v1";
/** Set while the Kids room is open, so a reload lands back inside it (exit needs the parent gate). */
export const LOCK_KEY = "ndu.kids.lock";

export const EMPTY_PROGRESS: KidsProgress = {
  stars: 0,
  meals: 0,
  bestTower: 0,
  rolls: 0,
  pictures: 0,
  hugs: 0,
  fills: {},
};
export const DEFAULT_SETTINGS: KidsSettings = { verse: true, breakMin: 0 };

const PALETTE_RE = /^#[0-9a-f]{6}$/i;
const count = (v: unknown, max = 99999) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;

/** Parse and clamp whatever is in storage; anything odd falls back to zero. */
export function cleanProgress(raw: unknown): KidsProgress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fills: Record<string, Fill[]> = {};
  const rf = r.fills && typeof r.fills === "object" ? (r.fills as Record<string, unknown>) : {};
  for (const [pic, list] of Object.entries(rf).slice(0, 4)) {
    if (!/^[a-z]{1,12}$/.test(pic) || !Array.isArray(list)) continue;
    fills[pic] = list
      .filter(
        (f): f is Fill => !!f && typeof f === "object" && PALETTE_RE.test(String((f as Fill).c)),
      )
      .map((f) => ({ x: count(f.x, 1024), y: count(f.y, 1024), c: String(f.c) }))
      .slice(-200);
  }
  return {
    stars: count(r.stars),
    meals: count(r.meals),
    bestTower: count(r.bestTower, 50),
    rolls: count(r.rolls),
    pictures: count(r.pictures),
    hugs: count(r.hugs),
    fills,
  };
}

export function cleanSettings(raw: unknown): KidsSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = r.breakMin === 15 || r.breakMin === 30 ? r.breakMin : 0;
  return { verse: r.verse !== false, breakMin: b };
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or private mode: progress just is not kept
  }
}

export const loadProgress = () => cleanProgress(readJson(PROGRESS_KEY));
export const saveProgress = (p: KidsProgress) => writeJson(PROGRESS_KEY, p);
export const loadSettings = () => cleanSettings(readJson(SETTINGS_KEY));
export const saveSettings = (s: KidsSettings) => writeJson(SETTINGS_KEY, s);
export function resetProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}
