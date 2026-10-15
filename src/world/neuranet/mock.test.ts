import assert from "node:assert/strict";
import fs from "node:fs";
import { dispatch, nodeStatus } from "./mock.ts";

const src = fs.readFileSync(new URL("./mock.ts", import.meta.url), "utf8");
assert.equal(/https?:|fetch\s*\(|XMLHttpRequest|WebSocket|process\.env/.test(src), false);
assert.equal(/api[_-]?key|secret|private[_-]?key|mnemonic|seed phrase/i.test(src), false);

const status = nodeStatus();
assert.deepEqual(status, { mode: "mock", mint: false, readOnly: true });
assert.equal(status instanceof Promise, false);
assert.equal(status.mode, "mock");
assert.equal(status.mint, false);
assert.equal(status.readOnly, true);
assert.deepEqual(Object.keys(status).sort(), ["mint", "mode", "readOnly"]);

assert.throws(
  () => dispatch(),
  (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, "mint is blocked");
    return true;
  },
);
assert.throws(() => dispatch({ mint: true }), /mint is blocked/);

console.log(JSON.stringify(status));
console.log("dispatch throws");
