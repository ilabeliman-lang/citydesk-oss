// NDU-UPG inspect (#04): server-side caches for public building tags + a tiny rate limiter.
// Filled as a side effect of the realism Overpass cell fetch (no extra request); only allow-listed
// tags are ever stored. Pure (no I/O) so it unit-tests.
import { resolveHeight } from "../realism/heights.ts";
import type { CellStats } from "../realism/buildingsData.ts";
import { parseStartDate } from "./dates.ts";
import { filterPublicTags } from "./tagPolicy.ts";

type Tags = Record<string, string>;
type El = { type: string; id: number; tags?: Record<string, string | undefined> };

export const MAX_TAG_CELLS = 48;
export const MAX_BY_ID = 2000;
export const TAG_TTL_MS = 24 * 3600_000;

const cells = new Map<string, { at: number; byId: Map<number, Tags>; stats?: CellStats }>();
const byId = new Map<number, { at: number; tags: Tags }>();

export function rememberCellTags(cellKey: string, elements: El[], now = Date.now()): void {
  const m = new Map<number, Tags>();
  for (const el of elements) {
    if (el.type !== "way" || !el.tags || !(el.tags.building || el.tags["building:part"])) continue;
    m.set(el.id, filterPublicTags(el.tags));
  }
  cells.delete(cellKey);
  cells.set(cellKey, { at: now, byId: m });
  while (cells.size > MAX_TAG_CELLS) cells.delete(cells.keys().next().value as string);
}

export function rememberIdTags(id: number, tags: Record<string, string | undefined>, now = Date.now()): Tags {
  const t = filterPublicTags(tags);
  byId.delete(id);
  byId.set(id, { at: now, tags: t });
  while (byId.size > MAX_BY_ID) byId.delete(byId.keys().next().value as number);
  return t;
}

/** Cached public tags for a way: the hinted cell first, then any cached cell, then the by-id cache. */
export function lookupTags(id: number, cellKey?: string, now = Date.now()): { tags: Tags; source: "cell" | "id"; cell?: string } | null {
  const fresh = (at: number) => now - at < TAG_TTL_MS;
  if (cellKey) {
    const c = cells.get(cellKey);
    const t = c && fresh(c.at) ? c.byId.get(id) : undefined;
    if (t) return { tags: t, source: "cell", cell: cellKey };
  }
  for (const [k, c] of cells) {
    if (!fresh(c.at)) continue;
    const t = c.byId.get(id);
    if (t) return { tags: t, source: "cell", cell: k };
  }
  const b = byId.get(id);
  return b && fresh(b.at) ? { tags: b.tags, source: "id" } : null;
}

const pct = (s: number[], q: number) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] : 0);

/** Height / age distribution of a cached cell (lazy, from tags alone). */
export function statsForCell(cellKey: string): CellStats | null {
  const c = cells.get(cellKey);
  if (!c) return null;
  if (c.stats) return c.stats;
  const hs: number[] = [];
  const ys: number[] = [];
  for (const t of c.byId.values()) {
    hs.push(resolveHeight(t).height);
    const y = parseStartDate(t.start_date ?? t["building:start_date"] ?? t.construction_date)?.year;
    if (y) ys.push(y);
  }
  hs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  c.stats = { n: hs.length, hP50: pct(hs, 0.5), hP90: pct(hs, 0.9), hP99: pct(hs, 0.99), hMax: hs.at(-1) ?? 0, yearN: ys.length, yearP05: ys.length ? pct(ys, 0.05) : null };
  return c.stats;
}

/** Sliding one-minute window per key. */
export function createLimiter(max = 30, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): { ok: true } | { ok: false; retryMs: number } => {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return { ok: false, retryMs: windowMs - (now - list[0]) };
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
    return { ok: true };
  };
}

export function _resetTagCaches(): void {
  cells.clear();
  byId.clear();
}
