import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientFlags, defaultFlags, INGEST_FLAGS, serverFlags } from "./flags.ts";

describe("safe-ingest feature flags", () => {
  it("defaults: strip/dedupe/NSFW gate ON, anything that can block a real user OFF", () => {
    const d = defaultFlags();
    assert.equal(d.stripMeta, true);
    assert.equal(d.dedupe, true);
    assert.equal(d.nsfwGate, true);
    assert.equal(d.scamFlag, true);
    assert.equal(d.dedupeBlock, false);
    assert.equal(d.scamHold, false);
    assert.equal(d.nsfwServer, false);
    for (const [k, f] of Object.entries(INGEST_FLAGS))
      if (f.blocks && k !== "nsfwGate") assert.equal(f.default, false, k);
  });
  it("reads server env switches", () => {
    const f = serverFlags({
      INGEST_DEDUPE_BLOCK: "on",
      INGEST_STRIP_META: "off",
      INGEST_SCAM_HOLD: "maybe",
    });
    assert.equal(f.dedupeBlock, true);
    assert.equal(f.stripMeta, false);
    assert.equal(f.scamHold, false);
  });
  it("reads and remembers ?ingest-x= overrides on the phone", () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    assert.equal(clientFlags("?ingest-nsfw-gate=off", store).nsfwGate, false);
    assert.equal(clientFlags("", store).nsfwGate, false);
    assert.equal(clientFlags("?ingest-nsfw-gate=on", store).nsfwGate, true);
    assert.equal(clientFlags("", null).faceBlur, true);
  });
});
