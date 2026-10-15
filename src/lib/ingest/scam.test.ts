import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifierScore,
  extractHosts,
  foldConfusables,
  lookalike,
  registrable,
  scamCheck,
} from "./scam.ts";

describe("lookalike domains (#4)", () => {
  it("finds registrable domains", () => {
    assert.equal(registrable("login.paypal.com.secure-check.co"), "secure-check.co");
    assert.equal(registrable("upload.example.com.mx"), "example.com.mx");
    assert.equal(registrable("www.paypal.com"), "paypal.com");
  });
  it("folds confusables", () => {
    assert.equal(foldConfusables("arnazon"), "amazon");
    assert.equal(foldConfusables("PayPa1"), "paypal");
    assert.equal(foldConfusables("g00gle"), "google");
  });
  it("flags homoglyphs, typos, brand-in-host and punycode, but never the real domains", () => {
    assert.equal(lookalike("paypa1.com")?.how, "homoglyph");
    assert.equal(lookalike("arnazon.co")?.brand, "Amazon");
    assert.equal(lookalike("coinbasse.com")?.how, "typo");
    assert.equal(lookalike("mileageplus-rewards.net")?.brand, "United Airlines");
    assert.equal(lookalike("paypal-secure-login.com")?.how, "brand-in-host");
    assert.equal(lookalike("xn--pypal-4ve.com")?.how, "punycode");
    for (const ok of [
      "paypal.com",
      "www.paypal.com",
      "accounts.google.com",
      "wa.me",
      "united.com",
      "apply.ng",
      "unitedbakery.com",
      "office.ng",
      "mamaput.ng",
    ]) {
      assert.equal(lookalike(ok), null, ok);
    }
  });
  it("doesn't mistake prices for hosts", () => {
    assert.deepEqual(extractHosts("Only 2.50 each, see shop.example.ng"), ["shop.example.ng"]);
  });
});

describe("scam / impersonation check (#4)", () => {
  const flagged = [
    "Earn 10% daily guaranteed returns, withdraw profits any time. Join on telegram",
    "PayPal support: verify your account at paypa1-login.com within 24 hours",
    "Send your seed phrase to our official Phantom support agent to fix your wallet",
    "Room for rent, pay deposit first before viewing, owner is abroad. Send to my wallet address",
    "Gift cards only. Pay release fee and the car ships today",
    "G00gle Drive document shared with you, sign in at drive-google.share-docs.co",
  ];
  const fine = [
    "Fresh bread every morning, open 7am",
    "Hair braiding, WhatsApp me to book",
    "Phone repair, pay after the fix. Cash or transfer",
    "Apple and orange juice, chilled",
    "United we stand: community clean-up this Saturday",
    "Selling a used iPhone charger, test before you pay",
    "Barbing salon, our team is open late",
    "Visit our shop at mamaput.ng for the menu",
  ];
  it("flags scams for review with reasons", () => {
    for (const t of flagged) {
      const r = scamCheck(t);
      assert.notEqual(r.level, "ok", `${t} -> ${r.score}`);
      assert.ok(r.reasons.length > 0);
    }
    assert.equal(scamCheck(flagged[1]).level, "high");
    assert.ok(scamCheck(flagged[1]).reasons.some((x) => x.code === "lookalike_domain"));
    assert.ok(scamCheck(flagged[2]).reasons.some((x) => x.code === "credentials"));
  });
  it("leaves ordinary listings alone (WhatsApp / transfer alone are not scams here)", () => {
    for (const t of fine) {
      const r = scamCheck(t);
      assert.equal(r.level, "ok", `${t} -> ${r.score} ${JSON.stringify(r.reasons)}`);
    }
  });
  it("never auto-bans", () => {
    for (const t of [...flagged, ...fine]) assert.equal(scamCheck(t).autoBan, false);
  });
  it("the classifier alone can lift to review but not to high", () => {
    const t = "Investment club, profit every day, bring two people to unlock withdrawal";
    assert.ok(classifierScore(t) > 0.9);
    assert.ok(classifierScore("Fresh fruit stall near the market") < 0.5);
    const r = scamCheck("bring two people, profit every day in our club");
    assert.notEqual(r.level, "high");
  });
  it("joins fields (name + offer)", () => {
    assert.notEqual(
      scamCheck("Coinbase Help Desk", "recover your account, pay processing fee first").level,
      "ok",
    );
  });
});
