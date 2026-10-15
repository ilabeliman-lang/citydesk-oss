// NDU-UPG property-ui: pure tests (cap, status labels, hash truncation). No server or database.
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ITEM_CAP,
  canAddItem,
  cardTone,
  recordTone,
  slotsLeft,
  statusLabel,
  toneClass,
  toneLabel,
  truncateHash,
} from "./logic.ts";

describe("item cap", () => {
  it("is 3, matching PROPERTY.maxItemsPerScan", () => {
    const src = readFileSync(new URL("../../config/neura.ts", import.meta.url), "utf8");
    assert.match(src, /maxItemsPerScan:\s*3\b/);
    assert.equal(ITEM_CAP, 3);
  });

  it("allows the first three items and refuses a fourth before the server", () => {
    assert.equal(canAddItem(0), true);
    assert.equal(canAddItem(1), true);
    assert.equal(canAddItem(2), true);
    assert.equal(canAddItem(ITEM_CAP - 1), true);
    assert.equal(canAddItem(3), false);
    assert.equal(canAddItem(ITEM_CAP), false);
    assert.equal(canAddItem(4), false);
    assert.equal(slotsLeft(0), 3);
    assert.equal(slotsLeft(2), 1);
    assert.equal(slotsLeft(3), 0);
    assert.equal(slotsLeft(9), 0);
  });
});

describe("status labels", () => {
  it("maps draft, verified, disputed, and everything else", () => {
    for (const status of ["draft", "Draft", " DRAFT "]) {
      assert.equal(recordTone(status), "draft");
      assert.equal(statusLabel(status), "Draft");
    }
    for (const status of ["verified", "minted", "confirmed", "finalized"]) {
      assert.equal(recordTone(status), "verified");
      assert.equal(statusLabel(status), "Verified");
    }
    assert.equal(recordTone("disputed"), "disputed");
    assert.equal(statusLabel("Disputed"), "Disputed");
    for (const status of [
      "claimed_offchain",
      "pending_mint",
      "awaiting_mint",
      "pending",
      "revoked",
      "withdrawn",
      "failed",
      "superseded",
      "",
      "nope",
    ]) {
      assert.equal(recordTone(status), "other");
      assert.equal(statusLabel(status), "Other");
    }
    assert.equal(statusLabel(null), "Other");
    assert.equal(statusLabel(undefined), "Other");
  });

  it("picks the card tone: dashed draft, gold verified, amber dispute, grey other", () => {
    assert.equal(cardTone("draft", null), "draft");
    assert.equal(cardTone("draft", "finalized"), "draft");
    assert.equal(cardTone("disputed", "finalized"), "disputed");
    assert.equal(cardTone("minted", "awaiting_mint"), "verified");
    assert.equal(cardTone("claimed_offchain", "finalized"), "verified");
    assert.equal(cardTone("claimed_offchain", "awaiting_mint"), "other");
    assert.equal(cardTone("revoked", null), "other");
    assert.equal(toneLabel("draft"), "Draft");
    assert.equal(toneLabel("verified"), "Verified");
    assert.equal(toneLabel("disputed"), "Disputed");
    assert.equal(toneLabel("other"), "Other");
    assert.equal(toneClass("draft"), "ndu-rec ndu-rec--draft");
    assert.equal(toneClass("verified"), "ndu-rec ndu-rec--verified");
    assert.equal(toneClass("disputed"), "ndu-rec ndu-rec--disputed");
    assert.equal(toneClass("other"), "ndu-rec ndu-rec--other");
  });
});

describe("hash truncation", () => {
  it("keeps short values and shortens a full sha256", () => {
    const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert.equal(hash.length, 64);
    assert.equal(truncateHash(hash), "01234567…cdef");
    assert.equal(truncateHash(`  ${hash}  `), "01234567…cdef");
    assert.equal(truncateHash("abcd"), "abcd");
    assert.equal(truncateHash("123456789012"), "123456789012");
    assert.equal(truncateHash("1234567890123"), "12345678…0123");
    assert.equal(truncateHash("   "), "");
    assert.ok(truncateHash(hash).length < hash.length);
  });
});
