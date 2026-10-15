/**
 * F1 on REAL Postgres, through the app's own database setup: `src/lib/db.ts` `getSql()` with DATABASE_URL set,
 * i.e. the node-postgres Pool and its `Sql.transaction()` (BEGIN / SELECT … FOR UPDATE / COMMIT on one pooled
 * client) that production uses against citydesk-pg. The PGLite twin (item-cap.pglite.test.ts) can't show this:
 * PGLite is a single connection, so it never waits on a real row lock.
 *
 * CI points TEST_DATABASE_URL at its throwaway postgres:16 service (migrations already applied by the
 * "Migrations" step). Locally:
 *   TEST_DATABASE_URL=postgres://qa@127.0.0.1:5440/citydesk_qa \
 *     node --experimental-strip-types --import ./tests/property/register.mjs --test tests/property/item-cap.pg.test.ts
 * Skips without TEST_DATABASE_URL; refuses anything that isn't a local scratch database.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";

type Sql = import("../../src/lib/db.ts").Sql;
type Server = typeof import("../../src/world/property.server.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_URL = process.env.TEST_DATABASE_URL?.trim() ?? "";
const MAX = 3;
const PARALLEL = 8;

/** Same guard as property.integration.test.ts: local scratch databases only, never citydesk-pg. */
function refuseNonScratch(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "TEST_DATABASE_URL is not a URL";
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname)) return "only a local scratch database is allowed";
  if (u.port === "5436") return "port 5436 is citydesk-pg (production) — never test against it";
  if (!/(qa|test|ci)/i.test(u.pathname)) return 'the database name must contain "qa", "test" or "ci"';
  return null;
}

const skip = !existsSync(path.join(ROOT, "src/world/property.server.ts"))
  ? "property.server.ts not in this tree"
  : !DB_URL
    ? "set TEST_DATABASE_URL to a scratch Postgres to run the real-Postgres item-cap test"
    : false;

describe("F1 on real Postgres: per-scan item cap through db.ts getSql() (pg Pool + transaction)", { skip }, () => {
  let sql: Sql;
  let S: Server;
  const userId = `qa-cap-${randomUUID()}`;
  const scans: string[] = [];

  before(async () => {
    const refusal = refuseNonScratch(DB_URL);
    assert.equal(refusal, null, refusal ?? "");
    // db.ts picks its backend from DATABASE_URL at import time: this is the production (pg) path.
    process.env.DATABASE_URL = DB_URL;
    // Idempotent; a no-op in CI where the Migrations step already ran.
    const mig = spawnSync(process.execPath, ["scripts/migrate.mjs"], { cwd: ROOT, env: { ...process.env, DATABASE_URL: DB_URL }, encoding: "utf8" });
    assert.equal(mig.status, 0, `migrate.mjs failed:\n${mig.stdout}\n${mig.stderr}`);

    const db = await import("../../src/lib/db.ts");
    assert.equal(db.dbSource, "neon", "db.ts must be on the DATABASE_URL (node-postgres) backend");
    sql = await db.getSql();
    assert.equal(typeof sql.transaction, "function", "the pg backend must expose Sql.transaction()");
    S = await import("../../src/world/property.server.ts");
  });

  after(async () => {
    if (!sql) return;
    await sql`delete from property_items where user_id = ${userId}`;
    await sql`delete from scan_assets where user_id = ${userId}`;
  });

  const newScan = async () => {
    const id = randomUUID();
    await sql`insert into scan_assets (id, user_id, name, format, bytes, sha256, storage_key)
      values (${id}, ${userId}, 'room.glb', 'glb', 1, ${"0".repeat(64)}, ${`qa/${id}`})`;
    scans.push(id);
    return id;
  };
  const row = (scanId: string) => ({
    id: randomUUID(),
    userId,
    scanId,
    recordRef: randomBytes(8).toString("hex"),
    assetClass: "household",
    scope: "personal",
    groupId: null,
    labelEnc: "x",
  });
  const count = async (scanId: string) =>
    (await sql<{ n: number }>`select count(*)::int as n from property_items where scan_id = ${scanId}`)[0].n;

  it(`${PARALLEL} parallel adds to one room on separate pooled connections: exactly ${MAX} land, the rest get 409`, async () => {
    // Three rooms, each hit by PARALLEL concurrent adds at once, so lock waits really happen across pool clients.
    const rooms = await Promise.all([newScan(), newScan(), newScan()]);
    const results = await Promise.all(
      rooms.map((scanId) => Promise.allSettled(Array.from({ length: PARALLEL }, () => S.insertItemCapped(sql, row(scanId), MAX)))),
    );
    for (const [i, scanId] of rooms.entries()) {
      const ok = results[i].filter((r) => r.status === "fulfilled").length;
      const rejected = results[i].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      assert.equal(ok, MAX, `room ${i}: ${ok} adds succeeded`);
      assert.equal(await count(scanId), MAX, `room ${i}: row count`);
      for (const r of rejected) assert.equal((r.reason as { status?: number }).status, 409, String(r.reason));
    }
  });

  it("a rejected add rolls back and leaves the pool usable", async () => {
    const scanId = await newScan();
    for (let i = 0; i < MAX; i += 1) await S.insertItemCapped(sql, row(scanId), MAX);
    await assert.rejects(S.insertItemCapped(sql, row(scanId), MAX), (e: { status?: number }) => e.status === 409);
    assert.equal(await count(scanId), MAX);
    // Every pooled client came back clean: outside a transaction each statement is its own transaction, so
    // now() == statement_timestamp(). A client left inside an open transaction would report an older now().
    const fresh = await Promise.all(
      Array.from({ length: 10 }, () => sql<{ fresh: boolean }>`select now() = statement_timestamp() as fresh, pg_sleep(0.05)::text as _s`),
    );
    assert.ok(fresh.every((r) => r[0].fresh === true), "a pooled connection was left inside an open transaction");
  });
});
