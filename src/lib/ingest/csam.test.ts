import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csamCheck } from "./csam.ts";

describe("csam check", () => {
  it("is unavailable for an empty byte array", () => {
    const result = csamCheck(new Uint8Array());
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "no vendor list");
  });

  it("is unavailable for three bytes", () => {
    const result = csamCheck(new Uint8Array([1, 2, 3]));
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "no vendor list");
  });
});
