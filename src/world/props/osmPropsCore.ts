import { encodeCell } from "./codec.ts";
import { inferProps, type BuildingRings } from "./infer.ts";
import { parseProps, propsQuery } from "./parse.ts";
import type { CellBox, CellPayload, OsmEl } from "./types.ts";

/**
 * NDU-UPG props: server core with injected I/O, so node tests run it without TanStack or the network.
 * Memory LRU (160 cells / 24 h) · ONE upstream request at a time · concurrent asks for a cell share one
 * job · exponential back-off 20 s → 10 min after a failure (Overpass etiquette).
 */

export type PropsAnswer = { ok: true; cell: string; data: CellPayload } | { ok: false; cell: string; retryMs: number };
export type OverpassBody = { elements?: OsmEl[]; osm3s?: { timestamp_osm_base?: string } };
export type PropsDeps = {
  /** Run an Overpass QL query; resolve null on 429/5xx/timeout. */
  fetchOverpass: (query: string) => Promise<OverpassBody | null>;
  /** Building outer rings for exclusion (optional; [] in P0). */
  buildings?: (cellKey: string) => BuildingRings;
  now?: () => number;
  unlitRoads?: boolean;
  ttlMs?: number;
  maxCells?: number;
};
export type Cell = CellBox & { key: string };

export function createPropsService(deps: PropsDeps) {
  const now = deps.now ?? Date.now;
  const TTL = deps.ttlMs ?? 24 * 3600_000;
  const MAX = deps.maxCells ?? 160;
  const cache = new Map<string, { at: number; data: CellPayload }>();
  const pending = new Map<string, Promise<CellPayload | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight = 0;
  let coolUntil = 0;
  let backoff = 0;
  const stats = { upstream: 0, hits: 0, misses: 0, failures: 0 };

  const fail = () => {
    stats.failures += 1;
    backoff = Math.min(backoff ? backoff * 2 : 20_000, 10 * 60_000);
    coolUntil = now() + backoff;
  };

  async function load(cell: Cell, zone: string): Promise<CellPayload | null> {
    if (now() < coolUntil) return null;
    inFlight += 1;
    stats.upstream += 1;
    try {
      const body = await deps.fetchOverpass(propsQuery(cell));
      if (!body) {
        fail();
        return null;
      }
      backoff = 0;
      const parsed = parseProps(body.elements ?? [], cell, zone, body.osm3s?.timestamp_osm_base ?? null);
      const recs = inferProps(parsed, deps.buildings?.(cell.key) ?? [], { unlitRoads: deps.unlitRoads ?? false });
      return encodeCell(recs, cell.key, parsed.origin, { fetchedAt: now(), osmBase: parsed.osmBase });
    } catch {
      fail();
      return null;
    } finally {
      inFlight -= 1;
    }
  }

  async function propsForCell(cell: Cell, zone: string): Promise<PropsAnswer> {
    const hit = cache.get(cell.key);
    if (hit && now() - hit.at < TTL) {
      stats.hits += 1;
      cache.delete(cell.key); // LRU touch
      cache.set(cell.key, hit);
      return { ok: true, cell: cell.key, data: hit.data };
    }
    stats.misses += 1;
    if (now() < coolUntil) return { ok: false, cell: cell.key, retryMs: coolUntil - now() };
    let job = pending.get(cell.key);
    if (!job) {
      job = queue.then(() => load(cell, zone));
      queue = job.catch(() => null);
      pending.set(cell.key, job);
      void job.finally(() => pending.delete(cell.key)).catch(() => undefined);
    }
    const data = await job;
    if (!data) return { ok: false, cell: cell.key, retryMs: Math.max(15_000, coolUntil - now()) };
    cache.set(cell.key, { at: now(), data });
    while (cache.size > MAX) cache.delete(cache.keys().next().value as string);
    return { ok: true, cell: cell.key, data };
  }

  return {
    propsForCell,
    /** Seed the memory cache (Postgres read-through, P5). */
    prime: (key: string, data: CellPayload, at = now()) => cache.set(key, { at, data }),
    stats: () => ({ ...stats, inFlight, cached: cache.size, coolMs: Math.max(0, coolUntil - now()) }),
  };
}
