import {
  getRealism,
  setPaletteFilter,
  setTimeOverride,
  subscribeRealism,
} from "@/world/realism/state";
import { localMinutes } from "@/world/realism/sun";
import { effectsOn, FLAG_KEY } from "./flag";
import {
  cacheKey,
  CLEAR_FX,
  effectsFor,
  overrideFx,
  tintPalette,
  type Fx,
  type Kind,
  type WeatherNow,
} from "./weather";
import { liveWeather } from "./weatherFn";

/**
 * NDU-UPG immerse #301 #311 #318 #322 #326 #338 #342 #350: client weather store. Follows realism's
 * viewed place (no second camera listener), fetches the cached server proxy when the ~11 km cell
 * changes or every 15 min, paints instantly from the localStorage copy, and tints realism's sun
 * palette through `setPaletteFilter` (throttled to once a minute for live changes).
 */

export type ImmerseState = {
  enabled: boolean;
  live: WeatherNow | null;
  status: "idle" | "loading" | "ok" | "offline";
  /** Manual weather (#311), null = live. */
  override: Kind | null;
  /** Forecast hour being previewed (#342), unix ms, null = now. */
  previewMs: number | null;
  /** Battery saver (#338): no particles. `saverAuto` = low battery detected. */
  saver: boolean;
  saverAuto: boolean;
  sound: boolean;
  volume: number;
  fx: Fx;
  version: number;
};

const WX_KEY = "ndu.wx.v1";
const PREF_KEY = "ndu.immerse.prefs";
const REFRESH_MS = 15 * 60_000;
const STALE_MS = 3 * 3600_000;

const listeners = new Set<() => void>();
let state: ImmerseState = {
  enabled: false,
  live: null,
  status: "idle",
  override: null,
  previewMs: null,
  saver: false,
  saverAuto: false,
  sound: false,
  volume: 0.6,
  fx: CLEAR_FX,
  version: 0,
};
let started = false;
let lastKey = "";
let timer = 0;
let retryAt = 0;
let lastTint = 0;
/** The map's own centre (realism only re-commits when the sun moves, so short hops can be missed). */
let place: { lat: number; lng: number } | null = null;
const here = () => place ?? getRealism();
let tintTimer = 0;

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: this page only
  }
};

function computeFx(s: ImmerseState): Fx {
  if (s.override) return overrideFx(s.override, s.live);
  const r = getRealism();
  return effectsFor(s.live, {
    zone: r.zone,
    month:
      Number(
        new Intl.DateTimeFormat("en-US", { timeZone: r.zone, month: "numeric" }).format(r.at),
      ) || undefined,
    previewMs: s.previewMs,
  });
}

function retint(now: boolean) {
  window.clearTimeout(tintTimer);
  const run = () => {
    lastTint = Date.now();
    const fx = state.fx;
    setPaletteFilter(state.enabled ? (pal, sun) => tintPalette(pal, fx, sun) : null);
  };
  const wait = now ? 0 : Math.max(0, 60_000 - (Date.now() - lastTint)); // #326
  if (wait === 0) run();
  else tintTimer = window.setTimeout(run, wait);
}

function set(
  patch: Partial<ImmerseState>,
  opts: { tint?: "now" | "throttled"; persist?: boolean } = {},
) {
  const next = { ...state, ...patch, version: state.version + 1 };
  next.fx = computeFx(next);
  const fxChanged =
    JSON.stringify(next.fx) !== JSON.stringify(state.fx) || next.enabled !== state.enabled;
  state = next;
  if (opts.persist)
    write(PREF_KEY, { override: state.override, saver: state.saver, volume: state.volume });
  if (fxChanged && opts.tint) retint(opts.tint === "now");
  listeners.forEach((fn) => fn());
}

export const getImmerse = () => state;
export function subscribeImmerse(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function fetchNow(force = false) {
  const r = here();
  const key = cacheKey(r.lat, r.lng);
  if (!force && key === lastKey && state.live && Date.now() - state.live.at < REFRESH_MS) return;
  if (Date.now() < retryAt && key === lastKey) return;
  lastKey = key;
  set({ status: state.live ? state.status : "loading" });
  try {
    const answer = await liveWeather({ data: { lat: r.lat, lng: r.lng } });
    if (cacheKey(here().lat, here().lng) !== key) return; // moved on meanwhile
    if (answer.ok) {
      write(WX_KEY, answer.data);
      set({ live: answer.data, status: "ok" }, { tint: "throttled" });
    } else {
      retryAt = Date.now() + answer.retryMs;
      set({ status: state.live ? "ok" : "offline" }, { tint: "throttled" }); // #322 clear fallback, no toast
    }
  } catch {
    retryAt = Date.now() + 60_000;
    set({ status: state.live ? "ok" : "offline" });
  }
}

/** Start once (idempotent). Safe to call from the bubble and from mountImmerse. */
export function startImmerse() {
  if (started || typeof window === "undefined") return;
  started = true;
  const prefs = read<{ override?: Kind | null; saver?: boolean; volume?: number }>(PREF_KEY) ?? {};
  const q = new URLSearchParams(window.location.search).get("weather") as Kind | null;
  const override =
    q && ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "storm", "haze"].includes(q)
      ? q
      : (prefs.override ?? null);
  const r = getRealism();
  const cached = read<WeatherNow>(WX_KEY);
  const live =
    cached && cached.key === cacheKey(r.lat, r.lng) && Date.now() - cached.at < STALE_MS
      ? cached
      : null; // #318
  set(
    {
      enabled: effectsOn(),
      override,
      live,
      saver: Boolean(prefs.saver),
      volume: typeof prefs.volume === "number" ? prefs.volume : 0.6,
      status: live ? "ok" : "idle",
    },
    { tint: "now" },
  );
  let settle = 0;
  const follow = () => {
    const g = here();
    if (cacheKey(g.lat, g.lng) === lastKey) return;
    window.clearTimeout(settle);
    settle = window.setTimeout(() => void fetchNow(), 1500);
  };
  subscribeRealism(follow);
  placeListener = follow;
  void fetchNow(true);
  timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void fetchNow(true);
  }, REFRESH_MS);
  void timer;
  // #338: low battery and not charging → saver on automatically
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{
      level: number;
      charging: boolean;
      addEventListener: (e: string, fn: () => void) => void;
    }>;
  };
  void nav
    .getBattery?.()
    .then((b) => {
      const check = () => set({ saverAuto: b.level < 0.2 && !b.charging });
      check();
      b.addEventListener("levelchange", check);
      b.addEventListener("chargingchange", check);
    })
    .catch(() => undefined);
}

let placeListener: (() => void) | null = null;
/** The map reports its centre after each move (mountImmerse); the weather follows within ~1.5 s. */
export function setPlace(lat: number, lng: number) {
  place = { lat, lng };
  placeListener?.();
}

export function setOverride(kind: Kind | null) {
  set({ override: kind, previewMs: null }, { tint: "now", persist: true });
}

/** #342: preview a forecast hour: weather from that hour + the dial jumps to its local time. */
export function previewHour(ms: number | null) {
  set({ previewMs: ms, override: null }, { tint: "now", persist: true });
  const r = getRealism();
  setTimeOverride(ms == null ? null : localMinutes(new Date(ms), r.zone));
}

export function setSaver(on: boolean) {
  set({ saver: on }, { persist: true });
}

export function setSound(on: boolean) {
  set({ sound: on });
}

export function setVolume(v: number) {
  set({ volume: Math.min(1, Math.max(0, v)) }, { persist: true });
}

/** #350: the player's Effects switch (remembered). */
export function setEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(FLAG_KEY);
    else localStorage.setItem(FLAG_KEY, "1");
  } catch {
    // ignore
  }
  set({ enabled: on }, { tint: "now" });
}

export function particlesAllowed(s = state): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return s.enabled && !s.saver && !s.saverAuto && !nav.connection?.saveData;
}
