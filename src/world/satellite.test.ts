import { test } from "node:test";
import assert from "node:assert/strict";
import { SATELLITE_ATTRIBUTION, SATELLITE_TILES, addSatelliteBasemap } from "./satellite.ts";

test("satellite tiles are the keyless Esri world imagery, with credit", () => {
  assert.equal(SATELLITE_TILES.length, 1);
  assert.match(SATELLITE_TILES[0], /^https:\/\/server\.arcgisonline\.com\/.+\{z\}\/\{y\}\/\{x\}$/);
  assert.match(SATELLITE_ATTRIBUTION, /Esri/);
  assert.match(SATELLITE_ATTRIBUTION, /Maxar/);
});

test("satellite sits under the style and hides the flat land fill", () => {
  const paints: string[] = [];
  const layers = [
    { id: "background", type: "background" },
    { id: "land", type: "fill" },
    { id: "road", type: "line" },
  ];
  const map = {
    getSource: () => null,
    addSource: () => undefined,
    addLayer: (layer: { id: string }) => layers.unshift({ id: layer.id, type: "raster" }),
    getStyle: () => ({ layers }),
    setPaintProperty: (id: string, prop: string) => paints.push(`${id}:${prop}`),
  };
  addSatelliteBasemap(map);
  assert.equal(layers[0].id, "ndu-satellite");
  assert.ok(paints.includes("background:background-opacity"));
  assert.ok(paints.includes("land:fill-opacity"));
  assert.ok(!paints.some((p) => p.startsWith("road:")));
});
