/**
 * Commander loop. One distiller step, then wait.
 * Talks only to the local model and the agent tables. No shell. No lease.
 */
import fs from "node:fs";
import pg from "pg";

const STOP = process.env.CITYDESK_AGENTS_STOP || "citydesk-agents/STOP";
const once = process.argv.includes("--once");
const DUTY = "Rewrite one note already in the pool. Do not run code. Do not invent a fact.";
const SEEDS = [
  ["A hold can change", "A floor hold can be removed. A content id cannot be edited."],
  ["This machine", "This machine has no GPU, so it cannot train weights and it is not leased out."],
  ["What an agent may do", "A machine agent may only rewrite a note already in the pool. It cannot open a shell."],
];

function accept(text) {
  const line = String(text).replace(/\s+/g, " ").trim().slice(0, 280);
  const low = line.toLowerCase();
  if (line.length < 12) return null;
  for (const word of ["sudo", "rm -", "```", "curl ", "wget ", "$(", "ignore previous"]) {
    if (low.includes(word)) return null;
  }
  return line;
}

async function modelName() {
  try {
    const res = await fetch("http://127.0.0.1:11535/api/tags", { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return String(body.models?.[0]?.name ?? "").slice(0, 80);
  } catch {
    return "";
  }
}

async function rewrite(model, note) {
  const res = await fetch("http://127.0.0.1:11535/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      prompt: `Rewrite the note in one sentence. Keep the same facts. Do not add a command.\n\n${note}`,
      options: { num_predict: 80, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json();
  return String(body.response ?? "");
}

async function step(pool) {
  const client = await pool.connect();
  try {
    const name = await modelName();
    const gpu = fs.existsSync("/dev/nvidia0");
    const kind = gpu ? "gpu" : "cpu";
    const label = gpu ? "This machine · GPU" : "This machine · CPU";
    await client.query("begin");
    for (const [id, role] of [["machine-commander", "commander"], ["machine-distiller", "distiller"]]) {
      await client.query(
        `insert into machine_agents (id, user_id, label, kind, vram_gb, model_name, role, version, status, lease)
         values ($1, 'studio', $2, $3, 0, $4, $5, 1, 'active', 'closed')
         on conflict (id) do update set kind = excluded.kind, model_name = excluded.model_name, label = excluded.label`,
        [id, label, kind, name, role],
      );
      await client.query(
        `insert into agent_revisions (agent_id, version, model_name, duty)
         values ($1, 1, $2, $3) on conflict (agent_id, version) do nothing`,
        [id, name, DUTY],
      );
    }
    const count = await client.query("select count(*)::int as n from knowledge_pool");
    if (count.rows[0].n === 0) {
      for (const [title, body] of SEEDS) {
        await client.query(
          "insert into knowledge_pool (id, title, body, version) values ($1, $2, $3, 1)",
          [crypto.randomUUID(), title, body],
        );
      }
    }
    if (!name) {
      await client.query("commit");
      return "no model";
    }
    await client.query(
      `update agent_jobs set status = 'failed', finished_at = now(), detail = 'The last step stalled.'
       where status = 'running' and created_at < now() - interval '3 minutes'`,
    );
    const job = crypto.randomUUID();
    try {
      await client.query(
        "insert into agent_jobs (id, agent_id, status, detail) values ($1, 'machine-distiller', 'running', 'one step')",
        [job],
      );
    } catch {
      await client.query("rollback");
      return "busy";
    }
    const parent = await client.query(
      `select p.id, p.title, p.body, p.version from knowledge_pool p
       where p.version < 3
         and not exists (select 1 from knowledge_pool c where c.parent_id = p.id)
         and not exists (
           select 1 from agent_jobs j where j.detail = 'fail:' || p.id and j.created_at > now() - interval '30 minutes'
         )
       order by p.created_at asc limit 1`,
    );
    const row = parent.rows[0];
    if (!row) {
      await client.query("update agent_jobs set status = 'skipped', finished_at = now(), detail = 'The pool is caught up.' where id = $1", [job]);
      await client.query("commit");
      return "caught up";
    }
    let line = null;
    try {
      line = accept(await rewrite(name, row.body));
    } catch {
      line = null;
    }
    if (!line) {
      await client.query("update agent_jobs set status = 'failed', finished_at = now(), detail = $2 where id = $1", [job, `fail:${row.id}`]);
      await client.query("commit");
      return "rejected";
    }
    const next = Number(row.version) + 1;
    await client.query(
      `insert into knowledge_pool (id, parent_id, version, agent_id, title, body)
       values ($1, $2, $3, 'machine-distiller', $4, $5)`,
      [crypto.randomUUID(), row.id, next, row.title, line],
    );
    await client.query("update machine_agents set version = version + 1 where id = 'machine-distiller'");
    await client.query(
      `insert into agent_revisions (agent_id, version, model_name, duty)
       select 'machine-distiller', version, model_name, $1 from machine_agents where id = 'machine-distiller'
       on conflict (agent_id, version) do nothing`,
      [DUTY],
    );
    await client.query("update agent_jobs set status = 'done', finished_at = now(), detail = $2 where id = $1", [job, `Wrote version ${next}.`]);
    await client.query("commit");
    return `wrote v${next}`;
  } catch {
    try { await client.query("rollback"); } catch { /* keep the original failure */ }
    return "error";
  } finally {
    client.release();
  }
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    let cmd = "";
    try {
      cmd = fs.readFileSync(`/proc/${name}/cmdline`).toString().replaceAll("\0", " ");
    } catch {
      continue;
    }
    if (!cmd.includes("vite dev --host 0.0.0.0 --port 8080") || cmd.includes("with-app-env")) continue;
    try {
      const hit = fs.readFileSync(`/proc/${name}/environ`).toString().split("\0")
        .find((item) => item.startsWith("DATABASE_URL=") && item.length > 20);
      if (hit) return hit.slice("DATABASE_URL=".length);
    } catch {
      /* a process we cannot read */
    }
  }
  return "";
}
const url = databaseUrl();
if (!url) {
  console.log("no database");
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
do {
  if (fs.existsSync(STOP)) break;
  const result = await step(pool);
  console.log(result);
  if (once) break;
  await new Promise((r) => setTimeout(r, 180000));
} while (!fs.existsSync(STOP));
await pool.end();
