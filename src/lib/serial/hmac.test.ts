import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signSerial, verifySerial } from "./hmac.ts";

describe("serial HMAC", () => {
  it("verifies the payload and rejects a changed payload", () => {
    const secret = "test-key";
    const payload = "ndu-serial-1";
    const mac = signSerial(secret, payload);
    assert.equal(mac.length, 64);
    assert.equal(/^[0-9a-f]{64}$/.test(mac), true);
    assert.equal(verifySerial(secret, payload, mac), true);
    assert.equal(verifySerial(secret, payload + "-changed", mac), false);
  });
});
