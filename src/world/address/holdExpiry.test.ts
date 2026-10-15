// NDU-UPG upg-u-046: address hold expiry. Pure unit tests, no live database.
//
// `holdExpiry.ts` is deliberately dependency-free so the predicate and the TTL parsing can be
// tested without Postgres. The worker itself is covered here through its SQL text (which rows it
// targets) and its log line (what it is allowed to say); a full server-fn test would need the DB.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  EXPIRED_HOLDS_WHERE,
  EXPIRY_THROTTLE_MS,
  HOLD_TTL_DAYS_DEFAULT,
  expireAddressHolds,
  expiredHoldLabel,
  expiryLogLine,
  holdTtlMs,
  isExpired,
  readHoldTtlDays,
} from "./holdExpiry.ts";

const DAY = 86_400_000;

describe("hold TTL window", () => {
  test("defaults to 30 days", () => {
    assert.equal(HOLD_TTL_DAYS_DEFAULT, 30);
    assert.equal(readHoldTtlDays({}), 30);
  });
  test("HOLD_TTL_DAYS overrides it", () => {
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "7" }), 7);
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: " 90 " }), 90);
  });
  test("blank or non-numeric falls back to the default, not to zero", () => {
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "" }), 30);
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "   " }), 30);
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "nope" }), 30);
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "0" }), 1); // clamped, never 0
  });
  test("clamped to a sane range", () => {
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "-5" }), 1);
    assert.equal(readHoldTtlDays({ HOLD_TTL_DAYS: "999999" }), 3650);
  });
  test("window in ms", () => {
    assert.equal(holdTtlMs(30), 30 * DAY);
    assert.equal(holdTtlMs(1), DAY);
  });
});

describe("isExpired", () => {
  const now = Date.UTC(2026, 9, 8, 12, 0, 0);
  test("past the deadline", () => {
    assert.equal(isExpired({ expires_at: new Date(now - DAY) }, now), true);
    assert.equal(isExpired({ expires_at: new Date(now - 1) }, now), true);
  });
  test("still inside the window", () => {
    assert.equal(isExpired({ expires_at: new Date(now + DAY) }, now), false);
    assert.equal(isExpired({ expires_at: new Date(now) }, now), false); // exactly at it: not yet
  });
  test("accepts the camelCase shape the app uses, and ISO strings", () => {
    assert.equal(isExpired({ expiresAt: new Date(now - DAY) }, now), true);
    assert.equal(isExpired({ expires_at: new Date(now + DAY).toISOString() }, now), false);
  });
  test("no deadline is never expired — pre-0022 rows are not swept away", () => {
    assert.equal(isExpired({ expires_at: null }, now), false);
    assert.equal(isExpired({}, now), false);
    assert.equal(isExpired(null, now), false);
  });
  test("an unparseable deadline is never expired", () => {
    assert.equal(isExpired({ expires_at: "not-a-date" }, now), false);
  });
  test("defaults to the current clock", () => {
    assert.equal(isExpired({ expires_at: new Date(Date.now() - DAY) }), true);
    assert.equal(isExpired({ expires_at: new Date(Date.now() + DAY) }), false);
  });
});

describe("worker SQL targets only expired rows", () => {
  test("the predicate matches the pure one and skips undated rows", () => {
    assert.equal(EXPIRED_HOLDS_WHERE, "expires_at is not null and expires_at < now()");
    assert.match(EXPIRED_HOLDS_WHERE, /expires_at\s*<\s*now\(\)/);
    assert.match(EXPIRED_HOLDS_WHERE, /expires_at is not null/);
  });
  test("it never widens to the whole table", () => {
    // A missing `where` (or a bare `1=1`) would release every hold on the map.
    assert.doesNotMatch(EXPIRED_HOLDS_WHERE, /where\s*$/i);
    assert.ok(!/\btrue\b|\b1\s*=\s*1\b/.test(EXPIRED_HOLDS_WHERE));
  });
});

describe("expiry log is redacted", () => {
  const released = [
    { address_id: "plot-12-aba-road", user_id: "usr_9f3a2b1c4d5e6f70", kind: "flat", floor: 2, unit: "A" },
    { address_id: "b", user_id: "u2", kind: "title", floor: 0, unit: "" },
    { address_id: "c", user_id: "u3", kind: "floor", floor: 5, unit: "" },
  ];
  test("says how many, and only a sample", () => {
    const line = expiryLogLine(released, (t) => t, 2);
    assert.match(line, /released 3 expired hold\(s\)/);
    assert.ok(line.includes("plot-12-aba-road"));
    assert.ok(!line.includes("u3"));
  });
  test("names and full ids never reach the log", () => {
    const line = expiryLogLine(released, (t) => t);
    assert.ok(!line.includes("usr_9f3a2b1c4d5e6f70")); // truncated to a handle
    assert.equal(expiredHoldLabel(released[0]), "plot-12-aba-road flat 2A by usr_9f3a");
  });
  test("the text goes through the PII pass", () => {
    const leaky = [{ address_id: "mail ada@shop.ng or call +234 803 123 4567", user_id: "u", kind: "title", floor: 0, unit: "" }];
    const line = expiryLogLine(leaky, (t) => t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"));
    assert.ok(!line.includes("ada@shop.ng"));
    assert.ok(line.includes("[email]"));
  });
  test("an empty sweep logs nothing but the count", () => {
    assert.equal(expiryLogLine([], (t) => t), "[holds] released 0 expired hold(s)");
  });
});

// A stub DB that records the SQL it was given and hands back a canned row set.
function stubSql(rows: unknown[] = []) {
  const seen: string[] = [];
  return {
    seen,
    async query<T>(text: string): Promise<T[]> {
      seen.push(text);
      return rows as T[];
    },
  };
}

describe("expireAddressHolds worker", () => {
  const row = { address_id: "plot-12", user_id: "usr_9f3a2b1c4d5e6f70", kind: "flat", floor: 2, unit: "A" };

  test("deletes only expired rows", async () => {
    const sql = stubSql([row]);
    const out = await expireAddressHolds(sql, Date.UTC(2026, 9, 8), true);
    assert.equal(out.released, 1);
    assert.equal(sql.seen.length, 1);
    assert.match(sql.seen[0], /^delete from ndu_address_hold where expires_at is not null and expires_at < now\(\)/);
    assert.match(sql.seen[0], /returning address_id, user_id, kind, floor, unit/);
  });

  test("an empty sweep is a no-op and logs nothing", async () => {
    const sql = stubSql([]);
    const out = await expireAddressHolds(sql, Date.UTC(2026, 9, 8), true);
    assert.deepEqual(out, { released: 0, skipped: false });
    assert.equal(sql.seen.length, 1);
  });

  test("idempotent: a second forced run still issues the same scoped delete", async () => {
    const sql = stubSql([]);
    await expireAddressHolds(sql, Date.UTC(2026, 9, 8), true);
    await expireAddressHolds(sql, Date.UTC(2026, 9, 8, 0, 0, 30), true);
    assert.equal(sql.seen.length, 2);
    assert.equal(sql.seen[0], sql.seen[1]); // same statement, so the same rows (none) are affected
  });

  test("throttled: a repeat call inside the window does not touch the DB", async () => {
    const sql = stubSql([]);
    const t0 = Date.UTC(2026, 9, 8);
    assert.deepEqual(await expireAddressHolds(sql, t0, false), { released: 0, skipped: false });
    assert.deepEqual(await expireAddressHolds(sql, t0 + EXPIRY_THROTTLE_MS - 1, false), { released: 0, skipped: true });
    assert.equal(sql.seen.length, 1);
    assert.deepEqual(await expireAddressHolds(sql, t0 + EXPIRY_THROTTLE_MS + 1, false), { released: 0, skipped: false });
    assert.equal(sql.seen.length, 2);
  });

  test("throttle is per connection, so a fresh connection still sweeps", async () => {
    const a = stubSql([]);
    const b = stubSql([]);
    const t0 = Date.UTC(2026, 9, 8);
    await expireAddressHolds(a, t0, false);
    assert.deepEqual(await expireAddressHolds(b, t0 + 1, false), { released: 0, skipped: false });
    assert.equal(b.seen.length, 1);
  });
});
