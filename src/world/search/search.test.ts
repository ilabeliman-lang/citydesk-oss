/**
 * NDU-AI search tests: golden ranking queries, typo tolerance, the privacy filter and the hybrid
 * (vector) fusion. Run: node --experimental-strip-types --test src/world/search/search.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocs, embedText } from "./docs.ts";
import { parseQuery, SearchIndex } from "./engine.ts";
import { FIXTURE, ORIGIN } from "./fixture.ts";
import { isPrivateField, publicRecord, redactText } from "./privacy.ts";
import { editDistance, family, fold, tokens } from "./text.ts";

const docs = buildDocs(FIXTURE);
const index = new SearchIndex(docs);
const top = (q: string, n = 1) => index.search(q, { here: ORIGIN }).slice(0, n).map((h) => h.doc.title);

// ---------------------------------------------------------------- golden queries
const GOLDEN: [string, string][] = [
  ["quiet street near the market with a tall building", "Okija Street"],
  ["Ikwerre Road", "Ikwerre Road"],
  ["ikwere road", "Ikwerre Road"], // typo
  ["ikwerre rd", "Ikwerre Road"],
  ["okjia street", "Okija Street"], // transposition
  ["chemist", "Garden City Pharmacy"], // local word family
  ["pharmacy", "Garden City Pharmacy"],
  ["chemst", "Garden City Pharmacy"], // typo inside a family word
  ["fuel", "Total Filling Station"],
  ["petrol", "Total Filling Station"],
  ["tallest building", "Delta Towers"],
  ["delta tower", "Delta Towers"],
  ["buy bread", "Sweet Crust Bakery"],
  ["barber", "Chidi Barbershop"],
  ["mile 1 market", "Mile One Market"], // numerals
  ["catholic church", "St. Mary's Catholic Church"],
  ["masjid", "Central Mosque"],
  ["hotel", "Presidential Hotel"],
  ["red keke", "red keke model"], // public scan label
  ["okija", "Okija Street"],
  ["presidental", "Presidential Hotel"], // typo, prefix of the last word
];

for (const [q, want] of GOLDEN) {
  test(`golden: "${q}" -> ${want}`, () => {
    assert.equal(top(q)[0], want, `top hits: ${top(q, 4).join(" | ")}`);
  });
}

test("golden: busy main road ranks the primary/trunk roads above residential ones", () => {
  const t = top("busy main road", 2).sort();
  assert.deepEqual(t, ["Aba Road", "Ikwerre Road"]);
});

test("golden: 'food near the market' returns food places that are actually by the market", () => {
  const hits = index.search("food near the market", { here: ORIGIN }).slice(0, 2).map((h) => h.doc.title).sort();
  assert.deepEqual(hits, ["Mama Ngozi Buka", "Sweet Crust Bakery"]);
});

test("ranking explains itself (reasons) for the compositional query", () => {
  const [hit] = index.search("quiet street near the market with a tall building");
  assert.equal(hit.doc.kind, "street");
  assert.ok(hit.reasons.some((r) => r.includes("quiet")));
  assert.ok(hit.reasons.some((r) => r.includes("Mile One Market")));
  assert.ok(hit.reasons.some((r) => r.includes("62 m")));
});

test("nonsense and empty queries return nothing instead of noise", () => {
  assert.deepEqual(index.search(""), []);
  assert.deepEqual(index.search("zzqx vrrp"), []);
});

test("query parser: anchors, kind and attributes", () => {
  const p = parseQuery("quiet street near the market with a tall building");
  assert.deepEqual(p.anchors, ["market"]);
  assert.equal(p.wantKind, "street");
  assert.ok(p.quiet && p.tall && !p.busy && !p.tallest);
  assert.equal(parseQuery("tallest building").tallest, true);
  assert.deepEqual(parseQuery("pharmacy close to Okija Street").anchors, ["okija street"]);
});

test("text helpers: fold, tokens, families, edit distance", () => {
  assert.equal(fold("Ọ̀jà Óba, St. Mary's"), "oja oba st marys");
  assert.deepEqual(tokens("the markets near me"), ["market"]);
  assert.ok(family("chemist").includes("pharmacy"));
  assert.ok(family("keke").includes("tricycle") || family("keke").includes("keke") || family("keke").length > 0);
  assert.equal(editDistance("okija", "okjia"), 1);
  assert.equal(editDistance("ikwerre", "ikwere"), 1);
  assert.ok(editDistance("market", "banana") > 2);
});

// ---------------------------------------------------------------- privacy filter
test("privacy: private scans, closed/undeclared listings and unpublished claims are never indexed", () => {
  const titles = docs.map((d) => d.title);
  for (const hidden of ["my bedroom scan", "family parlour", "Hidden Draft Shop", "Undeclared Kiosk", "Generator claim", "Pending TV claim"]) {
    assert.ok(!titles.includes(hidden), `${hidden} leaked into the index`);
  }
  assert.ok(titles.includes("red keke model"), "public scans are indexed");
  assert.deepEqual(index.search("bedroom"), []);
  assert.deepEqual(index.search("generator"), []);
});

test("privacy: owner/contact details never reach a document or the embedded text", () => {
  const blob = JSON.stringify(docs) + docs.map(embedText).join("\n");
  for (const secret of ["0803", "123 4567", "chidi@example.com", "example.com", "user_secret_1", "user_secret_2", "ownerId"]) {
    assert.ok(!blob.includes(secret), `${secret} leaked`);
  }
  assert.deepEqual(index.search("0803 123 4567"), []);
});

test("privacy: own private scans are searchable only on the owner's phone (ownScanIds)", () => {
  const mine = buildDocs(FIXTURE, { ownScanIds: new Set(["s2"]) });
  const bedroom = mine.find((d) => d.title === "my bedroom scan");
  assert.ok(bedroom && bedroom.mine);
  assert.ok(!mine.some((d) => d.title === "family parlour"));
});

test("privacy: field and text rules", () => {
  for (const f of ["ownerId", "owner_id", "user_id", "userId", "email", "phone", "phoneNumber", "claimantAddress", "walletPubkey", "label_enc", "sha256", "googlePlaceId"]) {
    assert.ok(isPrivateField(f), f);
  }
  for (const f of ["name", "offer", "category", "lat", "lng", "signal", "kind", "h", "visibility"]) assert.ok(!isPrivateField(f), f);
  assert.equal(redactText("Call +234 803 123 4567 now"), "Call now");
  assert.equal(redactText("Mail me: ada@shop.ng, or www.shop.ng/x"), "Mail me");
  assert.equal(redactText("Plot 12-14 Aba Road"), "Plot 12-14 Aba Road");
  assert.equal(redactText("Mile 1 Market"), "Mile 1 Market");
  assert.equal(publicRecord({ source: "property", claimStatus: "claimed_offchain", scope: "community" }).ok, false);
  assert.equal(publicRecord({ source: "property", claimStatus: "minted", scope: "personal" }).ok, false);
  assert.equal(publicRecord({ source: "scan", visibility: "public", status: "failed", lat: 1, lng: 1 }).ok, false);
});

// ---------------------------------------------------------------- hybrid fusion
test("hybrid: a dense vector score lifts a semantically close doc that has no shared words", () => {
  // Fake 3-d "embeddings": the query is about somewhere to sleep, which only the hotel is near.
  const vecs = new Map<string, Float32Array>();
  for (const d of docs) vecs.set(d.id, new Float32Array(d.title === "Presidential Hotel" ? [0.96, 0.28, 0] : [0, 0.28, 0.96]));
  const qvec = new Float32Array([1, 0, 0]);
  const lexOnly = index.search("somewhere to spend the night");
  assert.ok(!lexOnly.length || lexOnly[0].doc.title !== "Presidential Hotel");
  const hybrid = index.search("somewhere to spend the night", { qvec, vecs });
  assert.equal(hybrid[0]?.doc.title, "Presidential Hotel");
  assert.ok(hybrid[0].reasons.includes("similar meaning"));
});

test("hybrid: vectors never override an exact name match", () => {
  const vecs = new Map<string, Float32Array>();
  for (const d of docs) vecs.set(d.id, new Float32Array(d.title === "Presidential Hotel" ? [1, 0] : [0, 1]));
  const hits = index.search("Okija Street", { qvec: new Float32Array([1, 0]), vecs });
  assert.equal(hits[0].doc.title, "Okija Street");
});
