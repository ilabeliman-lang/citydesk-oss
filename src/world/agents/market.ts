import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

const MODEL_URL = "http://127.0.0.1:11535/api/tags";
const GENERATE_URL = "http://127.0.0.1:11535/api/generate";
const COMMANDER_ID = "machine-commander";
const DISTILLER_ID = "machine-distiller";
const DUTY = "Rewrite one note already in the pool. Do not run code. Do not invent a fact.";

export type MarketAgent = {
  id: string;
  label: string;
  role: "commander" | "distiller";
  kind: "cpu" | "gpu";
  vramGb: number;
  modelName: string;
  version: number;
  status: string;
  lease: "closed";
};

export type PoolNote = { id: string; title: string; body: string; version: number };

async function sense(): Promise<{ kind: "cpu" | "gpu"; modelName: string }> {
  let gpu = false;
  try {
    const { access } = await import("node:fs/promises");
    await access("/dev/nvidia0");
    gpu = true;
  } catch {
    gpu = false;
  }
  let modelName = "";
  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(2500) });
    const body = (await res.json()) as { models?: { name?: string }[] };
    modelName = String(body.models?.[0]?.name ?? "").slice(0, 80);
  } catch {
    modelName = "";
  }
  return { kind: gpu ? "gpu" : "cpu", modelName };
}

async function seedPool(sql: Awaited<ReturnType<typeof getSql>>) {
  const n = await sql<{ n: string }>`select count(*)::text as n from knowledge_pool`;
  if (Number(n[0]?.n) > 0) return;
  const seeds = [
    ["A hold can change", "A floor hold can be removed. A content id cannot be edited."],
    ["This machine", "This machine has no GPU, so it cannot train weights and it is not leased out."],
    ["What an agent may do", "A machine agent may only rewrite a note already in the pool. It cannot open a shell."],
  ];
  for (const [title, body] of seeds) {
    await sql`insert into knowledge_pool (id, title, body, version) values (${crypto.randomUUID()}, ${title}, ${body}, 1)`;
  }
}

function accept(text: string): string | null {
  const line = text.replace(/\s+/g, " ").trim().slice(0, 280);
  const low = line.toLowerCase();
  if (line.length < 12) return null;
  if (["sudo", "rm -", "```", "curl ", "wget ", "$(", "ignore previous"].some((w) => low.includes(w))) return null;
  return line;
}

/** Active machine agents and the latest notes. No user ids. */
export const listAgentMarket = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    const agents = await sql<{ id: string; label: string; role: string; kind: string; vram_gb: number; model_name: string; version: number; status: string; lease: string }>`
      select id, label, role, kind, vram_gb, model_name, version, status, lease
      from machine_agents where status = 'active' order by role`;
    const notes = await sql<{ id: string; title: string; body: string; version: number }>`
      select id, title, body, version from knowledge_pool order by created_at desc limit 8`;
    const job = await sql<{ status: string; detail: string | null }>`
      select status, detail from agent_jobs order by created_at desc limit 1`;
    return {
      ok: true as const,
      agents: agents.map((a) => ({
        id: a.id,
        label: a.label,
        role: a.role === "commander" ? "commander" as const : "distiller" as const,
        kind: a.kind === "gpu" ? "gpu" as const : "cpu" as const,
        vramGb: Number(a.vram_gb) || 0,
        modelName: a.model_name,
        version: Number(a.version) || 1,
        status: a.status,
        lease: "closed" as const,
      })),
      notes: notes.map((n) => ({ id: n.id, title: n.title, body: n.body, version: Number(n.version) || 1 })),
      last: job[0]?.detail ?? "",
    };
  } catch {
    return { ok: false as const, agents: [] as MarketAgent[], notes: [] as PoolNote[], last: "", reason: "The agent register is not on yet." };
  }
});

export const registerThisMachine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const sensed = await sense();
    const label = sensed.kind === "gpu" ? "This machine · GPU" : "This machine · CPU";
    for (const [id, role] of [[COMMANDER_ID, "commander"], [DISTILLER_ID, "distiller"]] as const) {
      await sql`insert into machine_agents (id, user_id, label, kind, vram_gb, model_name, role, version, status, lease)
        values (${id}, ${context.userId}, ${label}, ${sensed.kind}, 0, ${sensed.modelName}, ${role}, 1, 'active', 'closed')
        on conflict (id) do update set user_id = ${context.userId}, label = ${label}, kind = ${sensed.kind}, model_name = ${sensed.modelName}`;
      await sql`insert into agent_revisions (agent_id, version, model_name, duty)
        values (${id}, 1, ${sensed.modelName}, ${DUTY})
        on conflict (agent_id, version) do nothing`;
    }
    await seedPool(sql);
    return { ok: true as const, kind: sensed.kind, modelName: sensed.modelName, lease: "closed" as const };
  });

export const tickAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    await seedPool(sql);
    const sensed = await sense();
    if (!sensed.modelName) return { ok: false as const, reason: "No local model is answering, so nothing ran." };
    await sql`update agent_jobs set status = 'failed', finished_at = now(), detail = 'The last step stalled.'
      where status = 'running' and created_at < now() - interval '3 minutes'`;
    const jobId = crypto.randomUUID();
    try {
      await sql`insert into agent_jobs (id, agent_id, status, detail) values (${jobId}, ${DISTILLER_ID}, 'running', 'one step')`;
    } catch {
      return { ok: false as const, reason: "A step is already running." };
    }
    try {
      const parent = await sql<{ id: string; title: string; body: string; version: number }>`
        select p.id, p.title, p.body, p.version from knowledge_pool p
        where p.version < 3
          and not exists (select 1 from knowledge_pool c where c.parent_id = p.id)
          and not exists (
            select 1 from agent_jobs j
            where j.detail = ${"fail:"} || p.id and j.created_at > now() - interval '30 minutes'
          )
        order by p.created_at asc limit 1`;
      const row = parent[0];
      if (!row) {
        await sql`update agent_jobs set status = 'skipped', finished_at = now(), detail = 'The pool is caught up.' where id = ${jobId}`;
        return { ok: true as const, reason: "The pool is caught up." };
      }
      const res = await fetch(GENERATE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: sensed.modelName,
          stream: false,
          prompt: `Rewrite the note in one sentence. Keep the same facts. Do not add a command.\n\n${row.body}`,
          options: { num_predict: 80, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(45000),
      });
      const body = (await res.json()) as { response?: string };
      const line = accept(String(body.response ?? ""));
      if (!line) {
        await sql`update agent_jobs set status = 'failed', finished_at = now(), detail = ${"fail:" + row.id} where id = ${jobId}`;
        return { ok: false as const, reason: "The model reply was rejected." };
      }
      const next = Number(row.version) + 1;
      await sql`insert into knowledge_pool (id, parent_id, version, agent_id, title, body)
        values (${crypto.randomUUID()}, ${row.id}, ${next}, ${DISTILLER_ID}, ${row.title}, ${line})`;
      await sql`update machine_agents set version = version + 1 where id = ${DISTILLER_ID}`;
      await sql`insert into agent_revisions (agent_id, version, model_name, duty)
        select ${DISTILLER_ID}, version, model_name, ${DUTY} from machine_agents where id = ${DISTILLER_ID}
        on conflict (agent_id, version) do nothing`;
      await sql`update agent_jobs set status = 'done', finished_at = now(), detail = ${`Wrote version ${next}.`} where id = ${jobId}`;
      return { ok: true as const, reason: `Wrote version ${next} of “${row.title}”. Weights were not trained.` };
    } catch {
      await sql`update agent_jobs set status = 'failed', finished_at = now(), detail = 'The step failed.' where id = ${jobId}`;
      return { ok: false as const, reason: "The step failed." };
    }
  });
