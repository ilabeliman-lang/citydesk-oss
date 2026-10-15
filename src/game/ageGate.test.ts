import { test } from "node:test";
import assert from "node:assert/strict";
import { readAgeOk, writeAgeOk as setAgeOk } from "./ageOk.ts";

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

test("setAgeOk(true) stores a timestamp and readAgeOk returns it", () => {
  installStorage();
  assert.equal(readAgeOk(), null);
  setAgeOk(true);
  const raw = globalThis.localStorage.getItem("ndu.age.ok");
  assert.ok(raw);
  const parsed = JSON.parse(raw) as { ok?: unknown; at?: unknown };
  assert.equal(parsed.ok, true);
  assert.equal(typeof parsed.at, "string");
  assert.ok(Number.isFinite(Date.parse(String(parsed.at))));
  assert.equal(readAgeOk(), parsed.at);
});

test("a bad JSON value returns null", () => {
  installStorage();
  globalThis.localStorage.setItem("ndu.age.ok", "{");
  assert.equal(readAgeOk(), null);
  globalThis.localStorage.setItem("ndu.age.ok", "null");
  assert.equal(readAgeOk(), null);
  globalThis.localStorage.setItem("ndu.age.ok", JSON.stringify({ ok: true }));
  assert.equal(readAgeOk(), null);
  globalThis.localStorage.setItem("ndu.age.ok", JSON.stringify({ ok: false, at: "2020-01-01T00:00:00.000Z" }));
  assert.equal(readAgeOk(), null);
});
