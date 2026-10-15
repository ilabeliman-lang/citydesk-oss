import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const note = readFileSync(join(here, "../../../docs/privacy/STORED.md"), "utf8");
const text = note.toLowerCase();

assert.ok(text.includes("scans"), "note mentions scans");
assert.ok(text.includes("ciphertext"), "note mentions ciphertext");

console.log("stored ok");
