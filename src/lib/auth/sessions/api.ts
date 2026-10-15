/**
 * NDU-UPG sessions: server functions for the Account → Sessions sheet and the admin desk.
 * Dual client/server module: only `*.server` modules are imported, and only inside handlers.
 * Every call: same-site/same-origin check, verified session, then (admin calls) a server-side
 * admin check that answers 403.
 */
import { createMiddleware, createServerFn } from "@tanstack/react-start";

export const sessionMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("../client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { resolveCurrentSession, withStatus } = await import("./guard.server");
    const current = await withStatus(() => resolveCurrentSession(context.bearerToken));
    return next({ context: current });
  });

async function deps() {
  const [{ getSql }, store, { readSessionConfig }, { withStatus }] = await Promise.all([
    import("@/lib/db"),
    import("./store.server"),
    import("./config"),
    import("./guard.server"),
  ]);
  return { sql: await getSql(), store, cfg: readSessionConfig(), withStatus };
}

const id = (v: unknown) => String(v ?? "").trim().slice(0, 128);

export const mySessions = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const { sql, store, cfg } = await deps();
    const [sessions, admin, schema] = await Promise.all([
      store.listUserSessions(sql, context.userId, context.sessionId, cfg),
      store.isAdminUser(sql, context.userId, cfg).catch(() => false),
      store.sessionSchemaReady(sql),
    ]);
    return { sessions, admin, schema, idleDays: cfg.idleSec / 86_400, absoluteDays: cfg.absoluteSec / 86_400 };
  });

export const revokeMySession = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { id: string }) => ({ id: id(input?.id) }))
  .handler(async ({ context, data }) => {
    const { sql, store } = await deps();
    const revoked = await store.revokeUserSession(sql, context.userId, data.id);
    return { revoked, signedOutHere: data.id === context.sessionId };
  });

export const revokeMyOtherSessions = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const { sql, store } = await deps();
    return { revoked: await store.revokeOtherUserSessions(sql, context.userId, context.sessionId) };
  });

export const amISessionAdmin = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const { sql, store, cfg } = await deps();
    return { admin: await store.isAdminUser(sql, context.userId, cfg).catch(() => false) };
  });

export const adminSessionsBoard = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { q?: string }) => ({ q: String(input?.q ?? "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    const { sql, store, cfg, withStatus } = await deps();
    return withStatus(() => store.adminOverview(sql, context.userId, data.q, cfg));
  });

export type AdminSessionAction = "revoke_session" | "revoke_user" | "suspend" | "unsuspend";

export const adminSessionAction = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { action: AdminSessionAction; id: string; reason?: string }) => {
    const action = input?.action;
    if (!["revoke_session", "revoke_user", "suspend", "unsuspend"].includes(action)) throw new Error("Unknown action");
    return { action, id: id(input?.id), reason: String(input?.reason ?? "").slice(0, 200) };
  })
  .handler(async ({ context, data }) => {
    const { sql, store, cfg, withStatus } = await deps();
    return withStatus(async () => {
      if (!data.id) throw Object.assign(new Error("Missing id"), { status: 400 });
      switch (data.action) {
        case "revoke_session":
          return { ok: true, ...(await store.adminRevokeSession(sql, context.userId, data.id, cfg)) };
        case "revoke_user":
          return { ok: true, ...(await store.adminRevokeUserSessions(sql, context.userId, data.id, cfg)) };
        case "suspend":
          return { ok: true, ...(await store.adminSuspendUser(sql, context.userId, data.id, data.reason, cfg)) };
        case "unsuspend":
          return { ok: true, ...(await store.adminUnsuspendUser(sql, context.userId, data.id, cfg)) };
      }
    });
  });
