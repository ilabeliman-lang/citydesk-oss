import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { CHUNK_CAP, planChunks, type ChunkPlan, type UnitKind, type UnitOffer } from "@/world/agents/chunks";

export type ProcessingUnit = UnitOffer & { label: string; ramMb: number };

const EMPTY: ChunkPlan = { assignments: [], unassigned: 0, reason: "No idle unit can take this job." };

async function ramMb(): Promise<number> {
  try {
    const text = await readFile("/proc/meminfo", "utf8");
    const line = text.split("\n").find((row) => row.startsWith("MemTotal:"));
    const kb = Number(line?.split(/\s+/)[1] ?? 0);
    return Number.isFinite(kb) ? Math.floor(kb / 1024) : 0;
  } catch {
    return 0;
  }
}

function offers(units: ProcessingUnit[]): UnitOffer[] {
  return units.map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    maxChunkBytes: unit.maxChunkBytes,
    idle: unit.idle,
  }));
}

export const listUnits = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; label: string; kind: UnitKind; ram_mb: number; max_chunk_bytes: number; status: string }>`select id, label, kind, ram_mb, max_chunk_bytes, status from processing_units order by max_chunk_bytes desc, label`;
    const units: ProcessingUnit[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      ramMb: Number(row.ram_mb) || 0,
      maxChunkBytes: Number(row.max_chunk_bytes) || 0,
      idle: row.status === "idle",
    }));
    const ready = offers(units);
    return {
      ok: true as const,
      units,
      tile: planChunks({ kind: "tile", bytes: 256 * 1024 }, ready),
      video: planChunks({ kind: "video", bytes: 1024 * 1024 }, ready),
    };
  } catch {
    return { ok: false as const, units: [] as ProcessingUnit[], tile: EMPTY, video: EMPTY };
  }
});

/** Enroll the machine this app is running on. A phone enrolls from the phone, not from here. */
export const enrollThisCpu = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const ram = await ramMb();
    const cap = Math.min(CHUNK_CAP.cpu, Math.max(64 * 1024, Math.floor((ram * 1024) / 8) || CHUNK_CAP.cpu));
    await sql`insert into processing_units (id, user_id, label, kind, ram_mb, max_chunk_bytes, status, lease)
      values ('street-cpu', ${context.userId}, 'This studio CPU', 'cpu', ${ram}, ${cap}, 'idle', 'closed')
      on conflict (id) do update set user_id = ${context.userId}, ram_mb = ${ram}, max_chunk_bytes = ${cap}, status = 'idle'`;
    return { ok: true as const, ramMb: ram, maxChunkBytes: cap, lease: "closed" as const };
  });

function phoneSlotId(userId: string): string {
  const short = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  return `phone-${short}`;
}

/** One phone slot per signed-in user. The desk leaves it offline until the phone checks in. */
export const enrollPhoneSlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = phoneSlotId(context.userId);
    const cap = CHUNK_CAP.phone;
    await sql`insert into processing_units (id, user_id, label, kind, ram_mb, max_chunk_bytes, status, lease)
      values (${id}, ${context.userId}, 'Phone slot', 'phone', 0, ${cap}, 'offline', 'closed')
      on conflict (id) do update set user_id = ${context.userId}, label = 'Phone slot', kind = 'phone', ram_mb = 0, max_chunk_bytes = ${cap}, status = 'offline', lease = 'closed'`;
    return { ok: true as const, status: "offline" as const, maxChunkBytes: cap, ramMb: 0, lease: "closed" as const };
  });

/** The phone checks in. Idle only here. Does not create a GPU and does not change street-cpu. */
export const phoneHeartbeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = phoneSlotId(context.userId);
    const rows = await sql<{ id: string }>`update processing_units set status = 'idle'
      where id = ${id} and user_id = ${context.userId} and kind = 'phone'
      returning id`;
    if (rows.length === 0) return { ok: false as const, status: "offline" as const };
    return { ok: true as const, status: "idle" as const };
  });
