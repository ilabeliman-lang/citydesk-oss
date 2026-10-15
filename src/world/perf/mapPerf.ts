import { getQuality, onQuality, perfStats, simulateFps, startLadder } from "./degrade";
import type { Quality } from "./ladder";
import { getTier, optBack, setTier } from "./tier";
import { pitchCapFor } from "../orbit/cameraOwner"; // NDU-FP: FP widens the cap while it owns the camera

/**
 * NDU-UPG 502/503/507/508: applies the session tier and the degrade ladder to the MapLibre map.
 * Structural map type so it fits both the old hand-typed CityMap and maplibre-gl's own Map.
 */
type Expr = unknown[] | boolean | null | undefined;
export type PerfMap = {
  getContainer: () => HTMLElement;
  getCanvas: () => HTMLCanvasElement;
  getCenter: () => { lng: number; lat: number };
  getStyle: () => { layers?: { id: string; type: string; filter?: Expr }[] } | undefined;
  getLayer: (id: string) => unknown;
  getFilter: (id: string) => Expr;
  setFilter: (id: string, filter: Expr) => unknown;
  setLayoutProperty: (id: string, name: string, value: unknown) => unknown;
  getLayoutProperty: (id: string, name: string) => unknown;
  setMaxPitch: (pitch: number) => unknown;
  setPixelRatio?: (ratio: number) => unknown;
  on: (event: string, fn: () => void) => unknown;
  off: (event: string, fn: () => void) => unknown;
  once: (event: string, fn: () => void) => unknown;
};

const FULL_PITCH = 85; // CityBuildings' maxPitch
const TIER_C_PITCH = 60; // flatter view: far fewer tiles and extrusions on screen
const EXTRUDED = ["building-3d"];

const dpr = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
const pixelRatioFor = (tier: "A" | "B" | "C") => (tier === "A" ? dpr() : Math.min(dpr(), tier === "B" ? 2 : 1.5));

/** Extra MapLibre constructor options for the session tier (Tier A = MapLibre defaults, i.e. today's map). */
export type TierMapOptions = {
  pixelRatio?: number;
  maxTileCacheSize?: number;
  maxTileCacheZoomLevels?: number;
  refreshExpiredTiles?: boolean;
  fadeDuration?: number;
};

export function tierMapOptions(): TierMapOptions {
  const { tier } = getTier();
  if (tier === "A") return {};
  // #507: vector tiles cost roughly 0.3-0.5 MB each once parsed; these caps keep the cache near the 64 MB budget.
  return {
    pixelRatio: pixelRatioFor(tier),
    maxTileCacheSize: tier === "B" ? 160 : 96,
    maxTileCacheZoomLevels: tier === "B" ? 3 : 2,
    refreshExpiredTiles: false,
    fadeDuration: tier === "C" ? 0 : 300,
  };
}

function metres(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const k = 111320;
  return Math.hypot((a.lng - b.lng) * k * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * k);
}

function chip(onRestore: () => void): HTMLElement {
  const root = document.createElement("div");
  root.dataset.nduPerfChip = "1";
  root.setAttribute("role", "status");
  root.style.cssText =
    "position:absolute;right:max(8px,env(safe-area-inset-right));top:calc(env(safe-area-inset-top,0px) + 8px);z-index:20;display:flex;align-items:center;gap:2px;color:#1a1511";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg>';
  btn.setAttribute("aria-label", "Light map is on. Restore the full 3D map");
  btn.title = "Light map is on. Tap for the full map";
  btn.style.cssText =
    "width:44px;height:44px;padding:0;border:0;border-radius:999px;background:linear-gradient(#f3a35c,#e8843a);color:#1a1511;display:grid;place-items:center;box-shadow:0 3px 0 #9c4f17,0 5px 10px rgba(0,0,0,.35);cursor:pointer;transition:transform .08s,box-shadow .08s";
  btn.onpointerdown = () => {
    btn.style.transform = "translateY(3px)";
    btn.style.boxShadow = "0 0 0 #9c4f17,0 2px 4px rgba(0,0,0,.35)";
  };
  btn.onpointerup = btn.onpointerleave = () => {
    btn.style.transform = "";
    btn.style.boxShadow = "0 3px 0 #9c4f17,0 5px 10px rgba(0,0,0,.35)";
  };
  btn.onclick = onRestore;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Hide this note");
  close.style.cssText = "min-height:44px;min-width:44px;border:0;background:transparent;color:#f6efe2;font:700 18px sans-serif;cursor:pointer";
  close.onclick = () => root.remove();
  root.append(btn, close);
  if (!document.getElementById("ndu-perf-css")) {
    const css = document.createElement("style");
    css.id = "ndu-perf-css";
    // #524: blur is expensive on weak GPUs; Tier C falls back to solid panels. Reduced motion: no chip animation.
    css.textContent =
      "@keyframes ndu-chip-in{from{opacity:0}to{opacity:1}}" +
      'html[data-ndu-tier="C"] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
      "@media (prefers-reduced-motion: reduce){[data-ndu-perf-chip]{animation:none!important}}";
    document.head.append(css);
  }
  return root;
}

/** Wire tiering + the degrade ladder into a loaded map. Returns detach. */
export function attachMapPerf(map: PerfMap): () => void {
  if (typeof window === "undefined") return () => undefined;
  performance.mark("ndu:map-load");
  map.once("idle", () => performance.mark("ndu:map-idle"));
  const originals = new Map<string, Expr>();
  const hiddenRaster: string[] = [];
  let extrusionAt: { lng: number; lat: number } | null = null;
  let extrusionM: number | null = null;
  let filterWorks = true;
  let chipEl: HTMLElement | null = null;
  let applied: Quality | null = null;

  const setExtrusion = (limit: number | null) => {
    extrusionM = limit;
    if (!filterWorks) return;
    const center = map.getCenter();
    extrusionAt = limit ? { lng: center.lng, lat: center.lat } : null;
    for (const id of EXTRUDED) {
      if (!map.getLayer(id)) continue;
      if (!originals.has(id)) originals.set(id, map.getFilter(id));
      const base = originals.get(id);
      if (!limit) {
        map.setFilter(id, base ?? null);
        continue;
      }
      const near = ["<=", ["distance", { type: "Point", coordinates: [center.lng, center.lat] }], limit];
      const next = base ? ["all", base, near] : near;
      map.setFilter(id, next);
      // MapLibre rejects an unsupported expression without throwing; then keep the original look.
      if (JSON.stringify(map.getFilter(id)) !== JSON.stringify(next)) {
        filterWorks = false;
        map.setFilter(id, base ?? null);
      }
    }
  };

  // Re-centre the extrusion disc only after real movement, so tiles are not re-filtered every frame.
  const onMoveEnd = () => {
    if (!extrusionM || !extrusionAt) return;
    if (metres(extrusionAt, map.getCenter()) > extrusionM / 3) setExtrusion(extrusionM);
  };

  const setRaster = (off: boolean) => {
    if (off) {
      for (const layer of map.getStyle()?.layers ?? []) {
        if ((layer.type === "raster" || layer.type === "hillshade") && map.getLayoutProperty(layer.id, "visibility") !== "none") {
          map.setLayoutProperty(layer.id, "visibility", "none");
          hiddenRaster.push(layer.id);
        }
      }
    } else {
      for (const id of hiddenRaster.splice(0)) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    }
  };

  let glLost = false;
  const applyQuality = (q: Quality) => {
    const was = applied;
    applied = q;
    const c = q.tier === "C";
    if (!was || (was.tier === "C") !== c) {
      // NDU-FP: same 85/60 as before unless first person owns the camera
      const cap = pitchCapFor(q.tier);
      map.setMaxPitch(cap.max === FULL_PITCH && c ? TIER_C_PITCH : cap.max); // 85 / 60 as before unless FP owns the camera
      map.setPixelRatio?.(pixelRatioFor(q.tier));
      setRaster(c); // #507: drop raster sources at Tier C
    }
    if (!was || was.mapExtrusionM !== q.mapExtrusionM) setExtrusion(q.mapExtrusionM); // #508
    const source = getTier().source;
    const auto = c && !glLost && (source === "ladder" || source === "probe" || source === "memory" || source === "webgl-lost");
    if (auto && !chipEl) {
      chipEl = chip(() => {
        optBack();
        chipEl?.remove();
        chipEl = null;
      });
      map.getContainer().append(chipEl);
    } else if (!c && chipEl) {
      chipEl.remove();
      chipEl = null;
    }
  };

  // NDU-UPG merge: realism (#30) owns the on-screen context-lost message; the "Light map" chip waits for restore.
  const onLost = () => {
    glLost = true;
    setTier("C", "WebGL context lost", "webgl-lost");
  };
  const onRestored = () => {
    glLost = false;
    applyQuality(getQuality());
  };
  map.getCanvas().addEventListener("webglcontextlost", onLost);
  map.getCanvas().addEventListener("webglcontextrestored", onRestored);
  map.on("moveend", onMoveEnd);
  applyQuality(getQuality());
  const offQuality = onQuality(applyQuality);
  const stopLadder = startLadder();
  // QA / perf scripts read and drive the ladder through this handle.
  (window as Window & { __nduPerf?: unknown }).__nduPerf = {
    tier: getTier,
    quality: getQuality,
    stats: perfStats,
    simulateFps,
    optBack,
    extrusion: () => ({ limitM: extrusionM, filterSupported: filterWorks, filter: EXTRUDED.map((id) => (map.getLayer(id) ? map.getFilter(id) : null)) }),
  };
  let stopHud: () => void = () => undefined;
  if (new URLSearchParams(location.search).has("perf")) {
    void import("./hud").then(({ mountHud }) => {
      stopHud = mountHud(map.getCanvas());
    });
  }
  return () => {
    stopLadder();
    offQuality();
    stopHud();
    map.off("moveend", onMoveEnd);
    map.getCanvas().removeEventListener("webglcontextlost", onLost);
    map.getCanvas().removeEventListener("webglcontextrestored", onRestored);
    chipEl?.remove();
  };
}
