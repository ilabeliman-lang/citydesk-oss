import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { getBearerToken } from "@/lib/auth/client";

/** Scan files a user can import. glb/gltf are drawn on the map; the rest are stored and pinned. */
export const SCAN_FORMATS = ["glb", "gltf", "usdz", "splat", "ply", "spz"] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];
export const DRAWN_FORMATS: readonly ScanFormat[] = ["glb", "gltf"];
export const SCAN_ACCEPT = SCAN_FORMATS.map((f) => `.${f}`).join(",");
/** Per-file and per-person limits for the prototype. */
export const SCAN_MAX_BYTES = 64 * 1024 * 1024;
export const SCAN_MAX_COUNT = 20;
export const SCAN_MAX_TOTAL = 512 * 1024 * 1024;
/** NDU-UPG #369: uploads per person per rolling day (enforced in scan-store.server.ts). */
export const SCAN_MAX_PER_DAY = 10;

export type ScanPose = { lng: number; lat: number; rotation: number; scale: number };

// NDU-UPG #351 #352 #383 #391: pipeline state shown on the scan row
export type ScanStatus = "stored" | "queued" | "converting" | "ready" | "failed";
export type ScanCounts = { tris: number; meshes: number; materials: number; textures: number; bytes: number };
export type ScanPipelineStats = {
  before: ScanCounts;
  after: ScanCounts;
  preset: "prop" | "room" | "building";
  budget: number;
  simplified: boolean;
  /** metres [x, y, z] after unit/axis fixes */
  size: [number, number, number];
  offset: [number, number, number];
  upAxis: "Y" | "Z";
  metersPerUnit: number;
  converter: string | null;
};

export type ScanAsset = {
  id: string;
  name: string;
  format: ScanFormat;
  bytes: number;
  createdAt: string;
  /** Where the owner placed it, or null while it is only uploaded. */
  pose: ScanPose | null;
  /** NDU-UPG #352: stored -> queued -> converting -> ready | failed (+ reason). */
  status?: ScanStatus;
  statusReason?: string | null;
  /** sha256 of the raw upload (#391) */
  sha256?: string;
  optimizedBytes?: number | null;
  stats?: ScanPipelineStats | null;
  validation?: { errors: number; warnings: number; infos: number; hints: number } | null;
};

/** NDU-UPG #351: the format the map should draw — a converted USDZ is drawn as its GLB. */
export function drawFormat(scan: Pick<ScanAsset, "format" | "status">): ScanFormat {
  return scan.status === "ready" ? "glb" : scan.format;
}

/** NDU-UPG #353: rejected files stay in the owner's list but are not drawn on the map. */
export const scanOnMap = (scan: Pick<ScanAsset, "pose" | "status">) => Boolean(scan.pose) && scan.status !== "failed";

type Row = {
  id: string;
  name: string;
  format: ScanFormat;
  bytes: string | number;
  created_at: string | Date;
  lng: number | null;
  lat: number | null;
  rotation_deg: number;
  scale: number;
  status?: ScanStatus | null;
  status_reason?: string | null;
  sha256?: string | null;
  optimized_bytes?: string | number | null;
  pipeline?: { stats?: ScanPipelineStats; validation?: ScanAsset["validation"] } | string | null;
};

function toAsset(row: Row): ScanAsset {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    bytes: Number(row.bytes),
    createdAt: new Date(row.created_at).toISOString(),
    pose:
      row.lng === null || row.lat === null
        ? null
        : { lng: row.lng, lat: row.lat, rotation: row.rotation_deg, scale: row.scale },
    ...pipelineFields(row),
  };
}

function pipelineFields(row: Row): Partial<ScanAsset> {
  const meta = typeof row.pipeline === "string" ? (JSON.parse(row.pipeline) as Exclude<Row["pipeline"], string>) : row.pipeline;
  return {
    status: row.status ?? "stored",
    statusReason: row.status_reason ?? null,
    sha256: row.sha256 ?? undefined,
    optimizedBytes: row.optimized_bytes == null ? null : Number(row.optimized_bytes),
    stats: meta?.stats ?? null,
    validation: meta?.validation ?? null,
  };
}

const COLS = "id, name, format, bytes, created_at, lng, lat, rotation_deg, scale, status, status_reason, sha256, optimized_bytes, pipeline";

function num(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error("Bad placement");
  return v;
}

/** The signed-in person's own scans (never anyone else's). */
export const listMyScans = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ScanAsset[]> => {
    const sql = await getSql();
    // NDU-UPG #351: queue scans uploaded before the pipeline, resume after restarts
    await import("@/world/scan-pipeline.server").then((m) => m.queueUnprocessed(context.userId)).catch(() => undefined);
    const cols = await import("@/world/scan-schema.server").then((m) => m.scanCols()).catch(() => COLS); // NDU-UPG merge guard (0011)
    const rows = await sql.query<Row>(
      `select ${cols} from scan_assets where user_id = $1 order by created_at desc limit $2`,
      [context.userId, SCAN_MAX_COUNT],
    );
    return rows.map(toAsset);
  });

/** Save where the owner put a scan: spot, heading (degrees clockwise from north) and scale. */
export const placeScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; pose: ScanPose }) => {
    const id = String(input?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Unknown scan");
    const pose = input?.pose;
    return {
      id,
      lng: num(pose?.lng, -180, 180),
      lat: num(pose?.lat, -85, 85),
      rotation: ((num(pose?.rotation, -720, 720) % 360) + 360) % 360,
      scale: num(pose?.scale, 0.01, 100),
    };
  })
  .handler(async ({ context, data }): Promise<ScanAsset> => {
    const sql = await getSql();
    const cols = await import("@/world/scan-schema.server").then((m) => m.scanCols()).catch(() => COLS); // NDU-UPG merge guard (0011)
    const rows = await sql.query<Row>(
      `update scan_assets
      set lng = $1, lat = $2, rotation_deg = $3, scale = $4,
        placed_at = now(), updated_at = now()
      where id = $5 and user_id = $6
      returning ${cols}`,
      [data.lng, data.lat, data.rotation, data.scale, data.id, context.userId],
    );
    if (!rows[0]) throw new Error("Unknown scan");
    return toAsset(rows[0]);
  });

/** NDU-UPG #352/#389: run the pipeline again for one of the owner's scans (e.g. after a failure). */
export const retryScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => {
    const id = String(input?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Unknown scan");
    return { id };
  })
  .handler(async ({ context, data }): Promise<boolean> => {
    const { requeueScan } = await import("@/world/scan-pipeline.server");
    return requeueScan(data.id, context.userId);
  });

/** NDU-UPG #356: the owner's original upload (not the optimised copy), saved to their device. */
export async function downloadRawScan(scan: Pick<ScanAsset, "id" | "name">): Promise<void> {
  const res = await fetch(`${scanFileUrl(scan.id)}?raw=1`, { headers: scanAuthHeaders() });
  if (!res.ok) throw new Error("Could not fetch the original file.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = scan.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Same-origin URL of a scan file; only its owner gets the bytes. */
export const scanFileUrl = (id: string) => `/api/scans/${id}`;

/** The session header the scan endpoints need in the live preview (cookies cover deployed). */
export function scanAuthHeaders(): Record<string, string> {
  const token = getBearerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Upload one scan file as a raw body, reporting progress 0..1. */
export function uploadScan(file: File, onProgress: (done: number) => void): Promise<ScanAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/scans");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Scan-Name", encodeURIComponent(file.name));
    for (const [key, value] of Object.entries(scanAuthHeaders())) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection."));
    xhr.onload = () => {
      let body: { scan?: ScanAsset; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        // non-JSON error page
      }
      if (xhr.status === 201 && body.scan) resolve(body.scan);
      else reject(new Error(body.error || `Upload failed (${xhr.status}).`));
    };
    xhr.send(file);
  });
}
