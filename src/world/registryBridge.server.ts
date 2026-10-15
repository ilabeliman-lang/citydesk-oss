/**
 * Server-only bridge from City Desk to the City Desk Map Registry (NEURA Spaces, 127.0.0.1:4320).
 * The shared token lives in a 0600 file on this host and is never sent to a browser.
 * Spaces rejects bridge calls that arrive through the public office proxy.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SPACES_BRIDGE_URL || "http://127.0.0.1:4320";
const TOKEN_FILES = [process.env.NEURA_STACK_DIR, join(homedir(), "neura-stack")]
  .filter(Boolean)
  .map((dir) => join(dir as string, "spaces", ".citydesk_bridge_token"));

export function bridgeToken(): string {
  for (const file of TOKEN_FILES) {
    try {
      const t = readFileSync(file, "utf8").trim();
      if (t) return t;
    } catch {
      // try the next location
    }
  }
  return "";
}

/** Constant-time check of an incoming bridge header (used by /api/trip-route). */
export function bridgeAllowed(header: string | null): boolean {
  const want = bridgeToken();
  if (!want || !header || header.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T | null> {
  const token = bridgeToken();
  if (!token) return null;
  try {
    const res = await fetch(BASE + path, {
      method: init?.method ?? "GET",
      headers: { "x-citydesk-bridge": token, "content-type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok) return { ...(j as object), ok: false } as T;
    return j;
  } catch {
    return null;
  }
}

export type RegistryPlace = {
  id: number;
  label: string;
  label_source: string;
  kind: string;
  icon: string;
  lat: number;
  lng: number;
  verified: boolean;
  osm: string | null;
  tags?: Record<string, string | undefined>;
};

export async function registryPlacesNear(lat: number, lng: number, radius = 700): Promise<RegistryPlace[]> {
  const j = await call<{ ok: boolean; places?: RegistryPlace[] }>(`/spaces/registry/bridge/places?lat=${lat}&lng=${lng}&radius=${radius}`);
  return j?.ok && j.places ? j.places : [];
}

export const bridge = {
  me: (cdUser: string) => call<Record<string, unknown>>(`/spaces/registry/bridge/me?cd_user=${encodeURIComponent(cdUser)}`),
  presence: (cdUser: string) => call<{ ok: boolean; linked?: boolean; presence?: TripAvatar[] }>(`/spaces/registry/bridge/presence?cd_user=${encodeURIComponent(cdUser)}`),
  link: (cdUser: string, code: string, cdName: string) => call<{ ok: boolean; handle?: string; error?: string }>("/spaces/registry/bridge/link", { method: "POST", body: { cd_user: cdUser, code, cd_name: cdName } }),
  unlink: (cdUser: string) => call<{ ok: boolean }>("/spaces/registry/bridge/unlink", { method: "POST", body: { cd_user: cdUser } }),
};

export type TripAvatar = { handle: string; mine: boolean; label: string; trip: string | null; lat: number; lng: number; moving: boolean; updated_at: string };
