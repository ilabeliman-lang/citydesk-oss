import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadKek, openBlob, sealBlob, unwrap, unwrapText, wrap, wrapText } from "./envelope.server.ts";

// An ephemeral, in-memory test KEK (symmetric, never persisted). Not a wallet key.
const env = { PROPERTY_KEK: randomBytes(32).toString("base64"), PROPERTY_KEK_ID: "t1" };
const kek = loadKek(env)!;

describe("envelope encryption (D4)", () => {
  it("loads only a 32-byte base64 KEK", () => {
    assert.ok(kek);
    assert.equal(kek.id, "t1");
    assert.equal(loadKek({}), null);
    assert.equal(loadKek({ PROPERTY_KEK: randomBytes(16).toString("base64") }), null);
  });

  it("round-trips blobs and the stored bytes are ciphertext", () => {
    const pdf = Buffer.from("%PDF-1.4 receipt bytes");
    const { sealed, dekWrapped } = sealBlob(kek, pdf, "item-1|receipt");
    assert.ok(!sealed.includes(Buffer.from("%PDF")));
    assert.deepEqual(openBlob(kek, sealed, dekWrapped, "item-1|receipt"), pdf);
  });

  it("fails closed on a tampered tag, wrong AAD or wrong key id", () => {
    const { sealed, dekWrapped } = sealBlob(kek, Buffer.from("photo"), "item-1|photo");
    const bad = Buffer.from(sealed);
    bad[bad.length - 1] ^= 1;
    assert.throws(() => openBlob(kek, bad, dekWrapped, "item-1|photo"));
    assert.throws(() => openBlob(kek, sealed, dekWrapped, "item-2|photo"));
    const other = loadKek({ PROPERTY_KEK: randomBytes(32).toString("base64"), PROPERTY_KEK_ID: "t2" })!;
    assert.throws(() => openBlob(other, sealed, dekWrapped, "item-1|photo"));
  });

  it("wraps salts and short text", () => {
    const salt = randomBytes(32);
    assert.deepEqual(unwrap(kek, wrap(kek, salt, "salt|i|receipt"), "salt|i|receipt"), salt);
    assert.equal(unwrapText(kek, wrapText(kek, "Grandma's fridge", "label|i"), "label|i"), "Grandma's fridge");
    assert.throws(() => unwrapText(kek, wrapText(kek, "x", "label|i"), "label|j"));
  });
});
