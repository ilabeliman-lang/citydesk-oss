/**
 * NDU-UPG inspect (#04): migration 0020 (property_item_attributes) on a THROWAWAY in-memory PGLite with every
 * migration applied (no real database is touched). Run:
 *   node --experimental-transform-types --no-warnings --import ./tests/property/register.mjs --test tests/property/inspect.integration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function freshDb() {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = path.join(ROOT, "migrations");
  for (const { path: file } of pendingMigrations(await readdir(dir), [])) await pg.exec(await readFile(path.join(dir, file), "utf8"));
  const item = randomUUID();
  await pg.query(`insert into property_items (id, user_id, record_ref, asset_class, label_enc) values ($1, 'u1', $2, 'household', 'x')`, [item, randomUUID().replace(/-/g, "").slice(0, 16)]);
  return { pg, item };
}

const reject = async (pg: PGlite, sql: string, params: unknown[]) => {
  await assert.rejects(pg.query(sql, params), /check|violates|constraint/i);
};

describe("inspect #04: property_item_attributes", () => {
  it("applies and accepts a valid row", async () => {
    const { pg, item } = await freshDb();
    await pg.query(`insert into property_item_attributes (item_id, user_id, category, material, dim_x_m, dim_y_m, dim_z_m, mass_kg, mass_source, pin_source) values ($1, 'u1', 'chair', 'wood', 0.5, 0.9, 0.5, 7, 'estimated', 'raycast')`, [item]);
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from property_item_attributes`);
    assert.equal(r.rows[0].n, 1);
    await pg.close();
  });
  it("check constraints reject bad values", async () => {
    const { pg, item } = await freshDb();
    const ins = `insert into property_item_attributes (item_id, user_id, category, material, dim_x_m, mass_kg, mass_source, pin_source) values ($1, 'u1', $2, $3, $4, $5, $6, $7)`;
    await reject(pg, ins, [item, "spaceship", null, null, null, null, null]);
    await reject(pg, ins, [item, null, "Wood; drop table", null, null, null, null]);
    await reject(pg, ins, [item, null, null, 0, null, null, null]);
    await reject(pg, ins, [item, null, null, 60, null, null, null]);
    await reject(pg, ins, [item, null, null, null, -1, null, null]);
    await reject(pg, ins, [item, null, null, null, null, "guess", null]);
    await reject(pg, ins, [item, null, null, null, null, null, "gps"]);
    await pg.close();
  });
  it("deleting the item cascades to its attributes", async () => {
    const { pg, item } = await freshDb();
    await pg.query(`insert into property_item_attributes (item_id, user_id, category) values ($1, 'u1', 'storage')`, [item]);
    await pg.query(`delete from property_items where id = $1`, [item]);
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from property_item_attributes`);
    assert.equal(r.rows[0].n, 0);
    await pg.close();
  });
  it("an attribute row needs a real item", async () => {
    const { pg } = await freshDb();
    await assert.rejects(pg.query(`insert into property_item_attributes (item_id, user_id) values ('nope', 'u1')`), /foreign key|violates/i);
    await pg.close();
  });
});
