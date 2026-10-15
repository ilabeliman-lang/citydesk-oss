import assert from "node:assert/strict";
import { routeJob } from "./router.ts";

const scan = routeJob("scan");
const mint = routeJob("mint");

assert.equal(routeJob("chat"), "ada");
assert.equal(scan, "scans");
assert.equal(mint, null);
assert.equal(routeJob("ada"), null);
assert.equal(routeJob("scans"), null);
assert.equal(routeJob(""), null);
assert.equal(routeJob("CHAT"), null);
assert.equal(routeJob("SCAN"), null);

console.log(`scan ${scan}`);
console.log(`mint ${String(mint)}`);
