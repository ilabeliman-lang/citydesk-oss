import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  COMMIT_KINDS,
  canonicalJson,
  commit,
  fileDigest,
  geoDigest,
  geohash,
  newSalt,
  scanManifest,
  type CommitKind,
} from "./commit.ts";

// Fixed vectors (computed independently with Python hashlib). If these change, client and
// server have drifted from the published format: do NOT just update the numbers.
const SALT = Uint8Array.from({ length: 32 }, (_, i) => i);
const HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const VECTORS: Record<CommitKind, string> = {
  receipt: "61b869e04136f384c51611ba1803dbea71b9de4fc6e0640dc3bd6acd3d4a947b",
  photo: "bcca769143004c950d65cc9883ebd46db04b4f99415846f31ca373be4a60a4d7",
  scan: "8e89ca29fa34c5bba21d510835c6ecd7dd4a8f1ce66cdfc1b516e39118d6370e",
  geo: "84d13d9436b4ec2bf745c6e24340d31d82ada36a0744eeaefc911e7503b90355",
  group: "b273f8bdce59af716a4c140f4320beab9b2e26b5b1221d8fa130a4ae617d50d8",
};

describe("commitments (D3)", () => {
  it("file digest is plain SHA-256 of the bytes", async () => {
    assert.equal(await fileDigest(new TextEncoder().encode("hello")), HELLO);
  });

  it("matches the fixed vectors for every kind", async () => {
    for (const kind of COMMIT_KINDS) assert.equal(await commit(kind, SALT, HELLO), VECTORS[kind], kind);
  });

  it("matches an independent node:crypto implementation", async () => {
    const salt = newSalt();
    const want = createHash("sha256")
      .update(Buffer.from("ndu.commit.v1|receipt|"))
      .update(salt)
      .update(Buffer.from(HELLO, "hex"))
      .digest("hex");
    assert.equal(await commit("receipt", salt, HELLO), want);
  });

  it("domain-separates kinds: same salt + digest gives a different commitment per kind", async () => {
    const all = await Promise.all(COMMIT_KINDS.map((k) => commit(k, SALT, HELLO)));
    assert.equal(new Set(all).size, COMMIT_KINDS.length);
  });

  it("salts are 32 random bytes and differ each time", () => {
    const a = newSalt();
    const b = newSalt();
    assert.equal(a.byteLength, 32);
    assert.notDeepEqual(a, b);
  });

  it("rejects bad salts, digests and kinds", async () => {
    await assert.rejects(commit("receipt", new Uint8Array(31), HELLO));
    await assert.rejects(commit("receipt", SALT, HELLO.toUpperCase()));
    await assert.rejects(commit("nope" as CommitKind, SALT, HELLO));
  });
});

describe("canonical JSON", () => {
  it("sorts keys recursively and drops whitespace", () => {
    assert.equal(canonicalJson({ b: 1, a: { d: [1, "x", null], c: true } }), '{"a":{"c":true,"d":[1,"x",null]},"b":1}');
  });
  it("refuses non-finite numbers", () => {
    assert.throws(() => canonicalJson({ a: Number.NaN }));
  });
});

describe("scan manifest", () => {
  it("is canonical and hashes to the fixed vector", async () => {
    const m = await scanManifest([{ role: "model", format: "glb", bytes: 4, sha256: "ab".repeat(32) }]);
    assert.equal(m.json, '{"files":[{"bytes":4,"format":"glb","role":"model","sha256":"' + "ab".repeat(32) + '"}]}');
    assert.equal(m.digest, "5f2fd138cbcd1de4e1edce3c5de6c6a2d361573fb42d4ea8c70608b0a5fdc283");
  });
});

describe("geohash", () => {
  it("matches the reference geohash example", () => {
    assert.equal(geohash(57.64911, 10.40744, 11), "u4pruydqqvj");
  });
  it("building-level digest uses precision 7", async () => {
    assert.equal(geohash(52.2053, 0.1218), "u120fz8");
    assert.equal(await geoDigest(52.2053, 0.1218), "7d71770264ce6c0de40bd2c54a514222db4a0c4cc8859fb8ca7ef0312566975c");
  });
});
