// NDU-UPG inspect (#04): client tag cache (LRU 500) with in-flight dedupe and abort on close.
import type { CellStats } from "../realism/buildingsData.ts";

export type TagResult = { tags: Record<string, string>; stats: CellStats | null } | { error: "off" | "missing" | "busy" | "failed" };

const MAX = 500;
const lru = new Map<number, { tags: Record<string, string>; stats: CellStats | null }>();
const inflight = new Map<number, Promise<TagResult>>();

export async function fetchTags(id: number, lat: number, lng: number, signal?: AbortSignal): Promise<TagResult> {
  const hit = lru.get(id);
  if (hit) {
    lru.delete(id);
    lru.set(id, hit);
    return hit;
  }
  let job = inflight.get(id);
  if (!job) {
    job = (async (): Promise<TagResult> => {
      try {
        const { inspectTags } = await import("./tagsFn");
        const a = await inspectTags({ data: { id, lat, lng } });
        if (!a.ok) return { error: a.reason };
        const v = { tags: a.tags, stats: a.stats };
        lru.set(id, v);
        while (lru.size > MAX) lru.delete(lru.keys().next().value as number);
        return v;
      } catch {
        return { error: "failed" };
      }
    })().finally(() => inflight.delete(id));
    inflight.set(id, job);
  }
  if (!signal) return job;
  return Promise.race([job, new Promise<TagResult>((_, rej) => signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true }))]);
}
