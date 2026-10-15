/**
 * NDU-UPG sessions: integration tests through a REAL Better Auth instance (the app's own plugin +
 * options) on a THROWAWAY database. Always runs on in-memory PGLite; also on real Postgres when
 * TEST_DATABASE_URL points at a local scratch DB (CI's postgres:16 service), inside a fresh schema
 * that is dropped afterwards. Never touches citydesk-pg.
 *
 *   node --experimental-strip-types --import ./tests/property/register.mjs --test tests/sessions/*.test.ts
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

// db.ts boots its own PGLite (Vite-only glob) when DATABASE_URL is unset; point it at an unused URL.
process.env.DATABASE_URL ||= "postgres://ci@127.0.0.1:9/ndu_ci_unused";

type Sql = import("../../src/lib/db.ts").Sql;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAY = 86_400_000;
const ADMIN_EMAIL = "boss@example.test";

const { readSessionConfig } = await import("../../src/lib/auth/sessions/config.ts");
const { nduSessionAuthOptions, nduSessions } = await import("../../src/lib/auth/sessions/plugin.server.ts");
const store = await import("../../src/lib/auth/sessions/store.server.ts");
const { pgliteSql } = await import("../../src/lib/db.ts");
const { pgliteDialect } = await import("../../src/lib/auth/pglite-dialect.ts");

async function migrationFiles(skip0012: boolean) {
  const dir = path.join(ROOT, "migrations");
  const files = pendingMigrations(await readdir(dir), []).filter((m) => !(skip0012 && m.name.startsWith("0012_")));
  return Promise.all(files.map(async (m) => ({ name: m.name, text: await readFile(path.join(dir, m.path), "utf8") })));
}

type Engine = { name: string; make(skip0012: boolean): Promise<{ sql: Sql; database: unknown; close(): Promise<void> }> };

const pglite: Engine = {
  name: "PGLite",
  async make(skip0012) {
    const pg = new PGlite();
    await pg.waitReady;
    for (const m of await migrationFiles(skip0012)) await pg.exec(m.text);
    return { sql: pgliteSql(pg), database: { dialect: pgliteDialect(async () => pg), type: "postgres" }, close: () => pg.close() };
  },
};

function refuseNonScratch(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "TEST_DATABASE_URL is not a URL";
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname)) return "only a local scratch database is allowed";
  if (u.port === "5436") return "port 5436 is citydesk-pg (production)";
  if (!/(qa|test|ci)/i.test(u.pathname)) return 'the database name must contain "qa", "test" or "ci"';
  return null;
}

const DB_URL = process.env.TEST_DATABASE_URL?.trim() ?? "";
const pgSkip = !DB_URL ? "TEST_DATABASE_URL not set" : refuseNonScratch(DB_URL);
const postgres: Engine = {
  name: "Postgres",
  async make(skip0012) {
    const { default: pgmod } = await import("pg");
    const schema = `ndu_sess_${randomBytes(4).toString("hex")}`;
    const admin = new pgmod.Pool({ connectionString: DB_URL, max: 1 });
    await admin.query(`create schema ${schema}`);
    const pool = new pgmod.Pool({ connectionString: DB_URL, options: `-c search_path=${schema}`, max: 4 });
    pgmod.types.setTypeParser(20, Number);
    for (const m of await migrationFiles(skip0012)) await pool.query(m.text);
    const wrap = (run: (t: string, p: unknown[]) => Promise<{ rows: unknown[] }>): Sql => {
      const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        let text = strings[0];
        values.forEach((_, i) => (text += `$${i + 1}${strings[i + 1]}`));
        return (await run(text, values)).rows;
      }) as unknown as Sql;
      sql.query = (async (t: string, p: unknown[] = []) => (await run(t, p)).rows) as Sql["query"];
      return sql;
    };
    const sql = wrap((t, p) => pool.query(t, p));
    sql.transaction = async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn(wrap((t, p) => c.query(t, p)));
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    };
    return {
      sql,
      database: pool,
      async close() {
        await pool.end();
        await admin.query(`drop schema ${schema} cascade`);
        await admin.end();
      },
    };
  },
};

function cookieJar(res: Response, jar = new Map<string, string>()) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1);
    if (!value || /max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}
const headersFor = (jar: Map<string, string>, extra: Record<string, string> = {}) =>
  new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...extra });

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function setup(engine: Engine, opts: { skip0012?: boolean; env?: Record<string, string>; rateLimit?: boolean } = {}) {
  const db = await engine.make(Boolean(opts.skip0012));
  const cfg = readSessionConfig({ NDU_ADMIN_EMAILS: ADMIN_EMAIL, ...opts.env });
  const base = nduSessionAuthOptions(cfg);
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: randomBytes(32).toString("hex"),
    database: db.database as never,
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true, maxAge: 300 }, ...base.session },
    rateLimit: opts.rateLimit ? base.rateLimit : { enabled: false },
    advanced: {
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
      cookies: { session_token: { name: "__Host-grok-auth.session_token" }, session_data: { name: "__Host-grok-auth.session_data" } },
      ipAddress: base.ipAddress,
    },
    plugins: [nduSessions({ sql: async () => db.sql, config: cfg })],
  });
  store.resetSessionSchemaCache(db.sql);

  async function signUp(email: string, ua = UA_MAC, ip = "203.0.113.77") {
    const res = await auth.api.signUpEmail({
      body: { email, password: "correct horse battery", name: email.split("@")[0] },
      headers: new Headers({ "user-agent": ua, "x-forwarded-for": ip, "cf-ipcity": "Port%20Harcourt", "cf-region": "Rivers", "cf-ipcountry": "NG" }),
      asResponse: true,
    });
    assert.equal(res.status, 200, await res.clone().text());
    return cookieJar(res);
  }
  async function signIn(email: string, jar = new Map<string, string>(), ua = UA_IPHONE) {
    const res = await auth.api.signInEmail({
      body: { email, password: "correct horse battery" },
      headers: headersFor(jar, { "user-agent": ua, "x-forwarded-for": "198.51.100.23" }),
      asResponse: true,
    });
    return { res, jar: res.ok ? cookieJar(res, new Map(jar)) : jar };
  }
  async function session(jar: Map<string, string>) {
    const res = await auth.api.getSession({ headers: headersFor(jar), asResponse: true });
    const body = (await res.json()) as { session: { id: string; userId: string; token: string } } | null;
    return { body, res };
  }
  return { ...db, cfg, auth, signUp, signIn, session };
}

const engines: Array<[Engine, string | false | null]> = [
  [pglite, false],
  [postgres, pgSkip],
];

for (const [engine, skip] of engines) {
  describe(`NDU sessions on ${engine.name}`, { skip: skip || false }, () => {
    const opened: Array<{ close(): Promise<void> }> = [];
    after(async () => {
      for (const o of opened) await o.close().catch(() => {});
    });
    const fresh = async (o?: Parameters<typeof setup>[1]) => {
      const t = await setup(engine, o);
      opened.push(t);
      return t;
    };

    it("sign-in stores only the network, a device label and a coarse place; cookie is httpOnly + Secure + SameSite=Lax", async () => {
      const t = await fresh();
      const res = await t.auth.api.signUpEmail({
        body: { email: "ada@example.test", password: "correct horse battery", name: "Ada" },
        headers: new Headers({ "user-agent": UA_IPHONE, "x-forwarded-for": "203.0.113.77", "cf-ipcity": "Lagos", "cf-ipcountry": "NG" }),
        asResponse: true,
      });
      const tokenCookie = res.headers.getSetCookie().find((c) => c.startsWith("__Host-grok-auth.session_token="));
      assert.ok(tokenCookie, "session cookie set");
      assert.match(tokenCookie, /HttpOnly/i);
      assert.match(tokenCookie, /Secure/i);
      assert.match(tokenCookie, /SameSite=Lax/i);
      const rows = await t.sql<{ ip: string; device: string; place: string; ip_net: string }>`
        select s."ipAddress" as ip, m.device, m.place, m.ip_net from "session" s join ndu_session_meta m on m.session_id = s.id`;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].ip, "203.0.113.0/24");
      assert.equal(rows[0].ip_net, "203.0.113.0/24");
      assert.equal(rows[0].device, "Safari on iPhone");
      assert.equal(rows[0].place, "Lagos, NG");
    });

    it("lists my sessions with 'this device', and revoking another one works immediately (despite the cookie cache)", async () => {
      const t = await fresh();
      const laptop = await t.signUp("bea@example.test");
      const phone = (await t.signIn("bea@example.test")).jar;
      const me = (await t.session(laptop)).body!;
      const other = (await t.session(phone)).body!;
      assert.notEqual(me.session.id, other.session.id);
      assert.ok(phone.has("__Host-grok-auth.session_data"), "phone holds a cached session cookie");

      const list = await store.listUserSessions(t.sql, me.session.userId, me.session.id, t.cfg);
      assert.equal(list.length, 2);
      assert.equal(list[0].current, true);
      assert.equal(list.find((s) => !s.current)?.device, "Safari on iPhone");
      assert.equal(list[0].place, "Port Harcourt, Rivers, NG");

      // someone else's id is not mine to revoke
      assert.equal(await store.revokeUserSession(t.sql, "someone-else", other.session.id), 0);
      assert.equal(await store.revokeUserSession(t.sql, me.session.userId, other.session.id), 1);
      const after = await t.session(phone);
      assert.equal(after.body, null, "revoked session is gone on the very next read");
      assert.ok(after.res.headers.getSetCookie().some((c) => c.startsWith("__Host-grok-auth.session_token=") && /Max-Age=0/i.test(c)), "cookie cleared");
      assert.ok((await t.session(laptop)).body, "this device stays signed in");
    });

    it("sign out all other sessions keeps only this device", async () => {
      const t = await fresh();
      const a = await t.signUp("cy@example.test");
      const b = (await t.signIn("cy@example.test")).jar;
      const c = (await t.signIn("cy@example.test")).jar;
      const me = (await t.session(a)).body!;
      assert.equal(await store.revokeOtherUserSessions(t.sql, me.session.userId, me.session.id), 2);
      assert.equal((await t.session(b)).body, null);
      assert.equal((await t.session(c)).body, null);
      assert.ok((await t.session(a)).body);
    });

    it("rotates the session id on sign-in (the browser's old session is deleted)", async () => {
      const t = await fresh();
      const jar = await t.signUp("dee@example.test");
      const before = (await t.session(jar)).body!;
      const again = await t.signIn("dee@example.test", jar);
      assert.equal(again.res.status, 200);
      const now = (await t.session(again.jar)).body!;
      assert.notEqual(now.session.id, before.session.id);
      const left = await t.sql<{ id: string }>`select id from "session" where id = ${before.session.id}`;
      assert.equal(left.length, 0, "old session id no longer valid");
    });

    it("a manager role change rotates the target's sessions and is audited", async () => {
      const t = await fresh();
      const boss = await t.signUp(ADMIN_EMAIL);
      const bossId = (await t.session(boss)).body!.session.userId;
      const eve = await t.signUp("eve@example.test");
      await t.sql`insert into app_admins (email) values ('eve@example.test')`;
      assert.equal(await store.privilegeChanged(t.sql, bossId, "eve@example.test", true), 1);
      assert.equal((await t.session(eve)).body, null);
      const audit = await t.sql<{ action: string }>`select action from ndu_admin_audit`;
      assert.deepEqual(audit.map((r) => r.action), ["grant_manager"]);
    });

    it("idle timeout: no use for 7 days signs you out", async () => {
      const t = await fresh();
      const jar = await t.signUp("fin@example.test");
      const s = (await t.session(jar)).body!;
      await t.sql`update ndu_session_meta set last_seen_at = ${new Date(Date.now() - 7 * DAY - 60_000)} where session_id = ${s.session.id}`;
      assert.equal((await t.session(jar)).body, null);
      assert.equal((await t.sql`select id from "session" where id = ${s.session.id}`).length, 0);
    });

    it("idle timeout is also Better Auth's sliding expiry (7 days)", async () => {
      const t = await fresh();
      const jar = await t.signUp("gil@example.test");
      const s = (await t.session(jar)).body!;
      const exp = (await t.sql<{ e: unknown }>`select "expiresAt" as e from "session" where id = ${s.session.id}`)[0].e;
      const days = (new Date(String(exp instanceof Date ? exp.toISOString() : exp)).getTime() - Date.now()) / DAY;
      assert.ok(days > 6.9 && days <= 7.01, `expires in ~7 days, got ${days}`);
      await t.sql`update "session" set "expiresAt" = ${new Date(Date.now() - 1000)} where id = ${s.session.id}`;
      assert.equal((await t.session(jar)).body, null);
    });

    it("absolute timeout: 30 days after sign-in you are out, even if active", async () => {
      const t = await fresh();
      const jar = await t.signUp("hal@example.test");
      const s = (await t.session(jar)).body!;
      await t.sql`update "session" set "createdAt" = ${new Date(Date.now() - 30 * DAY - 1000)} where id = ${s.session.id}`;
      assert.equal((await t.session(jar)).body, null);
      assert.equal((await t.sql`select id from "session" where id = ${s.session.id}`).length, 0);
    });

    it("a suspended user is signed out everywhere and cannot sign in until unsuspended", async () => {
      const t = await fresh();
      const boss = await t.signUp(ADMIN_EMAIL);
      const bossId = (await t.session(boss)).body!.session.userId;
      const ivy = await t.signUp("ivy@example.test");
      const ivyId = (await t.session(ivy)).body!.session.userId;
      const r = await store.adminSuspendUser(t.sql, bossId, ivyId, "spam", t.cfg);
      assert.deepEqual(r, { suspended: true, revoked: 1 });
      assert.equal((await t.session(ivy)).body, null);
      const blocked = await t.signIn("ivy@example.test");
      assert.notEqual(blocked.res.status, 200, "suspended sign-in refused");
      assert.equal((await t.sql`select id from "session" where "userId" = ${ivyId}`).length, 0);
      await assert.rejects(store.adminSuspendUser(t.sql, bossId, bossId, "", t.cfg), { status: 403 });
      await store.adminUnsuspendUser(t.sql, bossId, ivyId, t.cfg);
      assert.equal((await t.signIn("ivy@example.test")).res.status, 200);
      const actions = (await t.sql<{ action: string }>`select action from ndu_admin_audit order by id`).map((a) => a.action);
      assert.deepEqual(actions, ["suspend_user", "unsuspend_user"]);
    });

    it("non-admins get 403 on every admin action; env and app_admins admins pass", async () => {
      const t = await fresh();
      const boss = await t.signUp(ADMIN_EMAIL);
      const bossId = (await t.session(boss)).body!.session.userId;
      const joe = await t.signUp("joe@example.test");
      const joeS = (await t.session(joe)).body!.session;
      const forbidden = { status: 403, name: "ForbiddenError" };
      await assert.rejects(store.adminOverview(t.sql, joeS.userId, "", t.cfg), forbidden);
      await assert.rejects(store.adminRevokeSession(t.sql, joeS.userId, joeS.id, t.cfg), forbidden);
      await assert.rejects(store.adminRevokeUserSessions(t.sql, joeS.userId, bossId, t.cfg), forbidden);
      await assert.rejects(store.adminSuspendUser(t.sql, joeS.userId, bossId, "", t.cfg), forbidden);
      await assert.rejects(store.adminUnsuspendUser(t.sql, joeS.userId, bossId, t.cfg), forbidden);
      assert.equal((await t.sql`select id from "session"`).length, 2, "nothing changed");

      const board = await store.adminOverview(t.sql, bossId, "joe", t.cfg);
      assert.equal(board.schema, true);
      assert.deepEqual(board.sessions.map((s) => s.email), ["joe@example.test"]);
      assert.deepEqual(board.users.map((u) => u.email), ["joe@example.test"]);
      assert.deepEqual(await store.adminRevokeSession(t.sql, bossId, joeS.id, t.cfg), { revoked: 1 });
      assert.equal((await t.session(joe)).body, null);

      await t.sql`insert into app_admins (email) values ('joe@example.test')`;
      assert.equal(await store.isAdminUser(t.sql, joeS.userId, t.cfg), true, "existing manager list is reused");
      const audit = await store.adminOverview(t.sql, bossId, "", t.cfg);
      assert.equal(audit.audit[0].action, "revoke_session");
      assert.equal(audit.audit[0].actor, ADMIN_EMAIL);
    });

    it("retention cleanup drops expired / over-age sessions and old audit rows", async () => {
      const t = await fresh();
      const jar = await t.signUp("kim@example.test");
      const s = (await t.session(jar)).body!;
      const keep = await t.signUp("lou@example.test");
      await t.sql`update "session" set "createdAt" = ${new Date(Date.now() - 31 * DAY)} where id = ${s.session.id}`;
      await t.sql`insert into ndu_admin_audit (actor_id, action, at) values ('x', 'old', ${new Date(Date.now() - 200 * DAY)}), ('x', 'new', now())`;
      const r = await store.cleanupSessions(t.sql, t.cfg, Date.now(), true);
      assert.deepEqual(r, { sessions: 1, audits: 1 });
      assert.ok((await t.session(keep)).body);
    });

    it("sign-in is rate limited per IP", async () => {
      const t = await fresh({ rateLimit: true, env: { NDU_SIGNIN_RATE_PER_MIN: "3" } });
      await t.signUp("max@example.test");
      const codes: number[] = [];
      // Better Auth's in-memory limiter is process-wide: use a fresh IP per engine run.
      const ip = `192.0.2.${10 + Math.floor(Math.random() * 200)}`;
      for (let i = 0; i < 5; i++) {
        const res = await t.auth.handler(
          new Request("http://localhost:3000/api/auth/sign-in/email", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:3000", "cf-connecting-ip": ip },
            body: JSON.stringify({ email: "max@example.test", password: "wrong password!" }),
          }),
        );
        codes.push(res.status);
      }
      assert.ok(codes.slice(0, 3).every((c) => c !== 429), `first 3 not limited: ${codes}`);
      assert.equal(codes[4], 429, `then 429: ${codes}`);
    });

    it("degrades safely without migration 0012: sign-in, listing and revoking work; suspension says 503", async () => {
      const t = await fresh({ skip0012: true });
      assert.equal(await store.sessionSchemaReady(t.sql), false);
      const boss = await t.signUp(ADMIN_EMAIL);
      const bossS = (await t.session(boss)).body!.session;
      const other = (await t.signIn(ADMIN_EMAIL)).jar;
      const list = await store.listUserSessions(t.sql, bossS.userId, bossS.id, t.cfg);
      assert.equal(list.length, 2);
      assert.equal(list[0].place, null);
      assert.equal(await store.revokeOtherUserSessions(t.sql, bossS.userId, bossS.id), 1);
      assert.equal((await t.session(other)).body, null);
      const board = await store.adminOverview(t.sql, bossS.userId, "", t.cfg);
      assert.equal(board.schema, false);
      await assert.rejects(store.adminSuspendUser(t.sql, bossS.userId, "nobody", "", t.cfg), { status: 503 });
      assert.ok((await t.session(boss)).body);
    });
  });
}
