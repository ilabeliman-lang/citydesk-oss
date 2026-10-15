// NDU-UPG inspect (#04): privacy gate. Public objects expose allow-listed OSM tags only, and
// residential buildings never expose house numbers, operators, websites or contacts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterPublicTags, isResidential, onlyPublicKeys, PUBLIC_TAG_KEYS, MAX_TAGS } from "./tagPolicy.ts";
import { buildingProfile, propProfile } from "./profile.ts";
import { pickAt, type PickMap } from "./pick.ts";

const RESIDENTIAL = { building: "house", owner: "Ada Obi", phone: "+2348000000", "contact:email": "ada@example.com", "addr:housenumber": "12", operator: "Obi Family", website: "https://ada.example", note: "gate code 1234", "addr:street": "Aba Road", height: "7" };

test("privacy: residential fixture drops owner/phone/contact/house number/operator/website/note", () => {
  const out = filterPublicTags(RESIDENTIAL);
  for (const k of ["owner", "phone", "contact:email", "addr:housenumber", "operator", "website", "note"]) assert.ok(!(k in out), k);
  assert.equal(out.building, "house");
  assert.equal(out["addr:street"], "Aba Road");
  assert.ok(isResidential(RESIDENTIAL));
});
test("privacy: commercial fixture keeps shop, operator, house number, hours", () => {
  const out = filterPublicTags({ building: "retail", shop: "supermarket", operator: "Spar", "addr:housenumber": "4", opening_hours: "Mo-Sa 08:00-20:00", phone: "+234" });
  assert.equal(out.shop, "supermarket");
  assert.equal(out.operator, "Spar");
  assert.equal(out["addr:housenumber"], "4");
  assert.equal(out.opening_hours, "Mo-Sa 08:00-20:00");
  assert.ok(!("phone" in out));
});
test("privacy: name:en kept, other name:* dropped; residential landuse without a shop counts", () => {
  const out = filterPublicTags({ building: "yes", name: "X", "name:en": "X en", "name:yo": "X yo" });
  assert.equal(out["name:en"], "X en");
  assert.ok(!("name:yo" in out));
  assert.ok(isResidential({ building: "yes", landuse: "residential" }));
  assert.ok(!isResidential({ building: "yes", landuse: "residential", shop: "kiosk" }));
});
test("privacy: long values, non-geometry source, caps", () => {
  const out = filterPublicTags({ building: "yes", name: "x".repeat(201), source: "my neighbour told me", wikidata: "Q1" });
  assert.ok(!("name" in out));
  assert.ok(!("source" in out));
  assert.equal(filterPublicTags({ building: "yes", source: "survey" }).source, "survey");
  assert.ok(Object.keys(filterPublicTags(Object.fromEntries(PUBLIC_TAG_KEYS.map((k) => [k, "v"])))).length <= MAX_TAGS);
});
test("privacy: a building profile never carries a non-public key or a private value", () => {
  const p = buildingProfile({ feature: { id: 10, layer: { id: "building" }, properties: {}, geometry: { type: "Polygon", coordinates: [[[7, 4.8], [7.0001, 4.8], [7.0001, 4.8001], [7, 4.8]]] } }, tags: RESIDENTIAL, lngLat: [7, 4.8], nowYear: 2026 });
  const json = JSON.stringify(p);
  assert.ok(onlyPublicKeys(p.tags));
  for (const v of ["Ada Obi", "+2348000000", "ada@example.com", "gate code", "Obi Family", "ada.example"]) assert.ok(!json.includes(v), v);
  assert.ok(!p.sets.some((s) => s.id === "yours"), "public profile has no Yours set");
});
test("privacy: prop tags go through the allow-list too", () => {
  const p = propProfile("bench", { kind: "bench", osmId: 1, osmType: "n", lng: 7, lat: 4.8, heightM: 0.9, widthM: 1.5, depthM: 0.5, src: "osm", tags: { amenity: "bench", phone: "+234", "contact:email": "x@y.z" } });
  assert.ok(onlyPublicKeys(p.tags));
});
test("privacy: scan targets only come from the viewer's own ScanMap (no scans → never a scan)", () => {
  const map: PickMap = { queryRenderedFeatures: () => [], unproject: () => ({ lng: 7, lat: 4.8 }), getBearing: () => 0 };
  assert.equal(pickAt(map, { x: 0, y: 0 }, { scans: null, layers: ["building"] }), null);
});

// ── T10 server tag cache ─────────────────────────────────────────────────────────────────────────
import { _resetTagCaches, createLimiter, lookupTags, rememberCellTags, rememberIdTags, statsForCell } from "./tagCache.ts";

test("privacy: the server tag cache only ever stores allow-listed tags", () => {
  _resetTagCaches();
  rememberCellTags("1:2", [{ type: "way", id: 5, tags: { ...RESIDENTIAL } }, { type: "way", id: 6, tags: { landuse: "residential" } }, { type: "node", id: 7, tags: { building: "yes" } }]);
  const hit = lookupTags(5, "1:2")!;
  assert.equal(hit.source, "cell");
  assert.ok(onlyPublicKeys(hit.tags));
  assert.ok(!JSON.stringify(hit).includes("Ada"));
  assert.equal(lookupTags(6, "1:2"), null, "landuse ways are not buildings");
  assert.equal(lookupTags(7, "1:2"), null, "nodes are not stored");
  assert.equal(lookupTags(5, "9:9")?.cell, "1:2", "found in any cached cell");
  assert.ok(onlyPublicKeys(rememberIdTags(8, { building: "yes", phone: "1" })));
  assert.equal(lookupTags(8)?.source, "id");
  assert.equal(lookupTags(8, undefined, Date.now() + 25 * 3600_000), null, "24 h TTL");
  assert.equal(statsForCell("1:2")?.n, 1);
});
test("tag lookups are rate limited to 30 a minute per client", () => {
  const allow = createLimiter(30, 60_000);
  for (let i = 0; i < 30; i += 1) assert.equal(allow("ip", 1000 + i).ok, true);
  const r = allow("ip", 1100);
  assert.equal(r.ok, false);
  assert.equal(allow("other", 1100).ok, true);
  assert.equal(allow("ip", 61_001).ok, true);
});
