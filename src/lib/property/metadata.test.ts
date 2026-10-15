import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMetadata, claimBodyFrom, claimHash, claimMessage, validatePublicMetadata, type ClaimBody } from "./metadata.ts";

const H = (c: string) => c.repeat(64);
const body: ClaimBody = {
  schema: "ndu.property/0.1",
  network: "devnet",
  record_ref: "0123456789abcdef",
  asset_class: "household",
  scope: "personal",
  owner_group_commitment: null,
  geo_commitment: H("a"),
  scan_commitment: H("b"),
  receipt_commitment: H("c"),
  photo_commitment: H("d"),
  claimant: "8im7vtB6EHTKoVXHnPH3Sh4Up5We9jrxxwvvwXSYqjTH",
  issued_at: "2026-10-07T21:00:00.000Z",
};
const SIG = "A".repeat(86) + "==";

describe("public metadata (D2) + leak test", () => {
  it("builds valid, content-addressed metadata with the disclaimer and devnet", async () => {
    const { metadata, json, hash } = await buildMetadata(body, SIG);
    assert.deepEqual(validatePublicMetadata(metadata), []);
    assert.equal(metadata.network, "devnet");
    assert.match(metadata.disclaimer, /not legal title/);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.parse(json).claim.claim_sha256, await claimHash(body));
  });

  it("round-trips the signed claim body", async () => {
    const { metadata } = await buildMetadata(body, SIG);
    assert.equal(await claimHash(claimBodyFrom(metadata)), await claimHash(body));
    assert.match(claimMessage(await claimHash(body)), /^NDU property claim v0\.1 \(DEVNET, not legal title\)\nclaim_sha256:[0-9a-f]{64}\n/);
  });

  it("rejects extra fields (seeded negative case: a lat/lng)", async () => {
    const { metadata } = await buildMetadata(body, SIG);
    const leaked = { ...metadata, lat: 52.20531, lng: 0.12182 };
    const problems = validatePublicMetadata(leaked);
    assert.ok(problems.some((p) => p.includes("field not allowed: lat")));
    assert.ok(problems.some((p) => p.includes("coordinate")));
  });

  it("rejects emails, non-opaque names, mainnet and altered disclaimers", async () => {
    const { metadata } = await buildMetadata(body, SIG);
    assert.ok(validatePublicMetadata({ ...metadata, name: "Iman's fridge" }).length);
    assert.ok(validatePublicMetadata({ ...metadata, network: "mainnet-beta" }).length);
    assert.ok(validatePublicMetadata({ ...metadata, disclaimer: "Legal title." }).length);
    assert.ok(validatePublicMetadata({ ...metadata, claim: { ...metadata.claim, email: "a@b.c" } }).length);
  });

  it("refuses to build when scope and group commitment disagree", async () => {
    await assert.rejects(buildMetadata({ ...body, scope: "family" }, SIG));
    await assert.rejects(buildMetadata({ ...body, owner_group_commitment: H("e") }, SIG));
  });

  it("F2: accepts opaque names whose 6-hex id is all digits (no false 'long digit run')", async () => {
    for (const ref of ["0123456789abcdef", "999999ffffffffff", "12345a0000000000", "a123450000000000"]) {
      const { metadata } = await buildMetadata({ ...body, record_ref: ref }, SIG);
      assert.deepEqual(validatePublicMetadata(metadata), [], ref);
    }
  });

  it("F2: still catches real digit leaks in the name and other text fields", async () => {
    const { metadata } = await buildMetadata(body, SIG);
    const has = (m: unknown) => validatePublicMetadata(m).some((p) => p.includes("long digit run"));
    assert.ok(has({ ...metadata, name: "NDU item 5551234567" }));
    assert.ok(has({ ...metadata, name: "NDU item #123456 call 5551234" }));
    assert.ok(has({ ...metadata, name: "Serial 12345 #abcdef" }));
    assert.ok(has({ ...metadata, scope: "personal12345" }));
    assert.ok(!has({ ...metadata, name: "NDU item #123456" }));
  });
});
