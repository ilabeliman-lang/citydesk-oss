import assert from "node:assert/strict";
import { floorPanes } from "./panes.ts";

const names = floorPanes();

assert.deepEqual([...names], ["files", "terminal", "preview"]);
assert.equal(names.length, 3);
assert.equal(names[0], "files");
assert.equal(names[1], "terminal");
assert.equal(names[2], "preview");

const again = floorPanes();
assert.deepEqual([...again], ["files", "terminal", "preview"], "order stays fixed");
assert.notEqual(again, names);

console.log(names.join(","));
