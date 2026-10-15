/**
 * Ground-shadow fill under the building extrusions.
 * Takes a GeoJSON FeatureCollection — the shape `buildingShadows` returns —
 * and does not import `./buildings.ts`. The caller can setData later.
 */

export const SHADOW_LAYER = "ndu-ground-shadows";

const SHADOW_SOURCE = "ndu-ground-shadows-src";

export type ShadowFeatureCollection = {
  type: "FeatureCollection";
  features: readonly unknown[];
};

type ShadowSource = { setData: (data: unknown) => void };

type ShadowMap = {
  getLayer: (id: string) => unknown;
  addLayer: (layer: Record<string, unknown>, beforeId?: string) => void;
  getSource: (id: string) => ShadowSource | undefined;
  addSource: (id: string, source: Record<string, unknown>) => void;
};

const shadowLayer = (): Record<string, unknown> => ({
  id: SHADOW_LAYER,
  type: "fill",
  source: SHADOW_SOURCE,
  paint: {
    "fill-color": "#1a1714",
    "fill-opacity": ["coalesce", ["get", "opacity"], 0.28],
  },
});

/** Adds the ground-shadow fill before `beforeId` when that layer is already on the map.
 *  If the shadow layer is already there, replaces its data.
 *  MapLibre does not throw when `beforeId` is missing: it fires an error event and
 *  skips the insert. A missing building layer therefore appends the fill so the
 *  extrusion added next stacks above it.
 */
export function addGroundShadows(map: ShadowMap, data: ShadowFeatureCollection, beforeId: string) {
  if (map.getLayer(SHADOW_LAYER)) {
    map.getSource(SHADOW_SOURCE)?.setData(data);
    return;
  }
  map.addSource(SHADOW_SOURCE, { type: "geojson", data });
  const layer = shadowLayer();
  if (beforeId && map.getLayer(beforeId)) map.addLayer(layer, beforeId);
  else map.addLayer(layer);
}
