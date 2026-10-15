import { getSql } from "@/lib/db";
import { scanRoot } from "@/world/scan-store.server";
import { scanPipelineReady } from "@/world/scan-schema.server"; // NDU-UPG merge guard (0011)
import { drainJobs, enqueueScan, PIPELINE_FORMATS } from "../../scripts/scan/jobs.mjs";

/**
 * NDU-UPG #351/#378: glue between the scan routes and the CPU pipeline (scripts/scan/*).
 * Inline mode (default): the web server runs one job at a time, each in a child process
 * with a timeout, so a heavy USDZ never blocks requests. SCAN_WORKER=external leaves the
 * queue to the pm2 worker (scripts/scan/worker.mjs).
 */
const g = globalThis as typeof globalThis & { __nduScanDrain__?: Promise<void> | null; __nduScanAgain__?: boolean };

const inline = () => (process.env.SCAN_WORKER ?? "inline").trim() !== "external";

/** Start (or nudge) the in-process runner; HMR-safe, never more than one at a time. */
export function kickScanJobs(): void {
  if (!inline()) return;
  if (g.__nduScanDrain__) {
    g.__nduScanAgain__ = true;
    return;
  }
  g.__nduScanDrain__ = (async () => {
    do {
      g.__nduScanAgain__ = false;
      await drainJobs(await getSql(), scanRoot());
    } while (g.__nduScanAgain__);
  })()
    .catch((err) => console.error("[scan-jobs]", err instanceof Error ? err.message : err))
    .finally(() => {
      g.__nduScanDrain__ = null;
    });
}

/** Queue a fresh upload; formats the pipeline cannot draw yet stay 'stored'. */
export async function queueScan(scanId: string, userId: string, format: string): Promise<boolean> {
  if (!PIPELINE_FORMATS.includes(format)) return false;
  if (!(await scanPipelineReady())) return false; // schema not migrated: keep the upload as stored
  await enqueueScan(await getSql(), scanId, userId);
  kickScanJobs();
  return true;
}

/** Scans uploaded before the pipeline existed get queued the first time their owner looks. */
export async function queueUnprocessed(userId: string): Promise<void> {
  if (!(await scanPipelineReady())) return; // NDU-UPG merge guard (0011)
  const sql = await getSql();
  const rows = await sql<{ id: string }>`select id from scan_assets
    where user_id = ${userId} and status = 'stored' and format in ('glb', 'gltf', 'usdz') limit 20`;
  for (const row of rows) await enqueueScan(sql, row.id, userId);
  const open = await sql<{ n: number }>`select count(*) as n from scan_jobs where user_id = ${userId} and status in ('queued', 'running')`;
  if (rows.length || Number(open[0]?.n ?? 0) > 0) kickScanJobs(); // also resumes after a restart
}

/** Owner asks to try again (after a failure or a pipeline upgrade). */
export async function requeueScan(scanId: string, userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ format: string }>`select format from scan_assets where id = ${scanId} and user_id = ${userId}`;
  if (!rows[0]) return false;
  return queueScan(scanId, userId, rows[0].format);
}
