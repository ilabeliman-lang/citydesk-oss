import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { storeScan } from "./localScan.ts";

const sample = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x01, 0x02, 0x03]);

function localShape(bytes: Uint8Array): { where: "local"; ok: true; url: string } {
  const key = createHash("sha256").update(bytes).digest("hex");
  return { where: "local", ok: true, url: "/scans/local/" + key };
}

describe("storeScan", () => {
  it("returns the local put result when the bucket is missing or empty", async () => {
    const expected = localShape(sample);
    assert.deepEqual(await storeScan(sample, {}), expected);
    assert.deepEqual(await storeScan(sample, { bucket: "" }), expected);
    assert.deepEqual(await storeScan(sample, { bucket: undefined }), expected);
    assert.equal(expected.ok, true);
    assert.match(expected.url, /^\/scans\/local\/[0-9a-f]{64}$/);
  });

  it("refuses a set bucket and does not upload", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      throw new Error("network");
    };
    try {
      const result = await storeScan(sample, { bucket: "citydesk-scans" });
      assert.deepEqual(result, { where: "remote", refused: true });
      assert.equal(calls, 0);
      assert.equal("url" in result, false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
