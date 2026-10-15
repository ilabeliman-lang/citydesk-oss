import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { planChunks, type UnitKind, type UnitOffer } from "@/world/agents/chunks";

const TILE_BYTES = 256 * 1024;

/** Record one 256 KB tile if street-cpu can hold it. The bytes are not run. */
export const dispatchTile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    const rows = await sql<{ id: string; kind: UnitKind; max_chunk_bytes: number; status: string }>`select id, kind, max_chunk_bytes, status from processing_units`;
    const units: UnitOffer[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      maxChunkBytes: Number(row.max_chunk_bytes) || 0,
      idle: row.status === "idle",
    }));
    const street = rows.find((row) => row.id === "street-cpu");
    if (!street || street.status !== "idle") {
      return { ok: false as const, reason: "street-cpu is missing or not idle.", bytes: 0 };
    }
    const plan = planChunks({ kind: "tile", bytes: TILE_BYTES }, units);
    const hit = plan.assignments.find((row) => row.unitId === "street-cpu");
    if (!hit) {
      const reason = plan.assignments.length ? "street-cpu was not assigned this tile." : plan.reason;
      return { ok: false as const, reason, bytes: 0 };
    }
    await sql`insert into dispatch_log (id, unit_id, kind, bytes, status) values (${randomUUID()}, ${hit.unitId}, 'tile', ${hit.bytes}, 'recorded')`;
    return { ok: true as const, reason: plan.reason, bytes: hit.bytes };
  });
