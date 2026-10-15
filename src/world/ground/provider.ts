import { HeightCache } from "./heightCache.ts";
import { ease } from "./pose.ts";
import type { GroundMode, HeightSample, Normal, Spot } from "./types.ts";

/**
 * NDU realism 02 T3: the ground provider (PLAN §3.1, §5.2).
 * Rule: anchor each cluster to what MapLibre DRAWS at one point, shape it with DEM deltas.
 *   anchorAt   terrain3d: queryTerrainElevation, eased (τ 0.25 s, snap > 30 m); "drawn 0 while the
 *              DEM says |h| > 1 m" means the drawn tile isn't loaded yet → keep the last anchor
 *   heightAt   DEM height (CPU cache); when the tile isn't cached → last value for that cell
 *   clusterZ   anchor + (dem(p) − dem(anchor))
 */

export const ANCHOR_TAU_S = 0.25;
export const SNAP_M = 30;

/** Pure: the anchor target from the drawn value, the DEM value and the previous anchor. */
export function anchorTarget(drawn: number | null | undefined, dem: number | null, prev: number | null): { h: number; src: HeightSample["src"]; ok: boolean } {
  const notLoaded = drawn === 0 && dem != null && Math.abs(dem) > 1;
  if (drawn != null && Number.isFinite(drawn) && !notLoaded) return { h: drawn, src: "map", ok: true };
  if (prev != null) return { h: prev, src: "last", ok: false };
  return { h: drawn != null && Number.isFinite(drawn) ? drawn : 0, src: "last", ok: false };
}

/** Pure: one easing step of the anchor toward its target. */
export function easeAnchor(cur: number | null, target: number, dt: number, reduced = false): number {
  if (cur == null || reduced || Math.abs(target - cur) > SNAP_M) return target;
  return cur + (target - cur) * ease(dt, ANCHOR_TAU_S);
}

/** Pure: anchor + DEM deltas (NaN-safe: unknown points get the anchor itself). */
export function clusterHeights(anchor: number, demAnchor: number | null, dems: (number | null)[], exaggeration = 1): Float32Array {
  const out = new Float32Array(dems.length);
  for (let i = 0; i < dems.length; i += 1) {
    const d = dems[i];
    out[i] = demAnchor != null && d != null && Number.isFinite(d) ? anchor + (d - demAnchor) * exaggeration : anchor;
  }
  return out;
}

export type GroundMap = {
  getTerrain?: () => unknown;
  queryTerrainElevation?: (ll: [number, number]) => number | null;
  isSourceLoaded?: (id: string) => boolean;
};

export type GroundProvider = {
  cache: HeightCache;
  mode: () => GroundMode;
  version: () => number;
  heightAt: (lng: number, lat: number) => HeightSample;
  anchorAt: (lng: number, lat: number) => HeightSample;
  clusterZ: (anchor: Spot, pts: Spot[]) => Float32Array;
  normalAt: (lng: number, lat: number) => Normal | null;
  subscribe: (fn: () => void) => () => void;
  /** Called when `ndu-ground` fires (terrain on/off). */
  refreshMode: () => void;
  dispose: () => void;
};

const cellKey = (lng: number, lat: number) => `${Math.round(lng * 2e4)},${Math.round(lat * 2e4)}`; // ~5 m cells

export function createProvider(map: GroundMap, template: string, cap: number, reduced = false): GroundProvider {
  const cache = new HeightCache(template, cap);
  const last = new Map<string, number>();
  const anchors = new Map<string, { h: number; t: number }>();
  const subs = new Set<() => void>();
  let mode: GroundMode = "flat";
  let version = 0;
  const exag = () => {
    try {
      const t = map.getTerrain?.() as { exaggeration?: number } | null | undefined;
      return t?.exaggeration ?? 1;
    } catch {
      return 1;
    }
  };
  const emit = () => {
    version += 1;
    for (const fn of subs) {
      try {
        fn();
      } catch {
        // keep going
      }
    }
  };
  const refreshMode = () => {
    let on = false;
    try {
      on = Boolean(map.getTerrain?.());
    } catch {
      on = false;
    }
    const next: GroundMode = on ? "terrain3d" : "flat";
    if (next !== mode) {
      mode = next;
      anchors.clear();
      emit();
    }
  };
  refreshMode();
  const offCache = cache.subscribe(emit);

  const heightAt = (lng: number, lat: number): HeightSample => {
    const h = cache.sample(lng, lat);
    const k = cellKey(lng, lat);
    if (h != null) {
      if (last.size > 4000) last.clear();
      last.set(k, h);
      return { h: h * exag(), ok: true, src: "dem" };
    }
    const prev = last.get(k);
    return prev != null ? { h: prev * exag(), ok: false, src: "last" } : { h: 0, ok: false, src: "last" };
  };

  const anchorAt = (lng: number, lat: number): HeightSample => {
    if (mode !== "terrain3d") return { h: 0, ok: true, src: "flat" };
    let drawn: number | null = null;
    try {
      drawn = map.queryTerrainElevation?.([lng, lat]) ?? null;
    } catch {
      drawn = null;
    }
    const dem = cache.sample(lng, lat);
    const k = cellKey(lng, lat);
    const prev = anchors.get(k);
    const tgt = anchorTarget(drawn, dem != null ? dem * exag() : null, prev?.h ?? null);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const h = easeAnchor(prev?.h ?? null, tgt.h, prev ? (now - prev.t) / 1000 : 0, reduced);
    if (anchors.size > 2000) anchors.clear();
    anchors.set(k, { h, t: now });
    return { h, ok: tgt.ok && Math.abs(h - tgt.h) < 0.01, src: tgt.src };
  };

  return {
    cache,
    mode: () => mode,
    version: () => version,
    heightAt,
    anchorAt,
    clusterZ: (anchor, pts) => {
      const a = anchorAt(anchor.lng, anchor.lat).h;
      const da = cache.sample(anchor.lng, anchor.lat);
      return clusterHeights(a, da, pts.map((p) => cache.sample(p.lng, p.lat)), exag());
    },
    normalAt: (lng, lat) => cache.normal(lng, lat),
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    refreshMode,
    dispose: () => {
      offCache();
      subs.clear();
      cache.dispose();
    },
  };
}
