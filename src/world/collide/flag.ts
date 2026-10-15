/**
 * NDU-UPG collide: feature flag for avatar collision + real doors (default OFF).
 * ?collide=1|0 (persists to localStorage "ndu.collide.v1"); kill switch localStorage "ndu.collide.off"="1" wins;
 * env VITE_NDU_COLLIDE=on|off; otherwise off (dev default on). Pure, no DOM at import time.
 */
const KEY = "ndu.collide.v1";
const KILL = "ndu.collide.off";
let memo: boolean | null = null;

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const g = globalThis as unknown as { location?: { search?: string }; localStorage?: Store; window?: unknown };

function env(): { mode?: string; flag?: string } {
  try {
    const e = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
    if (!e) return {};
    return { mode: e.DEV ? "dev" : "prod", flag: typeof e.VITE_NDU_COLLIDE === "string" ? e.VITE_NDU_COLLIDE : undefined };
  } catch {
    return {};
  }
}

function query(name: string): string | null {
  try {
    return new URLSearchParams(g.location?.search ?? "").get(name);
  } catch {
    return null;
  }
}

export function resetCollideFlag(): void {
  memo = null;
}

export function collideEnabled(): boolean {
  if (memo !== null) return memo;
  if (!g.location) return false; // SSR: never memoise the server answer
  const store = g.localStorage;
  let on: boolean | null = null;
  const q = query("collide");
  if (q === "1" || q === "0") {
    on = q === "1";
    try {
      store?.setItem(KEY, q);
    } catch {
      /* private mode */
    }
  } else {
    try {
      const saved = store?.getItem(KEY);
      if (saved === "1" || saved === "0") on = saved === "1";
    } catch {
      /* ignore */
    }
  }
  if (on === null) {
    const e = env();
    if (e.flag === "on") on = true;
    else if (e.flag === "off") on = false;
    else on = false; // default off everywhere until QA signs off (prompt §3 dev-default deferred)
  }
  try {
    if (store?.getItem(KILL) === "1") on = false;
  } catch {
    /* ignore */
  }
  memo = on;
  return on;
}

/** Sub-flags: collide-debug (default off), collide-camera / collide-dyn (default on). */
export function collideSubFlag(name: "debug" | "camera" | "dyn"): boolean {
  const v = query(`collide-${name}`);
  if (name === "debug") return v === "1";
  return v !== "0";
}
