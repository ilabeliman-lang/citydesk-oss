import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localPut } from "./presign.ts";

describe("localPut", () => {
  it("returns a local scan url for a safe key", () => {
    const put = localPut("scan-1.glb");
    assert.deepEqual(put, { ok: true, url: "/scans/local/scan-1.glb" });
    assert.deepEqual(localPut("Ab9.x-y"), { ok: true, url: "/scans/local/Ab9.x-y" });
  });

  it("rejects empty keys, dot-dot, and slashes", () => {
    assert.deepEqual(localPut(""), { ok: false });
    assert.deepEqual(localPut(".."), { ok: false });
    assert.deepEqual(localPut("a..b"), { ok: false });
    assert.deepEqual(localPut("../scan-1.glb"), { ok: false });
    assert.deepEqual(localPut("a/b"), { ok: false });
    assert.deepEqual(localPut("a\\b"), { ok: false });
    assert.deepEqual(localPut("/scan-1.glb"), { ok: false });
  });

  it("rejects keys outside letters, numbers, dot, and dash", () => {
    assert.deepEqual(localPut("scan_1.glb"), { ok: false });
    assert.deepEqual(localPut("scan 1.glb"), { ok: false });
    assert.deepEqual(localPut("scan-1.glb?x=1"), { ok: false });
  });
});
