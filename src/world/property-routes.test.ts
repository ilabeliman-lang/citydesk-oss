// NDU-UPG upg-u-032: zod validation on the property API request fields.
// Pure unit tests (node --experimental-transform-types --test) — no database, no
// request context: only the schemas and the `validate` wrapper are exercised.
//
// `@/lib/db` is in the route module's import graph and eagerly boots its own
// PGLite when DATABASE_URL is unset (its migrations use Vite's `import.meta.glob`,
// which does not exist under plain node). Point it at an unused URL first, and
// import the module *after* — ESM hoists static imports above this statement,
// so a plain top-level assignment would run too late.

process.env.DATABASE_URL ||= "postgres://ci@127.0.0.1:9/ndu_ci_unused";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { EvidenceIdSchema, EvidenceUploadSchema, MetadataHashSchema, validate } = await import("./property-routes.server.ts");

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const HASH = "a".repeat(64);

/** The 400 body as JSON, for assertions on the per-field error shape. */
async function body(res: Response): Promise<{ error?: string; fields?: Record<string, string> }> {
  return (await res.json()) as { error?: string; fields?: Record<string, string> };
}

describe("evidence upload fields (X-Item-Id + X-Evidence-Kind)", () => {
  it("accepts a well-formed item id and a known evidence kind", () => {
    const r = validate(EvidenceUploadSchema, { itemId: UUID, kind: "photo" });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data, { itemId: UUID, kind: "photo" });
  });

  it("trims surrounding whitespace on the item id", () => {
    const r = validate(EvidenceUploadSchema, { itemId: `  ${UUID}  `, kind: "receipt" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.itemId, UUID);
  });

  it("400s and names the field when the item id is missing", async () => {
    const r = validate(EvidenceUploadSchema, { kind: "photo" });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.equal((await body(r.response)).fields?.itemId, "Item is required.");
  });

  it("400s when a header is absent entirely (null, as Headers.get returns)", async () => {
    const r = validate(EvidenceUploadSchema, { itemId: null, kind: null });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    const fields = (await body(r.response)).fields ?? {};
    assert.ok(fields.itemId, "itemId is named");
    assert.ok(fields.kind, "kind is named");
  });

  it("400s on a wrong-typed item id", async () => {
    const r = validate(EvidenceUploadSchema, { itemId: 42, kind: "photo" });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.match((await body(r.response)).fields?.itemId ?? "", /expected string/i);
  });

  it("400s on an out-of-range / malformed item id", async () => {
    const r = validate(EvidenceUploadSchema, { itemId: "not-a-uuid", kind: "photo" });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.equal((await body(r.response)).fields?.itemId, "Item is not a valid id.");
  });

  it("400s on an unknown evidence kind", async () => {
    const r = validate(EvidenceUploadSchema, { itemId: UUID, kind: "video" });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.equal((await body(r.response)).fields?.kind, "Evidence is a receipt or a photo.");
  });

  it("reports every bad field at once, and always carries a top-level error", async () => {
    const r = validate(EvidenceUploadSchema, { itemId: "", kind: "video" });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.equal(r.response.headers.get("Content-Type"), "application/json");
    const parsed = await body(r.response);
    assert.ok(parsed.error, "top-level error message present");
    assert.ok(parsed.fields?.itemId && parsed.fields?.kind, "both fields named");
  });
});

describe("GET /api/property/evidence/:id", () => {
  it("accepts a well-formed evidence id", () => {
    const r = validate(EvidenceIdSchema, UUID);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data, UUID);
  });

  it("400s naming the field on a malformed id", async () => {
    const r = validate(EvidenceIdSchema, "../../etc/passwd");
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.equal((await body(r.response)).fields?._ ?? "", "Evidence is not a valid id.");
  });

  it("400s on an over-long id (bounds, not just shape)", async () => {
    const r = validate(EvidenceIdSchema, "a".repeat(65));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.equal((await body(r.response)).fields?._ ?? "", "Evidence is too long.");
  });
});

describe("GET /api/property/meta/:hash(.json)", () => {
  it("accepts a 64-char hex hash, with or without the .json suffix", () => {
    assert.equal(validate(MetadataHashSchema, HASH).ok, true);
    assert.equal(validate(MetadataHashSchema, `${HASH}.json`).ok, true);
  });

  it("400s on a hash of the wrong length", async () => {
    const r = validate(MetadataHashSchema, "abc123");
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.match((await body(r.response)).fields?._ ?? "", /64 hex characters/);
  });

  it("400s on a non-hex hash", async () => {
    const r = validate(MetadataHashSchema, "z".repeat(64));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.match((await body(r.response)).fields?._ ?? "", /64 hex characters/);
  });

  it("400s when the hash is missing", async () => {
    const r = validate(MetadataHashSchema, null);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.response.status, 400);
    assert.ok((await body(r.response)).fields?._, "field is named");
  });
});
