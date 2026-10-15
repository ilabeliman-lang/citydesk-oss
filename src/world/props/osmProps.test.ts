import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPropsService, type OverpassBody } from "./osmPropsCore.ts";
import { decodeCell } from "./codec.ts";

const body = JSON.parse(readFileSync(new URL("./__fixtures__/london-cell.json", import.meta.url), "utf8")) as OverpassBody;
const cell = { key: "17174:-43", south: 51.5196, west: -0.1305, north: 51.5256, east: -0.1225 };

describe("osmProps core", () => {
  it("misses then hits the memory cache", async () => {
    let calls = 0;
    const s = createPropsService({ fetchOverpass: async () => (calls++, body) });
    const a = await s.propsForCell(cell, "Europe/London");
    const b = await s.propsForCell(cell, "Europe/London");
    assert.ok(a.ok && b.ok);
    assert.equal(calls, 1);
    assert.equal(s.stats().hits, 1);
    if (a.ok) assert.ok(decodeCell(a.data).length > 20);
  });
  it("de-dupes concurrent asks and keeps one request in flight", async () => {
    let calls = 0;
    let maxIn = 0;
    let cur = 0;
    const s = createPropsService({
      fetchOverpass: async () => {
        calls++;
        cur++;
        maxIn = Math.max(maxIn, cur);
        await new Promise((r) => setTimeout(r, 10));
        cur--;
        return body;
      },
    });
    const other = { ...cell, key: "x:y" };
    const res = await Promise.all([s.propsForCell(cell, "Europe/London"), s.propsForCell(cell, "Europe/London"), s.propsForCell(other, "Europe/London")]);
    assert.ok(res.every((r) => r.ok));
    assert.equal(calls, 2);
    assert.equal(maxIn, 1);
  });
  it("backs off after a failure (20 s, then doubling)", async () => {
    let t = 1_000_000;
    let calls = 0;
    let fail = true;
    const s = createPropsService({ now: () => t, fetchOverpass: async () => (calls++, fail ? null : body) });
    const a = await s.propsForCell(cell, "Europe/London");
    assert.ok(!a.ok && a.retryMs >= 15_000);
    const b = await s.propsForCell(cell, "Europe/London");
    assert.ok(!b.ok);
    assert.equal(calls, 1, "no upstream call while cooling");
    t += 21_000;
    await s.propsForCell(cell, "Europe/London");
    assert.equal(calls, 2);
    assert.ok(s.stats().coolMs >= 39_000, "doubled to 40 s");
    t += 41_000;
    fail = false;
    const c = await s.propsForCell(cell, "Europe/London");
    assert.ok(c.ok);
  });
  it("expires after the TTL", async () => {
    let t = 0;
    let calls = 0;
    const s = createPropsService({ now: () => t, ttlMs: 1000, fetchOverpass: async () => (calls++, body) });
    await s.propsForCell(cell, "Europe/London");
    t = 2000;
    await s.propsForCell(cell, "Europe/London");
    assert.equal(calls, 2);
  });
});
