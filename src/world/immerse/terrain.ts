import type { Tier } from "@/world/perf/tier";
import { terrainKind } from "./terrainKind.ts";
import { groundHandle } from "@/world/ground/hooks";
import type { HeightSample } from "@/world/ground/types";
import { firstLayer, safe, type Disposer, type IMap } from "./mapTypes";

/**
 * NDU-UPG immerse #101 #102 #104 #119 #130 #147: relief.
 *   Tier A: 3D terrain (raster-dem, exaggeration 1) + hillshade.  Tier B: same mesh at exaggeration 0, so a scan can read height and the view stays flat.
 *   Tier C: nothing.  DEM tiles: AWS Terrain Tiles (Terrarium encoding, public dataset on the AWS
 *   Registry of Open Data; free, no key; sources SRTM / USGS NED / ETOPO1 etc. — attribution below).
 *   Hillshade uses its own lower-zoom source (maxzoom 12) so phones fetch few tiles (#147).
 *   If the DEM keeps failing we silently go back to a flat map (#130) — no toasts.
 */

export const DEM = "ndu-dem";
export const DEM_HS = "ndu-dem-hs";
const HILLSHADE = "ndu-hillshade";
export const TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];
export const ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain: Mapzen/Tilezen, AWS Open Data (SRTM, USGS, ETOPO1)</a>';

export function attachTerrain(
  map: IMap,
  tier: Tier,
): { dispose: Disposer; setTier: (t: Tier) => void } {
  let errors = 0;
  let dead = false;
  let current: Tier | null = null;

  /** NDU realism 02: tell the ground provider whether 3D terrain is drawn (no listeners = no effect). */
  const announce = () =>
    safe(() => window.dispatchEvent(new CustomEvent("ndu-ground", { detail: { terrain: Boolean(map.getTerrain?.()) } })));
  const removeAll = () => {
    safe(() => {
      if (map.getTerrain?.()) map.setTerrain?.(null);
      if (map.getLayer(HILLSHADE)) map.removeLayer(HILLSHADE);
      for (const id of [DEM, DEM_HS]) if (map.getSource(id)) map.removeSource(id);
    });
    announce();
  };

  const apply = (t: Tier) => {
    if (dead || t === current) return;
    current = t;
    if (terrainKind(t) === "flat") return removeAll();
    safe(() => {
      if (!map.getSource(DEM_HS))
        map.addSource(DEM_HS, {
          type: "raster-dem",
          tiles: TILES,
          encoding: "terrarium",
          tileSize: 256,
          maxzoom: 12,
          attribution: ATTRIBUTION,
        });
      if (!map.getLayer(HILLSHADE))
        map.addLayer(
          {
            id: HILLSHADE,
            type: "hillshade",
            source: DEM_HS,
            paint: {
              // strong at city scale, faint at street scale so roads stay readable
              "hillshade-exaggeration": [
                "interpolate",
                ["linear"],
                ["zoom"],
                9,
                0.55,
                14,
                0.38,
                17,
                0.22,
              ],
              "hillshade-shadow-color": "#3d3326",
              "hillshade-highlight-color": "#fff8ea",
              "hillshade-accent-color": "#5b4b38",
            },
          },
          firstLayer(map, ["waterway_tunnel", "water", "building"]),
        );
    });
    if (terrainKind(t) !== "flat") {
      safe(() => {
        if (!map.getSource(DEM))
          map.addSource(DEM, {
            type: "raster-dem",
            tiles: TILES,
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 14,
          });
        // Full raises the hill. Shade keeps the mesh at exaggeration 0 so the
        // picture stays flat and a scan can still read the height.
        map.setTerrain?.({ source: DEM, exaggeration: terrainKind(t) === "full" ? 1 : 0 });
      });
    } else safe(() => map.getTerrain?.() && map.setTerrain?.(null)); // #119 Tier B: flat
    announce();
  };

  const onError = (e: { sourceId?: string }) => {
    if (!e?.sourceId?.startsWith(DEM)) return;
    errors += 1;
    if (errors >= 6) {
      dead = true;
      removeAll(); // #130 silent fallback
    }
  };
  map.on("error", onError);
  apply(tier);
  return {
    dispose: () => {
      map.off("error", onError);
      dead = true;
      removeAll();
    },
    setTier: apply,
  };
}

/** #104: ground height (m) under a spot, 0 when there is no terrain. For scans/avatar placement. */
export function groundElevation(map: IMap, lng: number, lat: number): number {
  const gh = groundHandle();
  if (gh) return gh.anchorAt(lng, lat).h;
  try {
    return map.queryTerrainElevation?.([lng, lat]) ?? 0;
  } catch {
    return 0;
  }
}

/** NDU realism 02: the same with provenance (drawn map / DEM / flat / last known). */
export function groundSample(map: IMap, lng: number, lat: number): HeightSample {
  const gh = groundHandle();
  if (gh) return gh.anchorAt(lng, lat);
  try {
    const h = map.queryTerrainElevation?.([lng, lat]);
    return h == null ? { h: 0, ok: true, src: "flat" } : { h, ok: true, src: "map" };
  } catch {
    return { h: 0, ok: false, src: "flat" };
  }
}
