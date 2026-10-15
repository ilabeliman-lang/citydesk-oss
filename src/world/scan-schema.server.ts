import { getSql } from "@/lib/db";

/**
 * NDU-UPG merge guard: the scan pipeline needs migrations/0011_scan_pipeline.sql (status/optimised
 * columns + scan_jobs). Databases that have not had it applied (e.g. a DATABASE_URL server, where
 * migrations run only on deploy) keep working exactly as before: legacy columns, no queueing.
 * SCAN_PIPELINE=off disables conversion even when the schema is there. Re-checked every minute.
 */
const g = globalThis as typeof globalThis & { __nduScanSchema__?: { at: number; ok: Promise<boolean> } };

export function scanPipelineReady(): Promise<boolean> {
  if ((process.env.SCAN_PIPELINE ?? "").trim().toLowerCase() === "off") return Promise.resolve(false);
  const now = Date.now();
  if (g.__nduScanSchema__ && now - g.__nduScanSchema__.at < 60_000) return g.__nduScanSchema__.ok;
  const ok = (async () => {
    const sql = await getSql();
    const rows = await sql<{ n: string | number }>`select count(*) as n from information_schema.columns
      where table_name = 'scan_assets' and column_name in ('status', 'status_reason', 'optimized_key', 'optimized_bytes', 'optimized_sha256', 'pipeline')`;
    const jobs = await sql<{ n: string | number }>`select count(*) as n from information_schema.tables where table_name = 'scan_jobs'`;
    return Number(rows[0]?.n ?? 0) === 6 && Number(jobs[0]?.n ?? 0) > 0;
  })().catch(() => false);
  g.__nduScanSchema__ = { at: now, ok };
  return ok;
}

/** Columns the scan list/placement may select on this database. */
export async function scanCols(): Promise<string> {
  const base = "id, name, format, bytes, created_at, lng, lat, rotation_deg, scale, sha256";
  return (await scanPipelineReady()) ? `${base}, status, status_reason, optimized_bytes, pipeline` : base;
}
