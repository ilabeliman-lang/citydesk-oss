import { getQuality, onQuality } from "@/world/perf/degrade";
import { getTier, onTier } from "@/world/perf/tier";
import { getRealism, subscribeRealism } from "@/world/realism/state";
import { cellOf } from "@/world/realism/osmBuildings";
import { getImmerse, subscribeImmerse } from "@/world/immerse/store";
import { propsAllowed } from "./flag.ts";
import { decodeCell } from "./codec.ts";
import { osmProps } from "./osmProps.ts";
import { propFx } from "./weatherFx.ts";
import type { PropsHostMap, PropsLayerApi } from "./propsLayer.ts";
import type { PropRecord } from "./types.ts";

/**
 * NDU-UPG props (realism 03): client mount. Off unless VITE_NDU_PROPS=on (or beta + ?props=1).
 * No three.js here — `propsLayer.ts` (three) is imported lazily the first time a cell has props.
 * Streams ~330 m cells around the view (Tier A 350 m / 9 cells, Tier B 200 m / 4), one request at a
 * time, closest first, honouring the server's retryMs. Tier C: nothing (2D props are P6).
 */

export { propsAllowed } from "./flag.ts";
export type { PropRecord } from "./types.ts";

type MountMap = PropsHostMap & {
  on: (ev: string, fn: (...a: unknown[]) => void) => void;
  off: (ev: string, fn: (...a: unknown[]) => void) => void;
};

const RADIUS = { A: 350, B: 200 } as const;
const MAX_CELLS = { A: 9, B: 4 } as const;
const MIN_ZOOM = { A: 16, B: 16.5 } as const;
const SETTLE_MS = 700;

let mounted: MountMap | null = null;

function wantedCells(lat: number, lng: number, radius: number) {
  const c = cellOf(lat, lng);
  const [row, col] = c.key.split(":").map(Number);
  const D = 0.003;
  const mLat = 111320;
  const mLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const out: { key: string; lat: number; lng: number; d: number }[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const k = col + dc;
      // distance from the view centre to the cell rectangle
      const s = r * D, n = (r + 1) * D, w = k * D, e = (k + 1) * D;
      const dy = lat < s ? (s - lat) * mLat : lat > n ? (lat - n) * mLat : 0;
      const dx = lng < w ? (w - lng) * mLng : lng > e ? (lng - e) * mLng : 0;
      const d = Math.hypot(dx, dy);
      if (d <= radius) out.push({ key: `${r}:${k}`, lat: (s + n) / 2, lng: (w + e) / 2, d });
    }
  return out.sort((a, b) => a.d - b.d);
}

/** Cells overlap by a margin, so the same OSM node can come back twice: keep the first. */
function merge(cells: Map<string, PropRecord[]>): PropRecord[] {
  const seen = new Set<string>();
  const out: PropRecord[] = [];
  for (const list of cells.values())
    for (const r of list) {
      const k = r.src === "osm" ? `${r.osmType}${r.osmId}:${r.archetype}:${r.variant}` : `${r.kind}:${Math.round(r.lng * 1e5)}:${Math.round(r.lat * 1e5)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
  return out;
}

export function mountProps(map: MountMap): () => void {
  if (!propsAllowed()) return () => undefined;
  if (mounted === map || map.getLayer("ndu-props")) return () => undefined; // HMR / StrictMode double mount
  let tier = getTier().tier;
  if (tier === "C") return () => undefined;
  mounted = map;
  let dead = false;
  let layer: PropsLayerApi | null = null;
  let loadingLayer: Promise<void> | null = null;
  const cells = new Map<string, PropRecord[]>(); // insertion order = LRU
  const failedUntil = new Map<string, number>();
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const offs: (() => void)[] = [];
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pushFx = () => {
    if (!layer) return;
    const fx = getImmerse().fx;
    layer.setFx(propFx(fx, reducedMotion), { cloud: fx.cloud, fog: fx.fog, rain: fx.rain });
  };
  const pushQuality = () => {
    const q = getQuality();
    layer?.setQuality({ step: q.step, lights: q.tier === "A" && q.step < 2 ? 4 : 0 });
  };

  const ensureLayer = async () => {
    if (layer || dead) return;
    if (!loadingLayer)
      loadingLayer = import("./propsLayer.ts").then(({ addPropsLayer }) => {
        if (dead || layer) return;
        const t = tier === "A" ? "A" : "B";
        layer = addPropsLayer(map, t);
        pushQuality();
        pushFx();
        if (import.meta.env.DEV) (window as unknown as { __nduProps?: unknown }).__nduProps = { stats: () => ({ cells: cells.size, ...layer?.stats() }), debug: () => layer?.debug?.() };
      });
    await loadingLayer;
  };

  const publish = async () => {
    if (!cells.size) return;
    await ensureLayer();
    layer?.setRecords(merge(cells));
  };

  const pump = async () => {
    if (busy || dead || tier === "C") return;
    if (map.getZoom() < MIN_ZOOM[tier]) return;
    const c = map.getCenter();
    const save = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
    let want = wantedCells(c.lat, c.lng, RADIUS[tier]);
    if (save && tier === "B") want = want.slice(0, 1);
    const next = want.find((w) => !cells.has(w.key) && (failedUntil.get(w.key) ?? 0) < Date.now());
    // LRU touch for cells still in view
    for (const w of want) {
      const hit = cells.get(w.key);
      if (hit) {
        cells.delete(w.key);
        cells.set(w.key, hit);
      }
    }
    if (!next) {
      // everything wanted is cooling down after a failure: come back when the first one may retry
      const waits = want.filter((w) => !cells.has(w.key)).map((w) => (failedUntil.get(w.key) ?? 0) - Date.now());
      if (waits.length) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void pump(), Math.max(1000, Math.min(...waits) + 50));
      }
      return;
    }
    busy = true;
    try {
      const answer = await osmProps({ data: { lat: next.lat, lng: next.lng } });
      if (dead) return;
      if (!answer.ok) {
        failedUntil.set(next.key, Date.now() + Math.min(answer.retryMs, 60_000));
      } else {
        cells.set(answer.cell, decodeCell(answer.data));
        while (cells.size > MAX_CELLS[tier]) cells.delete(cells.keys().next().value as string);
        await publish();
      }
    } catch {
      failedUntil.set(next.key, Date.now() + 30_000);
    } finally {
      busy = false;
    }
    if (!dead) void pump(); // next closest cell
  };

  const onMoveEnd = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pump(), SETTLE_MS);
  };
  map.on("moveend", onMoveEnd);
  offs.push(() => map.off("moveend", onMoveEnd));
  offs.push(subscribeRealism(() => getRealism())); // keep the realism store hydrated; the layer reads it per frame
  offs.push(subscribeImmerse(pushFx));
  offs.push(onQuality(pushQuality));
  offs.push(
    onTier((s) => {
      tier = s.tier;
      if (tier === "C") {
        layer?.dispose();
        layer = null;
        loadingLayer = null;
        return;
      }
      while (cells.size > MAX_CELLS[tier]) cells.delete(cells.keys().next().value as string);
      if (layer) layer.setTier(tier === "A" ? "A" : "B");
      else void publish();
    }),
  );
  const onLightning = () => {
    if (!reducedMotion) layer?.pulse();
  };
  window.addEventListener("ndu:lightning", onLightning);
  offs.push(() => window.removeEventListener("ndu:lightning", onLightning));
  onMoveEnd();

  return () => {
    dead = true;
    if (timer) clearTimeout(timer);
    offs.forEach((f) => f());
    layer?.dispose();
    layer = null;
    if (mounted === map) mounted = null;
  };
}
