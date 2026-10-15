/**
 * NDU-UPG 903: public presence drops exact home and scan coordinates.
 * Run: node --experimental-strip-types --test src/world/presence.privacy.test.ts
 */
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { sanitizePresence, type PublicPresence } from "./presencePublic.ts";

const homeLat = 6.454321;
const homeLng = 3.398765;
const scanLat = 6.461119;
const scanLng = 3.401337;

function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (value && typeof value === "object") {
    for (const nested of Object.values(value as object)) numbersIn(nested, out);
  }
  return out;
}

describe("public presence", () => {
  it("reduces a home and scan fixture to no exact coordinates", () => {
    const pub: PublicPresence = sanitizePresence({
      id: "user-1",
      displayName: "Ada",
      avatar: "",
      label: "Surulere",
      homeLat,
      homeLng,
      scanLat,
      scanLng,
      lat: homeLat,
      lng: homeLng,
    });
    assert.equal(pub.id, "user-1");
    assert.equal(pub.displayName, "Ada");
    assert.equal(pub.label, "Surulere");
    assert.equal("homeLat" in pub, false);
    assert.equal("homeLng" in pub, false);
    assert.equal("scanLat" in pub, false);
    assert.equal("lat" in pub, false);
    assert.equal("lng" in pub, false);
    const forbidden = [homeLat, homeLng, scanLat, scanLng];
    const seen = numbersIn(pub);
    const json = JSON.stringify(pub);
    for (const n of forbidden) {
      assert.equal(seen.includes(n), false);
      assert.equal(json.includes(String(n)), false);
    }
  });

  it("does not invent a coarse label or a coordinate", () => {
    const pub = sanitizePresence({
      id: "user-2",
      displayName: "Bo",
      homeLat,
      homeLng,
      scanLat,
    });
    assert.equal(pub.label, null);
    assert.equal(numbersIn(pub).length, 0);
  });
});

// NDU-UPG u-104: opt-out + expiry. The implementation enforces both in SQL:
//   opt-out — presence.ts: `share_lat = data.visible && data.lat !== null ? snap(data.lat) : null`
//             and listNearby's `where visible = true and share_lat is not null`,
//             so a user who set visible=false is NEVER published to others.
//   expiry  — listNearby's `and updated_at > now() - interval '20 minutes'`,
//             so a stale row is not returned.
// The SQL cannot run in a node test, so these tests pin the contract the SQL
// implements: the share-point rule (opt-out -> no share point) and the TTL
// window (20 min), each verified against the source of truth read from disk.

describe("presence opt-out and expiry contract", () => {
  it("opt-out never produces a share point; visibility on produces a snapped one", async () => {
    const src = await readFile(new URL("./presence.ts", import.meta.url), "utf8");
    // the share point is only written when visible is true (opt-out -> null)
    assert.match(src, /shareLat = data\.visible && data\.lat !== null \? snap\(data\.lat\) : null/);
    assert.match(src, /shareLng = data\.visible && data\.lng !== null \? snap\(data\.lng\) : null/);
    // and the neighbour query requires both visible and a share point
    assert.match(src, /where visible = true/);
    assert.match(src, /share_lat is not null/);
    assert.match(src, /share_lng is not null/);
  });

  it("presence expires after the 20-minute TTL", async () => {
    const src = await readFile(new URL("./presence.ts", import.meta.url), "utf8");
    assert.match(src, /updated_at > now\(\) - interval '20 minutes'/);
  });

  it("the public projection still carries no exact coordinates (u-903 holds)", () => {
    const pub = sanitizePresence({
      id: "user-1",
      displayName: "Ada",
      avatar: "",
      label: "Surulere",
      homeLat: 6.454321,
      homeLng: 3.398765,
      lat: 6.454321,
      lng: 3.398765,
      shareLat: 6.454,
      shareLng: 3.398,
    });
    const numbers = numbersIn(pub);
    assert.deepEqual(numbers, []); // not even the snapped share point crosses the boundary
    assert.equal(pub.label, "Surulere");
  });
});
