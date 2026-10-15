/**
 * NDU-UPG props: feature flag. VITE_NDU_PROPS = off (default) | beta | on.
 *   ?props=1 forces on, ?props=0 forces off, localStorage ndu.props.off="1" turns it off.
 *   beta needs ?props=1. Alias-free + DOM-guarded so node tests can import it.
 */

export type PropsMode = "off" | "beta" | "on";

let envOverride: string | undefined;
/** Test hook: pretend VITE_NDU_PROPS has this value (undefined = read the real env). */
export function __setPropsEnv(v: string | undefined) {
  envOverride = v;
}

function rawEnv(): string | undefined {
  if (envOverride !== undefined) return envOverride;
  try {
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_NDU_PROPS;
  } catch {
    return undefined;
  }
}

export function propsMode(): PropsMode {
  const v = String(rawEnv() ?? "").trim().toLowerCase();
  return v === "on" || v === "beta" ? v : "off";
}

export function propsAllowed(): boolean {
  const g = globalThis as unknown as { location?: { search?: string }; localStorage?: { getItem(k: string): string | null } };
  let q: string | null = null;
  try {
    q = new URLSearchParams(g.location?.search ?? "").get("props");
  } catch {
    q = null;
  }
  if (q === "0") return false;
  if (q === "1") return true;
  try {
    if (g.localStorage?.getItem("ndu.props.off") === "1") return false;
  } catch {
    // storage blocked
  }
  return propsMode() === "on";
}
