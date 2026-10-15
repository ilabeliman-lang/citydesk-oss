/**
 * NDU-UPG sessions: Better Auth plugin + options that add session management on top of the
 * existing auth (server-only). Wired into `../server.ts` with a few marked lines.
 *
 *  - Sign-in: a suspended user gets no session (sign-in fails); the stored IP is cut to its network;
 *    device + coarse place are recorded; the browser's previous session is deleted (id rotation).
 *  - Every `/get-session` (the client's session read AND `auth.api.getSession` behind every server
 *    function): a revoked, suspended, idle-expired or absolute-expired session is deleted and the
 *    cookies cleared at once, even when the 5-minute session cookie cache would still say "signed in".
 *  - Sign-in rate limits, applied on the dev server too (Better Auth only limits in production).
 *
 * Works without migration 0012: the store's schema guard turns off the parts that need it.
 */
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import type { Sql } from "@/lib/db";
import { readSessionConfig, sessionEndReason, type SessionConfig } from "./config";
import { parseUserAgent, placeFromHeaders, truncateIp } from "./device";
import { cleanupSessions, isSuspended, lastSeenAt, recordSessionMeta, touchSession } from "./store.server";

type Opts = { sql?: () => Promise<Sql>; config?: SessionConfig };

const LOG = "[ndu-sessions]";

/** Session + rate-limit + IP options merged into `betterAuth({...})` in server.ts. */
export function nduSessionAuthOptions(cfg: SessionConfig = readSessionConfig()) {
  return {
    session: { expiresIn: cfg.idleSec, updateAge: cfg.updateAgeSec },
    rateLimit: { enabled: true, window: 60, max: 300 },
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"] },
  };
}

type HookCtx = {
  headers?: Headers;
  request?: Request;
  getSignedCookie?: (name: string, secret: string) => Promise<string | null | false>;
  context?: {
    secret: string;
    authCookies: { sessionToken: { name: string } };
    internalAdapter: { deleteSession(token: string): Promise<void> };
  };
} | null;

type NewSession = { id: string; token: string; userId: string; ipAddress?: string | null; userAgent?: string | null };

export function nduSessions(opts: Opts = {}): BetterAuthPlugin {
  const cfg = opts.config ?? readSessionConfig();
  const db = opts.sql ?? (async () => (await import("@/lib/db")).getSql());

  return {
    id: "ndu-sessions",
    init() {
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                before: async (session: NewSession) => {
                  const sql = await db();
                  if (await isSuspended(sql, session.userId)) return false; // suspended: no new session
                  return { data: { ipAddress: truncateIp(session.ipAddress) ?? "" } };
                },
                after: async (session: NewSession, raw: unknown) => {
                  const ctx = raw as HookCtx;
                  try {
                    const sql = await db();
                    const headers = ctx?.headers ?? ctx?.request?.headers ?? null;
                    await recordSessionMeta(sql, {
                      sessionId: session.id,
                      userId: session.userId,
                      ipNet: truncateIp(session.ipAddress),
                      device: parseUserAgent(session.userAgent).label,
                      place: placeFromHeaders(headers),
                    });
                    // Rotation: a fresh sign-in replaces whatever session this browser carried before.
                    if (ctx?.getSignedCookie && ctx.context) {
                      const old = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret).catch(() => null);
                      if (old && old !== session.token) await ctx.context.internalAdapter.deleteSession(old);
                    }
                    void cleanupSessions(sql, cfg).catch(() => {});
                  } catch (err) {
                    console.error(`${LOG} session create bookkeeping failed`, (err as Error)?.message);
                  }
                },
              },
            },
          },
        },
      };
    },
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            const out = ctx.context.returned as { session?: { id: string; token: string; userId: string } } | null;
            const s = out && typeof out === "object" && "session" in out ? out.session : null;
            if (!s?.id) return;
            const now = Date.now();
            let reason: string | null = null;
            let live = false;
            try {
              const sql = await db();
              // Read the row itself: the 5-minute cookie cache can carry stale (or revoked) session data.
              const row = (await sql<{ created_at: Date | string; expires_at: Date | string }>`
                select "createdAt" as created_at, "expiresAt" as expires_at from "session" where id = ${s.id}`)[0];
              live = Boolean(row);
              if (!row) reason = "revoked";
              else reason = sessionEndReason({ createdAt: row.created_at, expiresAt: row.expires_at, lastSeenAt: await lastSeenAt(sql, s.id) }, now, cfg);
              if (!reason && (await isSuspended(sql, s.userId))) reason = "suspended";
              if (!reason) {
                await touchSession(sql, s.id, cfg, now);
                void cleanupSessions(sql, cfg, now).catch(() => {});
                return;
              }
            } catch (err) {
              console.error(`${LOG} session check failed`, (err as Error)?.message);
              return;
            }
            if (live) await ctx.context.internalAdapter.deleteSession(s.token);
            deleteSessionCookie(ctx);
            return ctx.json(null);
          }),
        },
      ],
    },
    rateLimit: [
      { pathMatcher: (path: string) => path.startsWith("/sign-in") || path.startsWith("/sign-up"), window: 60, max: cfg.signinPerMin },
      { pathMatcher: (path: string) => path.startsWith("/oauth2/callback") || path.startsWith("/callback"), window: 60, max: cfg.signinPerMin * 2 },
    ],
  } satisfies BetterAuthPlugin;
}
