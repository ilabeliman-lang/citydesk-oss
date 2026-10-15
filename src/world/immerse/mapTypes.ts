/** Minimal MapLibre surface used by the immerse module (the map is loaded from the CDN, untyped). */
export type IMap = {
  getLayer: (id: string) => { source?: string } | undefined;
  addLayer: (layer: Record<string, unknown>, before?: string) => void;
  removeLayer: (id: string) => void;
  getSource: (
    id: string,
  ) => { setData?: (data: unknown) => void; setCoordinates?: (c: number[][]) => void } | undefined;
  addSource: (id: string, source: Record<string, unknown>) => void;
  removeSource: (id: string) => void;
  setPaintProperty: (layer: string, name: string, value: unknown) => void;
  getPaintProperty: (layer: string, name: string) => unknown;
  setLayoutProperty: (layer: string, name: string, value: unknown) => void;
  setTerrain?: (spec: Record<string, unknown> | null) => void;
  getTerrain?: () => unknown;
  queryTerrainElevation?: (
    lngLat: [number, number] | { lng: number; lat: number },
  ) => number | null;
  getStyle: () => {
    layers?: { id: string; type: string; source?: string; "source-layer"?: string }[];
  };
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  getPitch: () => number;
  getBearing: () => number;
  isMoving: () => boolean;
  on: (event: string, a: unknown, b?: unknown) => void;
  off: (event: string, a: unknown, b?: unknown) => void;
  getCanvas: () => HTMLCanvasElement;
  getContainer: () => HTMLElement;
  hasImage: (id: string) => boolean;
  addImage: (
    id: string,
    image: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
    options?: Record<string, unknown>,
  ) => void;
  removeImage: (id: string) => void;
  triggerRepaint?: () => void;
  /** NDU realism 02 */
  isSourceLoaded?: (id: string) => boolean;
  setCenterElevation?: (m: number) => void;
  setCenterClampedToGround?: (on: boolean) => void;
  querySourceFeatures?: (source: string, params?: Record<string, unknown>) => unknown[];
};

export type Disposer = () => void;

export const safe = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[immerse]", (err as Error).message);
  }
};

/** First style layer id that exists, for `before` insertion (undefined = top). */
export function firstLayer(map: IMap, ids: string[]): string | undefined {
  return ids.find((id) => {
    try {
      return Boolean(map.getLayer(id));
    } catch {
      return false;
    }
  });
}

/** The basemap's vector source (openmaptiles in the Liberty style). */
export function vectorSource(map: IMap): string {
  return map.getLayer("water")?.source ?? map.getLayer("building")?.source ?? "openmaptiles";
}
