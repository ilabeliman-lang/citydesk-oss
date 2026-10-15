import assert from "node:assert/strict";
import { facadeColour } from "./facade.ts";

assert.equal(facadeColour("concrete"), "#c8c2b8");
assert.equal(facadeColour("brick"), "#8a4b32");
assert.equal(facadeColour("glass"), "#9bb0b8");
assert.equal(facadeColour("metal"), "#6e7270");

assert.equal(facadeColour("timber"), "#1a1714");
assert.equal(facadeColour(""), "#1a1714");
assert.equal(facadeColour("Brick"), "#1a1714");
assert.equal(facadeColour("concrete "), "#1a1714");

const known = ["concrete", "brick", "glass", "metal"].map((material) => facadeColour(material));
assert.equal(new Set(known).size, known.length, "each material keeps its own colour");

console.log("brick", facadeColour("brick"));
console.log("facadeColour ok");
