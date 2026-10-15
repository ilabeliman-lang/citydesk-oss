import assert from "node:assert/strict";
import { buildingShadows } from "./buildings.ts";

const lat = 6.45;
const lng = 3.39;
const half = 10;
const metres = 111320;
const dLat = half / metres;
const dLng = half / (metres * Math.cos((lat * Math.PI) / 180));
const ring = [
  [lng - dLng, lat - dLat],
  [lng + dLng, lat - dLat],
  [lng + dLng, lat + dLat],
  [lng - dLng, lat + dLat],
  [lng - dLng, lat - dLat],
];

const square = {
  type: "Feature" as const,
  id: 1,
  properties: { h: 16 },
  geometry: { type: "Polygon" as const, coordinates: [ring] },
};

const fc = buildingShadows([square as never], { east: 0, north: 1, up: 2 });
assert.equal(fc.type, "FeatureCollection");
assert.equal(fc.features.length, 1);
const poly = fc.features[0].geometry.coordinates[0];
assert.equal(poly.length, 9);
const unique = poly.slice(0, -1);
assert.equal(unique.length, 8);
const cLat = unique.reduce((sum, p) => sum + p[1], 0) / unique.length;
const cLng = unique.reduce((sum, p) => sum + p[0], 0) / unique.length;
assert.ok(cLat < lat, "a north light puts the ellipse south of the centroid");
assert.ok(Math.abs(cLng - lng) < 1e-8, "a north light does not shift the ellipse east");
assert.equal(typeof fc.features[0].properties.opacity, "number");

const many = Array.from({ length: 410 }, () => square);
assert.equal(buildingShadows(many as never, { east: 0, north: 1, up: 1 }).features.length, 400);

console.log("buildingShadows ok", { south: lat - cLat });
