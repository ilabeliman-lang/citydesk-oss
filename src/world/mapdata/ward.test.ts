import assert from "node:assert/strict";
import fs from "node:fs";
import { WARD_NOTE, wardCell } from "./ward.ts";

const src = fs.readFileSync(new URL("./ward.ts", import.meta.url), "utf8");
assert.match(src, /does not replace Overpass/);
assert.equal(WARD_NOTE, "This does not replace Overpass.");
assert.equal(/https?:|fetch\s*\(/.test(src), false);

const port = wardCell(4.8, 7.0);
assert.equal(port, "480:700");
assert.equal(wardCell(4.8, 7), port);
assert.equal(wardCell(4.809, 7.009), port);
assert.equal(wardCell(4.81, 7.0), "481:700");
assert.equal(wardCell(4.8, 7.01), "480:701");
assert.equal(wardCell(0.29, 1.15), "29:115");
assert.equal(wardCell(0, 0), "0:0");
assert.equal(wardCell(-0.0001, -0.0001), "-1:-1");
assert.equal(wardCell(-7.01, -0.01), "-701:-1");
assert.throws(() => wardCell(Number.NaN, 7), /finite/);
assert.equal(typeof wardCell(4.8, 7.0), "string");

console.log(port);
console.log("ward ok");
