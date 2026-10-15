import assert from "node:assert/strict";
import { groundShadow } from "./cast.ts";
import { propShadow } from "./props.ts";

const northLight = { east: 0, north: 1, up: 2 };

const person = propShadow("person", northLight);
const personFoot = groundShadow({ width: 0.5, depth: 0.4, height: 1.75 }, northLight);
assert.equal(person.east, personFoot.east);
assert.equal(person.north, personFoot.north);
assert.equal(person.rx, personFoot.rx);
assert.equal(person.ry, personFoot.ry);
assert.equal(person.opacity, personFoot.opacity);
assert.ok(person.north < 0, "a north light gives a negative north");
assert.equal(person.x, person.east);
assert.equal(person.y, 0);
assert.equal(person.z, -person.north);
assert.ok(person.z > 0, "z = -north is positive");
assert.ok(Math.abs(person.east) < 1e-9, "a north light does not shift the shadow east");

const vehicle = propShadow("vehicle", northLight);
const vehicleFoot = groundShadow({ width: 1.8, depth: 4, height: 1.5 }, northLight);
assert.equal(vehicle.north, vehicleFoot.north);
assert.equal(vehicle.rx, vehicleFoot.rx);
assert.equal(vehicle.ry, vehicleFoot.ry);
assert.ok(vehicle.north < 0, "a vehicle under a north light also falls south");
assert.equal(vehicle.z, -vehicle.north);
assert.ok(vehicle.z > 0, "vehicle z = -north is positive");
assert.ok(vehicle.rx > person.rx, "a vehicle is wider than a person");

console.log("props ok");
