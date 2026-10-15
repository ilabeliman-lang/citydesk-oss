/**
 * privacy.test.ts — heavy-b2 (secret scrub). Exercises the search privacy filter
 * (src/world/search/privacy.ts) — the one place all index-bound data passes through.
 *
 * Two kinds of case:
 *  - COVERED: shapes the filter redacts today (asserted as behaviour).
 *  - GAP: shapes it does NOT redact — asserted so the gap is documented and a
 *    future fix flips the assertion deliberately. Each gap is named in the audit
 *    doc docs/audits/secret-scrub.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { redactText, isPrivateField, publicRecord } from "./privacy.ts";

// ---- COVERED: free-text contact shapes ----
test("redactText removes e-mail addresses", () => {
  assert.equal(redactText("call me at ada@example.com ok").includes("@"), false);
  assert.equal(redactText("reach ada@example.com"), "reach");
});

test("redactText removes URLs", () => {
  assert.equal(redactText("see https://evil.example/x now").includes("http"), false);
  assert.equal(redactText("go to www.example.com"), "go to");
});

test("redactText removes phone numbers (7+ digits)", () => {
  assert.equal(/\d{7,}/.test(redactText("ring +234 803 123 4567")), false);
  assert.equal(/\d{7,}/.test(redactText("08031234567")), false);
  assert.equal(/\d{7,}/.test(redactText("(01) 234 5678")), false);
});

test("redactText strips @handles", () => {
  assert.equal(redactText("ask @ada_b about it").includes("@"), false);
});

// ---- COVERED: private field names ----
test("isPrivateField flags contact/secret-bearing keys", () => {
  for (const k of ["owner", "owner_id", "email", "phone", "wallet", "token", "secret", "password", "kek", "dek", "salt"]) {
    assert.equal(isPrivateField(k), true, `${k} should be private`);
  }
  assert.equal(isPrivateField("label"), false);
  assert.equal(isPrivateField("kind"), false);
});

// ---- COVERED: record gating ----
test("publicRecord drops private fields and redacts string values", () => {
  const v = publicRecord({ source: "place", label: "Café ada@example.com", owner_id: 7, kind: "food" });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal("owner_id" in v.record, false);
    assert.equal(v.record.label, "Café");
  }
});

test("publicRecord rejects closed / undeclared / unpublished / private-scan records", () => {
  assert.deepEqual(publicRecord({ source: "listing", open: false }), { ok: false, reason: "closed listing" });
  assert.deepEqual(publicRecord({ source: "listing", declared: false }), { ok: false, reason: "undeclared listing" });
  assert.equal(publicRecord({ source: "scan", visibility: "private" }).ok, false);
  assert.equal(publicRecord({ source: "property", claimStatus: "draft" }).ok, false);
});

// ---- GAP (documented, NOT yet redacted) ----
// These assert CURRENT behaviour so the gap is explicit; flip them when fixed.
test("GAP: free-text API keys / bearer tokens are NOT scrubbed", () => {
  const s = "key sk-live-abc123DEF456ghi789 is mine";
  assert.equal(redactText(s), s, "expected gap: sk-… survives redactText");
});

test("GAP: JWTs in free text have no dedicated rule (only incidental digit-run mangling)", () => {
  // A JWT whose segments carry no adjacent digit clusters survives redactText whole.
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMi.c2lnbmF0dXJl";
  assert.equal(redactText("token " + jwt).includes("eyJ"), true, "expected gap: JWT survives (no dedicated rule)");
});

test("GAP: long hex secrets in free text have no dedicated rule", () => {
  // Alternating letter/digit hex avoids the phone rule's 7+ digit run, so it survives whole.
  const hex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
  assert.equal(redactText("hash " + hex).includes(hex), true, "expected gap: hex secret survives");
});

test("GAP: a private value under a non-private key is NOT scrubbed", () => {
  // isPrivateField only sees the KEY; a secret placed in e.g. `note` is copied verbatim.
  const v = publicRecord({ source: "place", note: "sk-live-abc123DEF456ghi789" });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.record.note, "sk-live-abc123DEF456ghi789", "expected gap: value not key-checked");
});
