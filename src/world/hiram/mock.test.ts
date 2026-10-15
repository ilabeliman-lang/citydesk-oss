import assert from "node:assert/strict";
import fs from "node:fs";
import { hiramNote } from "./mock.ts";

const src = fs.readFileSync(new URL("./mock.ts", import.meta.url), "utf8");
assert.equal(/https?:|fetch\s*\(|XMLHttpRequest|WebSocket|process\.env/.test(src), false);

const noted = hiramNote("  facade line  ");
assert.deepEqual(noted, { role: "designer", note: "facade line" });
assert.equal(noted instanceof Promise, false);
assert.equal(noted.role, "designer");
assert.equal(noted.note, "facade line");

const plain = hiramNote("keep the cornice");
assert.deepEqual(plain, { role: "designer", note: "keep the cornice" });

assert.throws(() => hiramNote(""), /empty brief/);
assert.throws(() => hiramNote("   "), /empty brief/);
assert.throws(() => hiramNote("\n\t"), /empty brief/);

console.log(noted.role);
