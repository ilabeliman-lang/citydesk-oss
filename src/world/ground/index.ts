import { capForTier, tilesCovering } from "./heightCache.ts";
import { setGroundHandle } from "./hooks.ts";
import { createProvider, type GroundMap } from "./provider.ts";
import type { GroundHandle, GroundStats, Spot } from "./types.ts";

/**
 * NDU realism 02 T3: mount the ground provider (own lazy chunk, loaded from immerse/index.ts only
 * when groundAllowed() && groundOn()). Prefetches DEM tiles on moveend around the view (life radius
 * 420 m), publishes the handle through ground/hooks.ts, exposes window.__nduGround in DEV.
 */

export const DEM_TEMPLATE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

type HostMap = GroundMap & {
  on: (ev: string, fn: (...a: unknown[]) => void) => void;
  off: (ev: string, fn: (...a: unknown[]) => void) => void;
  getCenter: () => { lng: number; lat: number };
  triggerRepaint?: () => void;
};

export function mountGround(input: unknown, tier: string, template = DEM_TEMPLATE): () => void {
  const map = input as HostMap;
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const p = createProvider(map, template, capForTier(tier, mobile) || 4, reduced);
  const scans = new Map<string, { id: string; baseZ: number; targetZ: number; err: number }>();
  const extra: Spot[] = [];
  let bakeMs = 0;
  let playerDeck: number | null = null;

  const prefetch = () => {
    if (p.mode() !== "terrain3d") return;
    const c = map.getCenter();
    const want = tilesCovering(c.lng, c.lat, 420);
    for (const s of extra) want.push(...tilesCovering(s.lng, s.lat, 60));
    p.cache.ensure(want);
  };
  const onMoveEnd = () => prefetch();
  const onGround = () => {
    p.refreshMode();
    prefetch();
  };
  map.on("moveend", onMoveEnd);
  window.addEventListener("ndu-ground", onGround);
  const offRepaint = p.subscribe(() => map.triggerRepaint?.());
  prefetch();

  const handle: GroundHandle = {
    mode: p.mode,
    version: p.version,
    heightAt: p.heightAt,
    anchorAt: p.anchorAt,
    clusterZ: p.clusterZ,
    normalAt: p.normalAt,
    subscribe: p.subscribe,
    onPlayerSpot: () => {
      playerDeck = null; // decks (T10) not solved yet: the avatar marker already sits on drawn terrain
    },
    playerDeckZ: () => playerDeck,
    reportScan: (s) => {
      if (scans.size > 200) scans.clear();
      scans.set(s.id, s);
    },
    want: (s) => {
      if (extra.length > 64) extra.shift();
      extra.push(s);
      if (p.mode() === "terrain3d") p.cache.ensure(tilesCovering(s.lng, s.lat, 60));
    },
    noteBake: (ms) => {
      bakeMs = ms;
    },
    stats: (): GroundStats => ({
      mode: p.mode(),
      version: p.version(),
      tiles: p.cache.tiles,
      inflight: p.cache.pending,
      failures: p.cache.failures,
      bakeMs,
      scans: [...scans.values()],
    }),
  };
  setGroundHandle(handle);
  if (import.meta.env?.DEV) (window as Window & { __nduGround?: unknown }).__nduGround = handle;

  return () => {
    map.off("moveend", onMoveEnd);
    window.removeEventListener("ndu-ground", onGround);
    offRepaint();
    setGroundHandle(null);
    if (import.meta.env?.DEV) delete (window as Window & { __nduGround?: unknown }).__nduGround;
    p.dispose();
  };
}
