import assert from "node:assert/strict";
import { pickItem } from "./items.ts";

const door = { id: "door", name: "Door" };
const items = [door, { id: "window", name: "Window" }];

const picked = pickItem(items, "door");
assert.ok(picked);
assert.equal(picked.id, "door");
assert.equal(picked.name, "Door");

assert.equal(pickItem(items, "missing"), null);
assert.equal(pickItem([], "door"), null);
assert.equal(pickItem(items, "window")?.name, "Window");

console.log(picked.name);
