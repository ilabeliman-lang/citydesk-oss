#!/usr/bin/env node
/**
 * Dry-run every top-level migration, in order, on an in-memory PGLite (the dev/preview fallback
 * backend in src/lib/db.ts) — the second engine the same SQL must work on. Touches no real database.
 *   node tests/property/pglite-dryrun.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const pg = new PGlite();
await pg.waitReady;
let failed = 0;
for (const { name, path } of pendingMigrations(await readdir(dir), [])) {
  try {
    await pg.transaction(async (tx) => tx.exec(await readFile(join(dir, path), "utf8")));
    console.log(`[pglite] ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[pglite] FAIL ${name}: ${err?.message}${err?.position ? ` (position ${err.position})` : ""}`);
  }
}
const t = await pg.query("select count(*)::int as n from information_schema.tables where table_name like 'property_%'");
console.log(`[pglite] property_* tables: ${t.rows[0].n}`);
await pg.close();
process.exit(failed ? 1 : 0);
