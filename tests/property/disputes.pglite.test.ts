/**
 * NDU-34/35: dispute flow on a throwaway PGLite with every migration applied. Run:
 *   node --experimental-transform-types --no-warnings --import ./tests/property/register.mjs --test tests/property/disputes.pglite.test.ts
 */
import { it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.DATABASE_URL ||= "postgres://ci@127.0.0.1:9/ndu_ci_unused";

it("open by a group viewer, answer by the owner, settle by an admin; owner can't self-dispute", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = path.join(ROOT, "migrations");
  for (const { path: file } of pendingMigrations(await readdir(dir), [])) await pg.exec(await readFile(path.join(dir, file), "utf8"));
  const { pgliteSql } = await import("../../src/lib/db.ts");
  const sql = pgliteSql(pg);
  const P = await import("../../src/world/property.server.ts");
  const D = await import("../../src/world/disputes/disputes.server.ts");
  const scanId = randomUUID();
  await sql`insert into scan_assets (id, user_id, name, format, bytes, sha256, storage_key) values (${scanId}, 'owner', 'r.glb', 'glb', 1, ${"0".repeat(64)}, 'k')`;
  const itemId = randomUUID();
  await P.insertItemCapped(sql, { id: itemId, userId: "owner", scanId, recordRef: randomBytes(8).toString("hex"), assetClass: "household", scope: "personal", groupId: null, labelEnc: "x" }, 3);

  await assert.rejects(D.disputeAct(sql, "owner", itemId, "open", false), /own record/);
  // a stranger can't see a personal item at all
  await assert.rejects(D.disputeView(sql, "stranger", itemId, false), /Unknown item/);
  // a group viewer opens it (group membership is covered elsewhere); seed that row, then run owner/admin steps
  await sql`insert into disputes (id, subject_id, status) values (${randomUUID()}, ${itemId}, 'open')`;
  let v = await D.disputeView(sql, "owner", itemId, false);
  assert.equal(v.dispute?.status, "open");
  assert.equal(v.canChallenge, true);
  await assert.rejects(D.disputeAct(sql, "owner", itemId, "settle", false), /admin/);
  v = await D.disputeAct(sql, "owner", itemId, "challenge", false);
  assert.equal(v.dispute?.status, "challenged");
  v = await D.disputeAct(sql, "owner", itemId, "settle", true);
  assert.equal(v.dispute?.status, "settled");
  assert.equal(v.canOpen, false); // owner still can't open on own record
  await pg.close();
});
