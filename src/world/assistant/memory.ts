/**
 * NDU-AI avatar-bot assistant: client-side memory. Recent places + a few preferences, kept ONLY in this
 * browser (localStorage), never sent to the server and never in the database. "Forget me" wipes it.
 * Nothing that looks like contact details is stored (see redactPII), and nothing the moderation gate
 * blocked is ever written.
 *
 * Pure: the storage is injected so node tests can use an in-memory Map.
 */
import { moderate, redactPII, stripControl } from "./moderate.ts";

export const MEMORY_KEY = "ndu.assistant.mem.v1";
export const MAX_PLACES = 8;
export const MAX_NAME = 24;

export type RecentPlace = { name: string; lat: number; lng: number; at: number };
export type AssistantPrefs = {
  /** Voice out. Muted by default on first load. */
  voice: boolean;
  /** What the bot calls the player, if they told it. */
  nickname: string;
  /** Last weather preview the player asked for ("live" = none). */
  weather: string;
};
export type AssistantMemory = {
  v: 1;
  places: RecentPlace[];
  prefs: AssistantPrefs;
  greeted: boolean;
};

export type KV = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

export const DEFAULT_PREFS: AssistantPrefs = Object.freeze({
  voice: false,
  nickname: "",
  weather: "live",
}) as AssistantPrefs;

export function emptyMemory(): AssistantMemory {
  return { v: 1, places: [], prefs: { ...DEFAULT_PREFS }, greeted: false };
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

const safeText = (v: unknown, max: number): string => {
  const s = redactPII(
    stripControl(String(v ?? ""))
      .replace(/[<>]/g, "")
      .trim(),
  ).slice(0, max);
  return moderate(s).verdict === "allow" ? s : "";
};

/** Parse whatever is stored; anything malformed falls back to an empty memory (never throws). */
export function loadMemory(store: KV | null | undefined): AssistantMemory {
  if (!store) return emptyMemory();
  try {
    const raw = JSON.parse(store.getItem(MEMORY_KEY) ?? "null") as Partial<AssistantMemory> | null;
    if (!raw || raw.v !== 1) return emptyMemory();
    const places = Array.isArray(raw.places)
      ? raw.places
          .filter(
            (p) =>
              p &&
              finite(p.lat) &&
              finite(p.lng) &&
              Math.abs(p.lat) <= 90 &&
              Math.abs(p.lng) <= 180,
          )
          .map((p) => ({
            name: safeText(p.name, 60),
            lat: p.lat,
            lng: p.lng,
            at: finite(p.at) ? p.at : 0,
          }))
          .filter((p) => p.name)
          .slice(0, MAX_PLACES)
      : [];
    const prefs = raw.prefs ?? DEFAULT_PREFS;
    return {
      v: 1,
      places,
      prefs: {
        voice: prefs.voice === true,
        nickname: safeText(prefs.nickname, MAX_NAME),
        weather: typeof prefs.weather === "string" ? prefs.weather.slice(0, 12) : "live",
      },
      greeted: raw.greeted === true,
    };
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(store: KV | null | undefined, mem: AssistantMemory): void {
  if (!store) return;
  try {
    store.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch {
    // private mode / full: memory just lasts for this visit
  }
}

/** Add a place to the front of the recent list (deduped by name, capped). Returns a new memory. */
export function rememberPlace(
  mem: AssistantMemory,
  place: { name: string; lat: number; lng: number },
  now = Date.now(),
): AssistantMemory {
  const name = safeText(place.name, 60);
  if (!name || !finite(place.lat) || !finite(place.lng)) return mem;
  const rest = mem.places.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  return {
    ...mem,
    places: [{ name, lat: place.lat, lng: place.lng, at: now }, ...rest].slice(0, MAX_PLACES),
  };
}

export function setPref<K extends keyof AssistantPrefs>(
  mem: AssistantMemory,
  key: K,
  value: AssistantPrefs[K],
): AssistantMemory {
  const v = key === "nickname" ? (safeText(value, MAX_NAME) as AssistantPrefs[K]) : value;
  return { ...mem, prefs: { ...mem.prefs, [key]: v } };
}

/** "Forget me": remove everything this assistant stored in this browser. */
export function forgetAll(store: KV | null | undefined): AssistantMemory {
  try {
    store?.removeItem(MEMORY_KEY);
  } catch {
    // ignore
  }
  return emptyMemory();
}

/** Find a remembered place by a loose name match. */
export function recallPlace(mem: AssistantMemory, query: string): RecentPlace | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  return (
    mem.places.find((p) => p.name.toLowerCase() === q) ??
    mem.places.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ??
    null
  );
}
