import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { listingReview, scamFor } from "./review.server.ts";

const SCAM = ["PayPal Support", "verify your account at paypa1-login.com within 24 hours"];
afterEach(() => {
  delete process.env.INGEST_SCAM_HOLD;
  delete process.env.INGEST_SCAM_FLAG;
});

describe("listing review glue (#4)", () => {
  it("flags for managers but never holds by default", () => {
    assert.equal(scamFor("Bread", "fresh every morning"), null);
    assert.equal(scamFor(...SCAM)?.level, "high");
    const r = listingReview("b1", ...SCAM);
    assert.equal(r.hold, false);
    assert.ok(r.public?.reasons.length);
  });
  it("holds a high listing only when INGEST_SCAM_HOLD is on, and stays quiet when the check is off", () => {
    process.env.INGEST_SCAM_HOLD = "on";
    assert.equal(listingReview("b2", ...SCAM).hold, true);
    assert.equal(listingReview("b3", "Bread", "fresh").hold, false);
    process.env.INGEST_SCAM_FLAG = "off";
    assert.deepEqual(listingReview("b4", ...SCAM), { hold: false, public: null });
    assert.equal(scamFor(...SCAM), null);
  });
});
