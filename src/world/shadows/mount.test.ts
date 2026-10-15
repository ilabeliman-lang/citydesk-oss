import assert from "node:assert/strict";
import { addGroundShadows, SHADOW_LAYER } from "./mount.ts";

type Rec = { id: string; type: string; source: string; paint: Record<string, unknown> };

function fakeMap(options?: { rejectMissingBefore?: boolean }) {
  const layers = new Map<string, { layer: Rec; beforeId?: string }>();
  const sources = new Map<string, { type: string; data: unknown; setData: (data: unknown) => void }>();
  const added: string[] = [];
  const errors: string[] = [];
  return {
    added,
    errors,
    layers,
    sources,
    getLayer(id: string) {
      return layers.get(id)?.layer;
    },
    addLayer(layer: Record<string, unknown>, beforeId?: string) {
      const rec = layer as Rec;
      // MapLibre fires an error event and returns; it does not throw.
      if (options?.rejectMissingBefore && beforeId && !layers.has(beforeId)) {
        errors.push(`Cannot add layer "${rec.id}" before non-existing layer "${beforeId}".`);
        return;
      }
      layers.set(rec.id, { layer: rec, beforeId });
      added.push(rec.id);
    },
    getSource(id: string) {
      return sources.get(id);
    },
    addSource(id: string, source: Record<string, unknown>) {
      const entry = {
        type: String(source.type),
        data: source.data,
        setData(data: unknown) {
          entry.data = data;
        },
      };
      sources.set(id, entry);
    },
  };
}

const data = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature",
      properties: { opacity: 0.4 },
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    },
  ],
};

const map = fakeMap();
map.layers.set("ndu-real-buildings", {
  layer: { id: "ndu-real-buildings", type: "fill-extrusion", source: "ndu-real-buildings-src", paint: {} },
});
addGroundShadows(map, data, "ndu-real-buildings");

const inserted = map.layers.get(SHADOW_LAYER);
assert.ok(inserted, "shadow layer is inserted");
assert.equal(inserted.beforeId, "ndu-real-buildings");
assert.equal(inserted.layer.type, "fill");
assert.equal(inserted.layer.source, "ndu-ground-shadows-src");
assert.equal(inserted.layer.paint["fill-color"], "#1a1714");
assert.deepEqual(inserted.layer.paint["fill-opacity"], ["coalesce", ["get", "opacity"], 0.28]);
assert.equal(map.added.length, 1);
assert.equal([...map.sources.values()][0].data, data);

const next = { type: "FeatureCollection" as const, features: [] as unknown[] };
addGroundShadows(map, next, "ndu-real-buildings");
assert.equal(map.added.length, 1, "existing layer setData instead of addLayer");
assert.equal([...map.sources.values()][0].data, next);

const missing = fakeMap({ rejectMissingBefore: true });
addGroundShadows(missing, data, "ndu-real-buildings");
const appended = missing.layers.get(SHADOW_LAYER);
assert.ok(appended, "shadow layer is still inserted when the before-layer is missing");
assert.equal(appended.beforeId, undefined);
assert.equal(missing.errors.length, 0, "does not insert before a layer that is not on the map");
assert.equal(missing.added.length, 1);
assert.equal([...missing.sources.values()][0].data, data);

console.log("inserted", true, "before", inserted.beforeId, "layer", SHADOW_LAYER);
console.log("missing before", true, "appended", appended.beforeId === undefined);
console.log("mount ok");
