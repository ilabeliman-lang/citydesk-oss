#!/usr/bin/env node
// @ts-check
/**
 * NDU-UPG #378: optional standalone scan worker for pm2 (citydesk-ops). Use it with
 * SCAN_WORKER=external on the web server so uploads are only queued there:
 *   PM2_HOME=$CITYDESK_OPS/.pm2 pm2 start scripts/scan/worker.mjs --name citydesk-scan-worker
 * Env: DATABASE_URL (required), SCAN_STORAGE_DIR (default ../.citydesk-scans), SCAN_POLL_MS.
 */
import path from "node:path";
import pg from "pg";
import { drainJobs } from "./jobs.mjs";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("[scan-worker] DATABASE_URL is required");
  process.exit(1);
}
const root = process.env.SCAN_STORAGE_DIR?.trim() || path.resolve(process.cwd(), "..", ".citydesk-scans");
const pollMs = Number(process.env.SCAN_POLL_MS) || 5000;
const pool = new pg.Pool({ connectionString: url, max: 2 });
/** Tagged-template adapter over pg ($1.. placeholders). */
const sql = async (strings, ...values) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
  return (await pool.query(text, values)).rows;
};

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
console.log(`[scan-worker] watching scan_jobs; files under ${root}`);
while (!stopping) {
  try {
    const n = await drainJobs(sql, root);
    if (n) console.log(`[scan-worker] processed ${n} job(s)`);
  } catch (err) {
    console.error("[scan-worker]", /** @type {Error} */ (err).message);
  }
  await new Promise((r) => setTimeout(r, pollMs));
}
await pool.end();
