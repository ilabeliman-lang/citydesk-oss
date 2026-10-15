import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export type PublicNode = { id: string; label: string; kind: "gpu" | "cpu"; vramGb: number; note: string };

/** Machines people have offered. No wallet, no payee, no file list. */
export const listComputeNodes = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; label: string; kind: string; vram_gb: number; note: string | null }>`
      select id, label, kind, vram_gb, note from compute_nodes
      where status = 'offered' and cluster = 'devnet'
      order by created_at desc limit 40`;
    return {
      ok: true as const,
      nodes: rows.map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind === "cpu" ? "cpu" as const : "gpu" as const,
        vramGb: Number(r.vram_gb) || 0,
        note: r.note ?? "",
      })),
    };
  } catch {
    return { ok: false as const, nodes: [] as PublicNode[], reason: "The node table is not on yet." };
  }
});

export const offerComputeNode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { label?: string; kind?: string; vramGb?: number; note?: string }) => {
    const label = String(input?.label ?? "").trim().slice(0, 40);
    const kind = input?.kind === "cpu" ? "cpu" : "gpu";
    const vram = Math.max(0, Math.min(192, Math.round(Number(input?.vramGb) || 0)));
    const note = String(input?.note ?? "").trim().slice(0, 80);
    if (label.length < 2) throw new Error("Name the machine");
    return { label, kind, vram, note };
  })
  .handler(async ({ context, data }) => {
    try {
      const sql = await getSql();
      const id = crypto.randomUUID();
      await sql`insert into compute_nodes (id, user_id, label, kind, vram_gb, note, cluster, status)
        values (${id}, ${context.userId}, ${data.label}, ${data.kind}, ${data.vram}, ${data.note}, 'devnet', 'offered')`;
      return { ok: true as const, id };
    } catch {
      return { ok: false as const, reason: "Could not list the machine. The node table is not on yet." };
    }
  });

export const pauseComputeNode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id ?? "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!data.id) return { ok: false as const };
    try {
      const sql = await getSql();
      await sql`update compute_nodes set status = 'paused' where id = ${data.id} and user_id = ${context.userId}`;
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  });
