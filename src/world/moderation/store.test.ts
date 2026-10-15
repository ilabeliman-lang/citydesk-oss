import { test } from "node:test";
import assert from "node:assert/strict";
import { block, list, report, unblock } from "./store.ts";

function installStorage() {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

test("report then list", () => {
  installStorage();
  const row = report("neighbor-1", "  they were rude  ");
  const rows = list().reports;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetId, "neighbor-1");
  assert.equal(rows[0].reason, "they were rude");
  assert.equal(rows[0].at, row.at);
  assert.ok(rows[0].reason.length <= 280);
  const stored = JSON.parse(globalThis.localStorage.getItem("ndu.moderation.v1") ?? "null") as { reports: { reason: string }[] };
  assert.equal(stored.reports[0].reason, "they were rude");
});

test("block and unblock", () => {
  installStorage();
  block("ada");
  block("ada");
  assert.deepEqual(list().blocked, ["ada"]);
  unblock("ada");
  assert.deepEqual(list().blocked, []);
});

test("caps the report list at 100", () => {
  installStorage();
  for (let i = 0; i < 105; i += 1) report(`id-${i}`, `reason ${i}`);
  const rows = list().reports;
  assert.equal(rows.length, 100);
  assert.equal(rows[0].reason, "reason 5");
  assert.equal(rows[99].reason, "reason 104");
});

test("empty reason is rejected", () => {
  installStorage();
  assert.throws(() => report("person", ""));
  assert.throws(() => report("person", "   "));
  assert.equal(list().reports.length, 0);
  assert.equal(globalThis.localStorage.getItem("ndu.moderation.v1"), null);
});
