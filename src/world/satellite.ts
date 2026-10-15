/** Keyless satellite ground, the same public Esri imagery God's Eye View boots with.
 * Google's photoreal 3D tiles stay off: their terms forbid mixing them with this OSM map.
 */
export const SATELLITE_SOURCE = "ndu-satellite";
export const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
export const SATELLITE_ATTRIBUTION =
  "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

type StyleLayer = { id: string; type: string };
type SatMap = {
  getSource(id: string): unknown;
  addSource(id: string, source: object): void;
  getLayer?(id: string): unknown;
  addLayer(layer: object, beforeId?: string): void;
  getStyle(): { layers?: StyleLayer[] };
  setPaintProperty(layer: string, prop: string, value: unknown): void;
};

/** Put live satellite imagery under the streets and let the vector roads and labels stay. */
export function addSatelliteBasemap(map: SatMap): void {
  if (!map.getSource(SATELLITE_SOURCE)) {
    map.addSource(SATELLITE_SOURCE, {
      type: "raster",
      tiles: SATELLITE_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: SATELLITE_ATTRIBUTION,
    });
  }
  const layers = map.getStyle().layers ?? [];
  const exists = map.getLayer?.(SATELLITE_SOURCE) ?? layers.some((layer) => layer.id === SATELLITE_SOURCE);
  if (!exists) {
    map.addLayer(
      { id: SATELLITE_SOURCE, type: "raster", source: SATELLITE_SOURCE, paint: { "raster-fade-duration": 0 } },
      layers[0]?.id,
    );
  }
  for (const layer of layers) {
    if (layer.id === SATELLITE_SOURCE) continue;
    if (layer.id.includes("building")) continue;
    if (layer.type === "background") map.setPaintProperty(layer.id, "background-opacity", 0);
    if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-opacity", 0);
  }
  // The 3D blocks stay above the photo. A flat footprint is not enough; keep the extrusion opaque.
  if (map.getLayer?.("building-3d")) {
    map.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.96);
    map.setPaintProperty("building-3d", "fill-extrusion-vertical-gradient", true);
  }
}
