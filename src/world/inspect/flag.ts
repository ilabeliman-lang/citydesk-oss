// NDU-UPG inspect (#04): feature flag. Tiny and dependency-free: CityBuildings imports it eagerly.
// ON in dev, OFF in production unless the build sets VITE_NDU_INSPECT=on. `?inspect=0|off` hides it
// anywhere, `?inspect=1|on` forces it on, and localStorage `ndu.inspect.off=1` is the player's opt-out.

export const INSPECT_FLAG_KEY = "ndu.inspect.off";
export const INSPECT_HOLD_KEY = "ndu.inspect.hold";

/** Everything the flag reads, injectable so tests can cover every branch. */
export type FlagEnv = {
  server: boolean;
  search: string;
  dev: boolean;
  vars: Record<string, string | undefined>;
  storage: { getItem(k: string): string | null } | null;
};

function liveEnv(): FlagEnv {
  const server = typeof window === "undefined";
  let storage: FlagEnv["storage"] = null;
  try {
    storage = server ? null : window.localStorage;
  } catch {
    storage = null;
  }
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  return {
    server,
    search: server ? "" : window.location.search,
    dev: env.DEV === true,
    vars: env as Record<string, string | undefined>,
    storage,
  };
}

function read(storage: FlagEnv["storage"], key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function inspectAllowed(env: FlagEnv = liveEnv()): boolean {
  if (env.server) return false;
  if (read(env.storage, INSPECT_FLAG_KEY) === "1") return false;
  const q = new URLSearchParams(env.search).get("inspect");
  if (q === "0" || q === "off") return false;
  if (q === "1" || q === "on") return true;
  if (env.dev) return true;
  return env.vars.VITE_NDU_INSPECT === "on";
}

/** Tap-first mode: a plain tap on a building opens the inspect card instead of entering. */
export function inspectTapFirst(env: FlagEnv = liveEnv()): boolean {
  if (!inspectAllowed(env)) return false;
  return new URLSearchParams(env.search).get("inspect-tap") === "1" || env.vars.VITE_NDU_INSPECT_TAP === "on";
}

/** Long-press hold in ms: the player can pick 300 / 450 / 700 (default 450). */
export function holdMs(env: FlagEnv = liveEnv()): number {
  const v = Number(read(env.storage, INSPECT_HOLD_KEY));
  return v === 300 || v === 450 || v === 700 ? v : 450;
}
