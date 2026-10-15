/**
 * NDU-UPG sessions: every database read/write for session management (server-only).
 *
 * All functions take the `Sql` handle explicitly so tests can run them against a throwaway PGLite or
 * a CI Postgres. Better Auth's own tables ("user", "session") exist on every database; the extra
 * tables come from migrations/0012_session_mgmt.sql and are OPTIONAL: `sessionSchemaReady` says
 * whether they exist, and everything degrades safely without them (listing/revoking still works
 * from "session" alone; suspension and the audit log need the migration).
 */
import type { Sql } from "@/lib/db";
import { sessionEndReason, type SessionConfig } from "./config";
import { parseUserAgent } from "./device";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NeedsMigrationError extends Error {
  readonly status = 503;
  constructor() {
    super("Session management needs migration 0012 on this database");
    this.name = "NeedsMigrationError";
  }
}

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

// ---------------------------------------------------------------------------------------------
// Schema guard (like the scan merge guard): re-checked at most once a minute per Sql handle.
const schemaCache = new WeakMap<object, { at: number; ok: Promise<boolean> }>();

export function sessionSchemaReady(sql: Sql, now = Date.now()): Promise<boolean> {
  const hit = schemaCache.get(sql);
  if (hit && now - hit.at < 60_000) return hit.ok;
  const ok = (async () => {
    const rows = await sql<{ n: number }>`select count(*)::int as n from information_schema.tables
      where table_schema = any (current_schemas(false))
        and table_name in ('ndu_session_meta', 'ndu_user_suspension', 'ndu_admin_audit')`;
    return Number(rows[0]?.n ?? 0) === 3;
  })().catch(() => false);
  schemaCache.set(sql, { at: now, ok });
  return ok;
}

/** Forget the cached schema answer (tests, or right after applying the migration). */
export function resetSessionSchemaCache(sql: Sql) {
  schemaCache.delete(sql);
}

// ---------------------------------------------------------------------------------------------
// Users / suspension / admin role

export async function isSuspended(sql: Sql, userId: string): Promise<boolean> {
  if (!(await sessionSchemaReady(sql))) return false;
  const rows = await sql<{ n: number }>`select count(*)::int as n from ndu_user_suspension where user_id = ${userId}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Env allowlist only (NDU_ADMIN_USER_IDS / NDU_ADMIN_EMAILS). */
export function isEnvAdmin(cfg: Pick<SessionConfig, "adminIds" | "adminEmails">, userId: string, email: string | null | undefined) {
  if (cfg.adminIds.has(userId)) return true;
  return Boolean(email && cfg.adminEmails.has(email.trim().toLowerCase()));
}

/**
 * Admin = on the env allowlist, or on the existing `app_admins` manager list (reused, not replaced).
 * A suspended account is never an admin.
 */
export async function isAdminUser(sql: Sql, userId: string, cfg: Pick<SessionConfig, "adminIds" | "adminEmails">): Promise<boolean> {
  if (!userId) return false;
  const users = await sql<{ email: string | null }>`select email from "user" where id = ${userId}`;
  if (!users.length) return false;
  if (await isSuspended(sql, userId).catch(() => false)) return false;
  const email = users[0].email;
  if (isEnvAdmin(cfg, userId, email)) return true;
  try {
    const rows = await sql<{ n: number }>`select count(*)::int as n from app_admins where lower(email) = lower(${email ?? ""})`;
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false; // no app_admins table on this database
  }
}

export async function assertAdmin(sql: Sql, userId: string, cfg: SessionConfig) {
  if (!(await isAdminUser(sql, userId, cfg))) throw new ForbiddenError("Admins only");
}

// ---------------------------------------------------------------------------------------------
// Session metadata (place, device, last active)

export async function recordSessionMeta(
  sql: Sql,
  m: { sessionId: string; userId: string; ipNet: string | null; device: string | null; place: string | null },
) {
  if (!(await sessionSchemaReady(sql))) return;
  await sql`insert into ndu_session_meta (session_id, user_id, ip_net, device, place)
    values (${m.sessionId}, ${m.userId}, ${m.ipNet}, ${m.device}, ${m.place})
    on conflict (session_id) do nothing`;
}

const touched = new Map<string, number>();

/** Bump "last active", at most once per `touchEverySec` per session per process. */
export async function touchSession(sql: Sql, sessionId: string, cfg: Pick<SessionConfig, "touchEverySec">, now = Date.now()) {
  const last = touched.get(sessionId) ?? 0;
  if (now - last < cfg.touchEverySec * 1000) return;
  touched.set(sessionId, now);
  if (touched.size > 5000) for (const [k, t] of touched) if (now - t > cfg.touchEverySec * 1000) touched.delete(k);
  if (!(await sessionSchemaReady(sql))) return;
  await sql`update ndu_session_meta set last_seen_at = ${new Date(now)} where session_id = ${sessionId}`;
}

export async function lastSeenAt(sql: Sql, sessionId: string): Promise<string | null> {
  if (!(await sessionSchemaReady(sql))) return null;
  const rows = await sql<{ last_seen_at: unknown }>`select last_seen_at from ndu_session_meta where session_id = ${sessionId}`;
  return iso(rows[0]?.last_seen_at);
}

// ---------------------------------------------------------------------------------------------
// User-facing listing and revocation (always scoped to the signed-in user)

export type SessionView = {
  id: string;
  device: string;
  kind: string;
  place: string | null;
  network: string | null;
  signedInAt: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
  current: boolean;
};

type SessionRow = {
  id: string;
  user_id: string;
  created_at: unknown;
  updated_at: unknown;
  expires_at: unknown;
  ip: string | null;
  ua: string | null;
  device: string | null;
  place: string | null;
  last_seen_at: unknown;
};

async function sessionRows(sql: Sql, where: { userId?: string; q?: string }, limit: number): Promise<SessionRow[]> {
  const meta = await sessionSchemaReady(sql);
  const cols = meta
    ? `s.id, s."userId" as user_id, s."createdAt" as created_at, s."updatedAt" as updated_at, s."expiresAt" as expires_at,
       coalesce(m.ip_net, s."ipAddress") as ip, s."userAgent" as ua, m.device, m.place, m.last_seen_at`
    : `s.id, s."userId" as user_id, s."createdAt" as created_at, s."updatedAt" as updated_at, s."expiresAt" as expires_at,
       s."ipAddress" as ip, s."userAgent" as ua, null as device, null as place, null as last_seen_at`;
  const from = meta ? `"session" s left join ndu_session_meta m on m.session_id = s.id` : `"session" s`;
  const params: unknown[] = [new Date()];
  let filter = `s."expiresAt" > $1`;
  if (where.userId) {
    params.push(where.userId);
    filter += ` and s."userId" = $${params.length}`;
  }
  if (where.q) {
    params.push(`%${where.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    filter += ` and (u.email ilike $${params.length} or u.name ilike $${params.length} or u.id ilike $${params.length})`;
  }
  params.push(limit);
  return sql.query<SessionRow>(
    `select ${cols} from ${from} join "user" u on u.id = s."userId"
     where ${filter} order by coalesce(${meta ? "m.last_seen_at, " : ""}s."updatedAt") desc limit $${params.length}`,
    params,
  );
}

function toView(r: SessionRow, currentId: string | null, cfg: Pick<SessionConfig, "idleSec" | "absoluteSec">, now: number): SessionView | null {
  const ended = sessionEndReason(
    { createdAt: String(iso(r.created_at)), expiresAt: String(iso(r.expires_at)), lastSeenAt: iso(r.last_seen_at) },
    now,
    cfg,
  );
  if (ended) return null;
  const ua = parseUserAgent(r.ua);
  return {
    id: r.id,
    device: r.device || ua.label,
    kind: ua.kind,
    place: r.place ?? null,
    network: r.ip ?? null,
    signedInAt: iso(r.created_at),
    lastActiveAt: iso(r.last_seen_at) ?? iso(r.updated_at),
    expiresAt: iso(r.expires_at),
    current: r.id === currentId,
  };
}

export async function listUserSessions(sql: Sql, userId: string, currentSessionId: string | null, cfg: SessionConfig, now = Date.now()) {
  const rows = await sessionRows(sql, { userId }, 50);
  return rows
    .map((r) => toView(r, currentSessionId, cfg, now))
    .filter((v): v is SessionView => Boolean(v))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Sign out one of MY sessions. Returns how many rows went (0 when it is not mine). */
export async function revokeUserSession(sql: Sql, userId: string, sessionId: string): Promise<number> {
  const rows = await sql<{ id: string }>`delete from "session" where id = ${sessionId} and "userId" = ${userId} returning id`;
  return rows.length;
}

/** Sign out every one of MY sessions except the current one. */
export async function revokeOtherUserSessions(sql: Sql, userId: string, keepSessionId: string): Promise<number> {
  const rows = await sql<{ id: string }>`delete from "session" where "userId" = ${userId} and id <> ${keepSessionId} returning id`;
  return rows.length;
}

export async function revokeAllUserSessions(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{ id: string }>`delete from "session" where "userId" = ${userId} returning id`;
  return rows.length;
}

// ---------------------------------------------------------------------------------------------
// Admin desk (every function checks the actor server-side first)

export type AdminSessionView = SessionView & { userId: string; email: string | null; name: string | null };
export type AdminUserView = {
  id: string;
  email: string | null;
  name: string | null;
  sessions: number;
  lastActiveAt: string | null;
  suspended: boolean;
  suspendedReason: string | null;
  admin: boolean;
};
export type AuditView = { id: number; at: string | null; actor: string; action: string; target: string | null; detail: string | null };

export async function adminOverview(sql: Sql, actorId: string, q: string, cfg: SessionConfig, now = Date.now()) {
  await assertAdmin(sql, actorId, cfg);
  const search = q.trim().slice(0, 80);
  const schema = await sessionSchemaReady(sql);
  const rows = await sessionRows(sql, { q: search || undefined }, 200);
  const users = new Map<string, { email: string | null; name: string | null }>();
  if (rows.length) {
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const found = await sql.query<{ id: string; email: string | null; name: string | null }>(
      `select id, email, name from "user" where id = any($1)`,
      [ids],
    );
    for (const u of found) users.set(u.id, { email: u.email, name: u.name });
  }
  const sessions: AdminSessionView[] = rows
    .map((r) => {
      const v = toView(r, null, cfg, now);
      if (!v) return null;
      const u = users.get(r.user_id);
      return { ...v, userId: r.user_id, email: u?.email ?? null, name: u?.name ?? null };
    })
    .filter((v): v is AdminSessionView => Boolean(v));

  const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const userRows = await sql.query<{
    id: string;
    email: string | null;
    name: string | null;
    sessions: number;
    last_active: unknown;
    suspended: boolean;
    reason: string | null;
  }>(
    `select u.id, u.email, u.name,
       (select count(*)::int from "session" s where s."userId" = u.id and s."expiresAt" > now()) as sessions,
       (select max(s."updatedAt") from "session" s where s."userId" = u.id) as last_active,
       ${schema ? "(sus.user_id is not null)" : "false"} as suspended,
       ${schema ? "sus.reason" : "null"} as reason
     from "user" u ${schema ? "left join ndu_user_suspension sus on sus.user_id = u.id" : ""}
     where ($1 = '' or u.email ilike $2 or u.name ilike $2 or u.id ilike $2)
     order by ${schema ? "(sus.user_id is not null) desc," : ""} sessions desc, u."createdAt" desc
     limit 100`,
    [search, like],
  );
  const usersOut: AdminUserView[] = [];
  for (const u of userRows) {
    usersOut.push({
      id: u.id,
      email: u.email,
      name: u.name,
      sessions: Number(u.sessions) || 0,
      lastActiveAt: iso(u.last_active),
      suspended: Boolean(u.suspended),
      suspendedReason: u.reason ?? null,
      admin: isEnvAdmin(cfg, u.id, u.email),
    });
  }
  let audit: AuditView[] = [];
  if (schema) {
    const a = await sql<{ id: number; at: unknown; actor_id: string; actor_email: string | null; action: string; target_user_id: string | null; target_session_id: string | null; detail: string | null }>`
      select id::int as id, at, actor_id, actor_email, action, target_user_id, target_session_id, detail
      from ndu_admin_audit order by at desc, id desc limit 50`;
    audit = a.map((r) => ({
      id: Number(r.id),
      at: iso(r.at),
      actor: r.actor_email || r.actor_id,
      action: r.action,
      target: r.target_session_id ? `session ${r.target_session_id.slice(0, 8)}… of ${r.target_user_id ?? "?"}` : r.target_user_id,
      detail: r.detail,
    }));
  }
  return { schema, sessions, users: usersOut, audit };
}

async function audit(
  sql: Sql,
  actorId: string,
  action: string,
  target: { userId?: string | null; sessionId?: string | null; detail?: string | null },
) {
  if (!(await sessionSchemaReady(sql))) return;
  const actor = await sql<{ email: string | null }>`select email from "user" where id = ${actorId}`;
  await sql`insert into ndu_admin_audit (actor_id, actor_email, action, target_user_id, target_session_id, detail)
    values (${actorId}, ${actor[0]?.email ?? null}, ${action}, ${target.userId ?? null}, ${target.sessionId ?? null}, ${target.detail ?? null})`;
}

export async function adminRevokeSession(sql: Sql, actorId: string, sessionId: string, cfg: SessionConfig) {
  await assertAdmin(sql, actorId, cfg);
  const rows = await sql<{ user_id: string }>`delete from "session" where id = ${sessionId} returning "userId" as user_id`;
  if (rows.length) await audit(sql, actorId, "revoke_session", { userId: rows[0].user_id, sessionId });
  return { revoked: rows.length };
}

export async function adminRevokeUserSessions(sql: Sql, actorId: string, userId: string, cfg: SessionConfig) {
  await assertAdmin(sql, actorId, cfg);
  const n = await revokeAllUserSessions(sql, userId);
  await audit(sql, actorId, "revoke_all_sessions", { userId, detail: `${n} session(s)` });
  return { revoked: n };
}

export async function adminSuspendUser(sql: Sql, actorId: string, userId: string, reason: string, cfg: SessionConfig) {
  await assertAdmin(sql, actorId, cfg);
  if (userId === actorId) throw new ForbiddenError("You can't suspend yourself");
  if (!(await sessionSchemaReady(sql))) throw new NeedsMigrationError();
  const exists = await sql<{ id: string }>`select id from "user" where id = ${userId}`;
  if (!exists.length) return { suspended: false, revoked: 0 };
  const why = reason.trim().slice(0, 200) || null;
  const run = async (tx: Sql) => {
    await tx`insert into ndu_user_suspension (user_id, reason, suspended_by) values (${userId}, ${why}, ${actorId})
      on conflict (user_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now()`;
    return revokeAllUserSessions(tx, userId);
  };
  const revoked = sql.transaction ? await sql.transaction(run) : await run(sql);
  await audit(sql, actorId, "suspend_user", { userId, detail: [why, `${revoked} session(s) revoked`].filter(Boolean).join(" · ") });
  return { suspended: true, revoked };
}

export async function adminUnsuspendUser(sql: Sql, actorId: string, userId: string, cfg: SessionConfig) {
  await assertAdmin(sql, actorId, cfg);
  if (!(await sessionSchemaReady(sql))) throw new NeedsMigrationError();
  const rows = await sql<{ user_id: string }>`delete from ndu_user_suspension where user_id = ${userId} returning user_id`;
  if (rows.length) await audit(sql, actorId, "unsuspend_user", { userId });
  return { unsuspended: rows.length > 0 };
}

/** Record a role change made elsewhere (manager list) and rotate the target's sessions. */
export async function privilegeChanged(sql: Sql, actorId: string, email: string, granted: boolean) {
  const users = await sql<{ id: string }>`select id from "user" where lower(email) = lower(${email})`;
  let revoked = 0;
  for (const u of users) revoked += await revokeAllUserSessions(sql, u.id);
  await audit(sql, actorId, granted ? "grant_manager" : "remove_manager", {
    userId: users[0]?.id ?? null,
    detail: `${email} · ${revoked} session(s) rotated`,
  });
  return revoked;
}

// ---------------------------------------------------------------------------------------------
// Retention

const lastCleanup = new WeakMap<object, number>();

/** Delete expired / over-age sessions and old audit rows. Throttled to once an hour unless forced. */
export async function cleanupSessions(sql: Sql, cfg: SessionConfig, now = Date.now(), force = false) {
  if (!force && now - (lastCleanup.get(sql) ?? 0) < 3_600_000) return null;
  lastCleanup.set(sql, now);
  const absoluteCutoff = new Date(now - cfg.absoluteSec * 1000);
  const expired = await sql<{ id: string }>`delete from "session" where "expiresAt" <= ${new Date(now)} or "createdAt" <= ${absoluteCutoff} returning id`;
  let idle = 0;
  let audits = 0;
  if (await sessionSchemaReady(sql)) {
    const idleCutoff = new Date(now - cfg.idleSec * 1000);
    idle = (await sql<{ id: string }>`delete from "session" s using ndu_session_meta m
      where m.session_id = s.id and m.last_seen_at <= ${idleCutoff} returning s.id`).length;
    const auditCutoff = new Date(now - cfg.auditRetentionDays * 86_400_000);
    audits = (await sql<{ id: number }>`delete from ndu_admin_audit where at < ${auditCutoff} returning id`).length;
  }
  return { sessions: expired.length + idle, audits };
}
