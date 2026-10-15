// NDU-UPG inspect (#04): server side of the inspect tag lookup. Off unless INSPECT_ENABLED=true (or dev).
import { getRequest } from "@tanstack/react-start/server";
import { OVERPASS_URL, overpassInit } from "@/world/overpass";
import { cellOf, overpassJob } from "@/world/realism/osmBuildings";
import type { CellStats } from "@/world/realism/buildingsData";
import { createLimiter, lookupTags, rememberIdTags, statsForCell } from "./tagCache.ts";

export type TagsAnswer =
  | { ok: true; tags: Record<string, string>; source: "cell" | "id"; stats: CellStats | null }
  | { ok: false; reason: "off" | "missing" | "busy"; retryMs?: number };

const limit = createLimiter(30, 60_000);

export function inspectServerEnabled(): boolean {
  return process.env.INSPECT_ENABLED === "true" || Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

function clientKey(): string {
  try {
    const h = getRequest().headers;
    return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "anon";
  } catch {
    return "anon";
  }
}

export async function serveInspectTags(input: { id: number; lat: number; lng: number }): Promise<TagsAnswer> {
  if (!inspectServerEnabled()) return { ok: false, reason: "off" };
  // The id is interpolated into the Overpass QL below — a non-integer would let
  // a crafted client inject query text. Reject anything that is not a positive
  // safe integer before it reaches the query string.
  if (!Number.isSafeInteger(input.id) || input.id <= 0) return { ok: false, reason: "missing" };
  const rl = limit(clientKey());
  if (!rl.ok) return { ok: false, reason: "busy", retryMs: rl.retryMs };
  const cell = cellOf(input.lat, input.lng).key;
  const hit = lookupTags(input.id, cell);
  if (hit) return { ok: true, tags: hit.tags, source: hit.source, stats: statsForCell(hit.cell ?? cell) };
  const tags = await overpassJob(async () => {
    const res = await fetch(OVERPASS_URL, { ...overpassInit(`[out:json][timeout:15];way(${input.id});out tags;`), signal: AbortSignal.timeout(18_000) });
    if (res.status === 429 || res.status >= 500) throw new Error(`overpass ${res.status}`); // → back-off
    if (!res.ok) return null;
    const body = (await res.json()) as { elements?: { id: number; tags?: Record<string, string> }[] };
    return body.elements?.find((e) => e.id === input.id)?.tags ?? null;
  });
  if (tags === undefined) return { ok: false, reason: "busy", retryMs: 15_000 };
  if (!tags) return { ok: false, reason: "missing" };
  return { ok: true, tags: rememberIdTags(input.id, tags), source: "id", stats: statsForCell(cell) };
}
