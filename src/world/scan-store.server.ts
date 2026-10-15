import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { storeScan } from "@/lib/storage/localScan";
import { once } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { getSql } from "@/lib/db";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId } from "@/lib/auth/verify.server";
import { SCAN_FORMATS, SCAN_MAX_BYTES, SCAN_MAX_COUNT, SCAN_MAX_TOTAL, type ScanAsset, type ScanFormat } from "@/world/scans";
// NDU-UPG #354 #369 #379: byte sniffing, zip-bomb guard, per-day cap
import { SCAN_MAX_PER_DAY } from "@/world/scans";
import { inspectZip, sniffFormat, SNIFF_BYTES } from "../../scripts/scan/sniff.mjs";

/**
 * Scan files on the server's persistent disk (server-only). Default: a folder beside the
 * app checkout, so a code redeploy never wipes people's scans; override with SCAN_STORAGE_DIR.
 */
export function scanRoot(): string {
  return process.env.SCAN_STORAGE_DIR?.trim() || path.resolve(process.cwd(), "..", ".citydesk-scans");
}

const TYPES: Record<ScanFormat, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  usdz: "model/vnd.usdz+zip",
  splat: "application/octet-stream",
  ply: "application/octet-stream",
  spz: "application/octet-stream",
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

/** Same checks as `authMiddleware`: block scripted cross-site calls, then require a session. */
async function caller(): Promise<string | Response> {
  try {
    assertSameSiteRequest();
    return await requireUserId();
  } catch (err) {
    const status = (err as { status?: number }).status === 403 ? 403 : 401;
    return json(status, { error: status === 403 ? "Forbidden" : "Sign in to add scans." });
  }
}

const userFolder = (userId: string) => userId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "user";

/**
 * Absolute path for a scan storage key, or `null` when the key would leave the scan root.
 * NDU-UPG: `..`, an absolute path, a backslash, or anything that normalises outside the
 * root is refused, so a hostile or corrupted key can only ever reach a scan file.
 */
function scanFile(key: string | null | undefined): string | null {
  if (!key || key.includes("..") || key.includes("\\") || key.includes("\0")) return null;
  if (path.isAbsolute(key)) return null;
  const root = path.resolve(scanRoot());
  const full = path.resolve(root, key);
  const rel = path.relative(root, full);
  return rel === "" || rel.startsWith("..") || path.isAbsolute(rel) ? null : full;
}

/** A `..` that acts as a path segment (`../x`, `a/../b`, `..`), not the `my..scan.glb` kind. */
const TRAVERSAL_SEGMENT = /(^|\/)\.\.($|\/)/;

function cleanName(raw: string | null): string {
  let name = "";
  try {
    name = decodeURIComponent(raw ?? "");
  } catch {
    name = "";
  }
  if (TRAVERSAL_SEGMENT.test(name) || path.isAbsolute(name)) return "";
  name = [...path.basename(name)]
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127 && !'<>"`\\'.includes(ch))
    .join("")
    .trim();
  return name.slice(0, 120);
}

/** Cheap magic-byte check so a renamed file can't pose as a scan. `.splat` has no header: 32-byte records. */
function looksRight(format: ScanFormat, head: Buffer, bytes: number): boolean {
  switch (format) {
    case "glb":
      return head.subarray(0, 4).toString("latin1") === "glTF";
    case "gltf":
      return head.toString("utf8").trimStart().startsWith("{");
    case "usdz":
      return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    case "ply":
      return head.subarray(0, 3).toString("latin1") === "ply";
    case "spz":
      return head[0] === 0x1f && head[1] === 0x8b;
    case "splat":
      return bytes > 0 && bytes % 32 === 0;
  }
}

/** POST /api/scans: raw file body, name in `X-Scan-Name`. Streams to disk with a hard size cap. */
export async function receiveScan(request: Request): Promise<Response> {
  const who = await caller();
  if (who instanceof Response) return who;
  const userId = who;
  const name = cleanName(request.headers.get("x-scan-name"));
  const format = name.split(".").pop()?.toLowerCase() as ScanFormat | undefined;
  if (!name || !format || !SCAN_FORMATS.includes(format)) {
    return json(415, { error: `Use a ${SCAN_FORMATS.map((f) => "." + f).join(", ")} file.` });
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > SCAN_MAX_BYTES) return json(413, { error: `Scans are limited to ${SCAN_MAX_BYTES / 1048576} MB.` }, { Connection: "close" });
  if (!request.body) return json(400, { error: "Empty upload." });

  const sql = await getSql();
  const used = await sql<{ n: string | number; total: string | number | null }>`select count(*) as n, sum(bytes) as total
    from scan_assets where user_id = ${userId}`;
  if (Number(used[0]?.n ?? 0) >= SCAN_MAX_COUNT) return json(409, { error: `You can keep up to ${SCAN_MAX_COUNT} scans for now.` });
  const room = SCAN_MAX_TOTAL - Number(used[0]?.total ?? 0);
  const limit = Math.min(SCAN_MAX_BYTES, room);
  if (limit <= 0) return json(409, { error: "Your scan space is full." });
  // NDU-UPG #369: per-day upload cap (server-side; the client only mirrors it)
  const today = await sql<{ n: string | number }>`select count(*) as n from scan_assets
    where user_id = ${userId} and created_at > now() - interval '1 day'`;
  if (Number(today[0]?.n ?? 0) >= SCAN_MAX_PER_DAY) {
    return json(429, { error: `You've added ${SCAN_MAX_PER_DAY} scans in the last day. You can add more tomorrow.` });
  }

  const id = randomUUID();
  const folder = userFolder(userId);
  const dir = scanFile(folder);
  if (!dir) return json(400, { error: "Bad scan location." });
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // leftovers from uploads cut off by a crash or restart
  for (const old of await readdir(dir).catch(() => [] as string[])) {
    if (!old.endsWith(".part")) continue;
    const info = await stat(path.join(dir, old)).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 15 * 60_000) await rm(path.join(dir, old), { force: true });
  }
  const part = path.join(dir, `.${id}.part`);
  const key = `${folder}/${id}.${format}`;
  const finalPath = scanFile(key);
  if (!finalPath) {
    await rm(part, { force: true });
    return json(400, { error: "Bad scan location." });
  }
  const hash = createHash("sha256");
  const out = createWriteStream(part, { mode: 0o600 });
  let bytes = 0;
  let tooBig = false;
  try {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        // Stop reading but never cancel: cancelling Node's request stream mid-flow crashes the
        // server (Node 22 web-stream adapter). The 413 below closes the connection instead.
        tooBig = true;
        reader.releaseLock();
        break;
      }
      hash.update(value);
      if (!out.write(value)) await once(out, "drain");
    }
    out.end();
    await once(out, "close");
  } catch {
    out.destroy();
    await rm(part, { force: true });
    return json(400, { error: "Upload was interrupted." });
  }
  if (tooBig || bytes === 0) {
    await rm(part, { force: true });
    if (bytes === 0) return json(400, { error: "Empty upload." });
    return json(
      413,
      { error: limit < SCAN_MAX_BYTES ? "Not enough scan space left." : `Scans are limited to ${SCAN_MAX_BYTES / 1048576} MB.` },
      { Connection: "close" },
    );
  }
  const fh = await open(part, "r");
  const head = Buffer.alloc(SNIFF_BYTES); // NDU-UPG #354: was 16 bytes
  await fh.read(head, 0, SNIFF_BYTES, 0);
  await fh.close();
  // NDU-UPG #354: the bytes decide the format, not the name
  const real = sniffFormat(head.subarray(0, Math.min(bytes, SNIFF_BYTES)), bytes, format);
  if (!looksRight(format, head, bytes) || real !== format) {
    await rm(part, { force: true });
    return json(415, { error: real ? `That file is really a .${real}, not a .${format}.` : `That file is not a valid .${format}.` });
  }
  if (format === "usdz") {
    // NDU-UPG #379: count entries and unpacked size before anything unzips it
    const guard = await inspectZip(part, { maxEntries: 2000, maxUncompressed: 512 * 1048576 });
    if (!guard.ok) {
      await rm(part, { force: true });
      return json(415, { error: guard.reason });
    }
  }
  await rename(part, finalPath);
  await chmod(finalPath, 0o600).catch(() => undefined);
  const sha256 = hash.digest("hex");
  // Missing or empty SCAN_BUCKET stays local. A set bucket is not uploaded.
  const bucket = process.env.SCAN_BUCKET?.trim() || undefined;
  if (!bucket) {
    const raw = new Uint8Array(await readFile(finalPath));
    const stored = await storeScan(raw, { bucket });
    if (stored.where !== "local" || !stored.ok) {
      await rm(finalPath, { force: true });
      return json(400, { error: "Could not store the scan." });
    }
  }
  const rows = await sql<{ created_at: string | Date }>`insert into scan_assets (id, user_id, name, format, bytes, sha256, storage_key)
    values (${id}, ${userId}, ${name}, ${format}, ${bytes}, ${sha256}, ${key}) returning created_at`;
  const scan: ScanAsset = { id, name, format, bytes, createdAt: new Date(rows[0]?.created_at ?? Date.now()).toISOString(), pose: null };
  // NDU-UPG #351 #353 #355: validate/convert/optimise in the background (raw file kept)
  try {
    const { queueScan } = await import("@/world/scan-pipeline.server");
    if (await queueScan(id, userId, format)) scan.status = "queued";
  } catch (err) {
    console.error("[scans] could not queue", err instanceof Error ? err.message : err);
  }
  scan.sha256 = sha256; // NDU-UPG #391
  return json(201, { scan });
}

/**
 * GET /api/scans/:id: the file bytes, for its owner only.
 * NDU-UPG #356 #368 #353: serves the optimised GLB once ready (raw upload with `?raw=1`,
 * validator report with `?report=1`), with ETag/304 and byte ranges.
 */
export async function sendScan(id: string, request?: Request): Promise<Response> {
  const who = await caller();
  if (who instanceof Response) return who;
  // NDU-UPG: the id is also a path segment — a traversal-shaped id is a bad request, not a miss.
  if (id.includes("..") || id.includes("\\") || id.includes("/") || id.includes("\0") || path.isAbsolute(id)) {
    return json(400, { error: "Not found" });
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return json(404, { error: "Not found" });
  const sql = await getSql();
  const rows = await sql<{
    storage_key: string;
    format: ScanFormat;
    bytes: string | number;
    sha256: string;
    status: string | null;
    optimized_key: string | null;
    optimized_bytes: string | number | null;
    optimized_sha256: string | null;
    pipeline: { reportKey?: string } | string | null;
  }>`select storage_key, format, bytes, sha256, status, optimized_key, optimized_bytes, optimized_sha256, pipeline
    from scan_assets where id = ${id} and user_id = ${who}`.catch(async (err: unknown) => {
    // NDU-UPG merge guard: database without 0011 -> legacy columns, raw file served as before
    const { scanPipelineReady } = await import("@/world/scan-schema.server");
    if (await scanPipelineReady()) throw err;
    return sql<{ storage_key: string; format: ScanFormat; bytes: string | number; sha256: string }>`select storage_key, format, bytes, sha256
      from scan_assets where id = ${id} and user_id = ${who}`.then((r) =>
      r.map((x) => ({ ...x, status: null, optimized_key: null, optimized_bytes: null, optimized_sha256: null, pipeline: null })),
    );
  });
  const row = rows[0];
  if (!row) return json(404, { error: "Not found" });
  const query = new URL(request?.url ?? "http://x/").searchParams;
  if (query.get("report") === "1") {
    const meta = typeof row.pipeline === "string" ? (JSON.parse(row.pipeline) as { reportKey?: string }) : row.pipeline;
    const key = meta?.reportKey ?? `${row.storage_key.split("/")[0]}/${id}.report.json`;
    const reportPath = scanFile(key);
    if (!reportPath) return json(400, { error: "Not found" });
    try {
      const { readFile } = await import("node:fs/promises");
      return new Response(await readFile(reportPath), {
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    } catch {
      return json(404, { error: "No validation report yet." });
    }
  }
  const optimized = query.get("raw") !== "1" && row.status === "ready" && row.optimized_key && row.optimized_sha256;
  const key = optimized ? (row.optimized_key as string) : row.storage_key;
  const etag = `"${optimized ? row.optimized_sha256 : row.sha256}"`;
  const file = scanFile(key);
  if (!file) return json(400, { error: "Not found" });
  let size = 0;
  try {
    size = (await stat(file)).size;
  } catch {
    return json(404, { error: "Not found" });
  }
  const headers: Record<string, string> = {
    "Content-Type": optimized ? "model/gltf-binary" : TYPES[row.format],
    "Cache-Control": "private, no-cache",
    ETag: etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "attachment",
  };
  if (request?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const range = /^bytes=(\d*)-(\d*)$/.exec(request?.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    const part = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new Response(part, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
