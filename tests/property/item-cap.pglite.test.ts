/**
 * F1: the 3-items-per-scan cap under concurrency, on a THROWAWAY in-memory PGLite with every migration
 * applied (no real database is touched). Run:
 *   node --experimental-strip-types --import ./tests/property/register.mjs --test tests/property/item-cap.pglite.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const skip = existsSync(path.join(ROOT, "src/world/property.server.ts")) ? false : "property.server.ts not in this tree";
const MAX = 3;
// db.ts eagerly boots its own PGLite (via import.meta.glob, Vite-only) when DATABASE_URL is unset. Point it at
// an unreachable local "ci" URL instead: its pool is lazy and never used, since every call here gets the
// throwaway PGLite `sql` passed in explicitly.
process.env.DATABASE_URL ||= "postgres://ci@127.0.0.1:9/ndu_ci_unused";

async function freshDb() {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = path.join(ROOT, "migrations");
  for (const { path: file } of pendingMigrations(await readdir(dir), [])) await pg.exec(await readFile(path.join(dir, file), "utf8"));
  const { pgliteSql } = await import("../../src/lib/db.ts");
  const sql = pgliteSql(pg);
  const scanId = randomUUID();
  await sql`insert into scan_assets (id, user_id, name, format, bytes, sha256, storage_key)
    values (${scanId}, 'u1', 'room.glb', 'glb', 1, ${"0".repeat(64)}, 'k')`;
  return { pg, sql, scanId };
}

const row = (scanId: string) => {
  const id = randomUUID();
  return { id, userId: "u1", scanId, recordRef: randomBytes(8).toString("hex"), assetClass: "household", scope: "personal", groupId: null, labelEnc: "x" };
};

describe("F1: per-scan item cap is race-free", { skip }, () => {
  it("8 parallel adds to one room: exactly 3 land, the rest get 409", async () => {
    const { pg, sql, scanId } = await freshDb();
    const { insertItemCapped } = await import("../../src/world/property.server.ts");
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => insertItemCapped(sql, row(scanId), MAX)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const n = (await sql<{ n: number }>`select count(*)::int as n from property_items where scan_id = ${scanId}`)[0].n;
    assert.equal(ok, MAX);
    assert.equal(n, MAX);
    assert.ok(rejected.every((r) => (r.reason as { status?: number }).status === 409));
    await pg.close();
  });

  it("control: the same adds WITHOUT the transaction overshoot the cap (the old race)", async () => {
    const { pg, sql, scanId } = await freshDb();
    const { insertItemCapped } = await import("../../src/world/property.server.ts");
    // same queries, no transaction method
    const bare = Object.assign((s: TemplateStringsArray, ...v: unknown[]) => sql(s, ...v), { query: sql.query }) as typeof sql;
    await Promise.allSettled(Array.from({ length: 8 }, () => insertItemCapped(bare, row(scanId), MAX)));
    const n = (await sql<{ n: number }>`select count(*)::int as n from property_items where scan_id = ${scanId}`)[0].n;
    assert.ok(n > MAX, `expected the unlocked path to overshoot, got ${n}`);
    await pg.close();
  });
});
