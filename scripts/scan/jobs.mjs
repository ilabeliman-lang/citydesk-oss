// @ts-check
/**
 * NDU-UPG #378: scan import jobs. A `scan_jobs` row per run, claimed with SKIP LOCKED,
 * run in a CHILD process (pipeline.mjs) with a hard timeout so the web server never
 * blocks, retried up to `maxAttempts` on crashes/timeouts; bad files fail at once.
 * Used by the web server (inline mode, default) and by scripts/scan/worker.mjs (pm2).
 * `sql` is any tagged-template SQL client that resolves to row arrays (src/lib/db.ts, pg).
 */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PRESETS = JSON.parse(readFileSync(path.join(here, "presets.json"), "utf8"));
export const PIPELINE_FORMATS = ["glb", "gltf", "usdz"];
const MAX_ATTEMPTS = PRESETS.limits.maxAttempts;
const TIMEOUT_MS = Number(process.env.SCAN_JOB_TIMEOUT_MS) || PRESETS.limits.timeoutMs;

/**
 * Queue a scan for processing (idempotent while a job is already open).
 * @param {any} sql @param {string} scanId @param {string} userId
 */
export async function enqueueScan(sql, scanId, userId) {
  const open = await sql`select id from scan_jobs where scan_id = ${scanId} and status in ('queued', 'running') limit 1`;
  if (open.length) return open[0].id;
  const id = randomUUID();
  await sql`insert into scan_jobs (id, scan_id, user_id) values (${id}, ${scanId}, ${userId})`;
  await sql`update scan_assets set status = 'queued', status_reason = null, updated_at = now() where id = ${scanId} and user_id = ${userId}`;
  return id;
}

/** Re-open jobs whose runner died (server restart mid-job). @param {any} sql */
export async function recoverStale(sql) {
  const staleMs = TIMEOUT_MS * 2;
  await sql`update scan_jobs set status = 'queued', locked_at = null, updated_at = now()
    where status = 'running' and locked_at < now() - (${staleMs}::int * interval '1 millisecond')`;
}

/** Claim the oldest queued job, or null. @param {any} sql */
export async function claimJob(sql) {
  const rows = await sql`update scan_jobs set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (select id from scan_jobs where status = 'queued' order by created_at limit 1 for update skip locked)
    returning id, scan_id, user_id, attempts`;
  return rows[0] ?? null;
}

/**
 * Run pipeline.mjs as a child process; resolves its JSON line (never throws).
 * @param {{ input: string, format: string, outDir: string, base: string, timeoutMs?: number }} a
 */
export function runPipelineChild(a) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.join(here, "pipeline.mjs"), "--in", a.input, "--format", a.format, "--out-dir", a.outDir, "--base", a.base],
      { timeout: a.timeoutMs ?? TIMEOUT_MS, maxBuffer: 4 << 20, env: { ...process.env, NODE_OPTIONS: "" } },
      (err, stdout) => {
        const last = String(stdout ?? "").trim().split("\n").pop() ?? "";
        try {
          const parsed = JSON.parse(last);
          if (parsed && typeof parsed === "object") return resolve(parsed);
        } catch {
          // fall through
        }
        const killed = /** @type {{ killed?: boolean }} */ (err ?? {}).killed;
        resolve({ ok: false, permanent: false, reason: killed ? "Processing took too long." : "Processing crashed." });
      },
    );
  });
}

/**
 * Process one claimed job end to end and record the outcome.
 * @param {any} sql
 * @param {{ id: string, scan_id: string, user_id: string, attempts: number }} job
 * @param {string} root scan storage root
 */
export async function runJob(sql, job, root) {
  const rows = await sql`select id, user_id, format, storage_key from scan_assets where id = ${job.scan_id} and user_id = ${job.user_id}`;
  const scan = rows[0];
  if (!scan) {
    await sql`update scan_jobs set status = 'failed', last_error = 'scan gone', updated_at = now() where id = ${job.id}`;
    return;
  }
  if (!PIPELINE_FORMATS.includes(scan.format)) {
    await sql`update scan_jobs set status = 'done', updated_at = now() where id = ${job.id}`;
    await sql`update scan_assets set status = 'stored', updated_at = now() where id = ${scan.id}`;
    return;
  }
  await sql`update scan_assets set status = 'converting', status_reason = null, updated_at = now() where id = ${scan.id}`;
  const input = path.join(root, scan.storage_key);
  const result = await runPipelineChild({ input, format: scan.format, outDir: path.dirname(input), base: scan.id });
  if (result.ok) {
    const folder = path.dirname(scan.storage_key);
    const pipeline = { stats: result.stats, validation: result.validation, reportKey: `${folder}/${result.reportFile}` };
    await sql`update scan_assets set status = 'ready', status_reason = null,
        optimized_key = ${`${folder}/${result.optimized.file}`}, optimized_bytes = ${result.optimized.bytes},
        optimized_sha256 = ${result.optimized.sha256}, pipeline = ${JSON.stringify(pipeline)}, processed_at = now(), updated_at = now()
      where id = ${scan.id}`;
    await sql`update scan_jobs set status = 'done', last_error = null, updated_at = now() where id = ${job.id}`;
    return;
  }
  const reason = String(result.reason ?? "Processing failed.").slice(0, 300);
  const retry = !result.permanent && job.attempts < MAX_ATTEMPTS;
  await sql`update scan_jobs set status = ${retry ? "queued" : "failed"}, last_error = ${reason}, locked_at = null, updated_at = now() where id = ${job.id}`;
  await sql`update scan_assets set status = ${retry ? "queued" : "failed"}, status_reason = ${retry ? `Retrying: ${reason}` : reason},
      processed_at = now(), updated_at = now() where id = ${scan.id}`;
}

/**
 * Drain the queue one job at a time.
 * @param {any} sql @param {string} root @param {{ max?: number }} [opts]
 */
export async function drainJobs(sql, root, opts = {}) {
  await recoverStale(sql);
  let done = 0;
  for (;;) {
    if (opts.max && done >= opts.max) return done;
    const job = await claimJob(sql);
    if (!job) return done;
    await runJob(sql, job, root);
    done += 1;
  }
}
