/**
 * NDU-UPG upg-u-046: address hold expiry.
 *
 * A hold used to live forever. Now every hold is claimed with a deadline: HOLD_TTL_DAYS
 * (env override `HOLD_TTL_DAYS`, default 30) from the moment it is claimed. When the
 * deadline passes the hold is released and the title / floor / flat is free again.
 *
 * Pure and dependency-free (no `@/lib/db`, no server imports) so node:test can exercise the
 * predicate and the TTL parsing directly. The SQL lives in `addressHolds.ts`.
 */

import { redactText } from "../search/privacy.ts"; // the PII-redacting text pass, reused for the log line

/** Days a hold lasts when nothing is configured. */
export const HOLD_TTL_DAYS_DEFAULT = 30;

/** Env name that overrides the default window. */
export const HOLD_TTL_DAYS_ENV = "HOLD_TTL_DAYS";

/** Nobody asks for a 0-day hold; nobody wants a 10-year one either. */
export const HOLD_TTL_DAYS_MIN = 1;
export const HOLD_TTL_DAYS_MAX = 3650;

const DAY_MS = 86_400_000;

/**
 * Read the TTL window in days. Unset, blank, or non-numeric falls back to the default;
 * out-of-range values are clamped. Same shape as `readSessionConfig`'s `num()`.
 */
export function readHoldTtlDays(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): number {
  const raw = String(env?.[HOLD_TTL_DAYS_ENV] ?? "").trim();
  if (!raw) return HOLD_TTL_DAYS_DEFAULT;
  const v = Number(raw);
  if (!Number.isFinite(v)) return HOLD_TTL_DAYS_DEFAULT;
  return Math.min(HOLD_TTL_DAYS_MAX, Math.max(HOLD_TTL_DAYS_MIN, v));
}

/** The window in milliseconds, for arithmetic in tests and callers. */
export function holdTtlMs(days = HOLD_TTL_DAYS_DEFAULT): number {
  return Math.round(days * DAY_MS);
}

/** A row as it comes back from `ndu_address_hold` (snake_case) or from the app (camelCase). */
export type Expiring = {
  expiresAt?: Date | string | number | null;
  expires_at?: Date | string | number | null;
};

function deadlineOf(row: Expiring | null | undefined): number | null {
  const raw = row?.expires_at ?? row?.expiresAt;
  if (raw === null || raw === undefined || raw === "") return null;
  const at = raw instanceof Date ? raw.getTime() : new Date(raw as string).getTime();
  return Number.isFinite(at) ? at : null;
}

/**
 * True when the hold's deadline has passed, i.e. `expires_at < now`.
 *
 * A row with no deadline (null / blank / unparseable) is NEVER expired: we cannot date it,
 * so we do not delete it. That keeps the worker safe on rows written before migration 0022.
 * Exactly at the deadline is not yet expired — the same boundary the SQL uses.
 */
export function isExpired(row: Expiring | null | undefined, now: number | Date = Date.now()): boolean {
  const at = deadlineOf(row);
  if (at === null) return false;
  return at < (now instanceof Date ? now.getTime() : now);
}

/** What the worker deletes: the same predicate, as SQL. Kept beside `isExpired` so they agree. */
export const EXPIRED_HOLDS_WHERE = "expires_at is not null and expires_at < now()";

/** Everything the log is allowed to say about one released hold: place, slot, short handle. */
export function expiredHoldLabel(row: {
  addressId?: string;
  address_id?: string;
  userId?: string;
  user_id?: string;
  kind?: string;
  floor?: number;
  unit?: string;
}): string {
  const place = String(row?.address_id ?? row?.addressId ?? "?").slice(0, 80) || "?";
  const kind = String(row?.kind ?? "title");
  const floor = Number(row?.floor ?? 0) || 0;
  const unit = String(row?.unit ?? "");
  const slot = kind === "title" ? "title" : `${kind} ${floor}${unit}`;
  // A handle, never the whole id: user ids and names are not log material.
  const who = String(row?.user_id ?? row?.userId ?? "").slice(0, 8) || "anon";
  return `${place} ${slot} by ${who}`;
}

/**
 * The one log line the expiry worker writes, after `redact` (the same PII-redacting text
 * pass used for search indexing) has scrubbed it. Counts first, then at most a few labels —
 * a worker that expired a thousand holds must not print a thousand names.
 */
export function expiryLogLine(
  released: ReadonlyArray<Parameters<typeof expiredHoldLabel>[0]>,
  redact: (text: string) => string,
  sampleLimit = 3,
): string {
  const labels = released.slice(0, Math.max(0, sampleLimit)).map(expiredHoldLabel);
  const head = `[holds] released ${released.length} expired hold(s)`;
  return redact(labels.length ? `${head}: ${labels.join(" | ")}` : head);
}

// ---------------------------------------------------------------------------------------------
// The worker itself

/** A row the worker is about to release. Shape only — this is what `returning` gives back. */
export type ExpiredHoldRow = {
  address_id: string;
  user_id: string;
  kind: string;
  floor: number;
  unit: string;
};

/** The smallest DB surface the worker needs. `query` (plain SQL text) fits Neon and PGLite alike. */
export type HoldSql = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> };

/** How long the worker refuses to run again after a pass, unless forced. Same idea as session cleanup. */
export const EXPIRY_THROTTLE_MS = 15 * 60_000;
const lastExpiryRun = new WeakMap<object, number>();

/**
 * Release holds whose deadline has passed: `expires_at < now()`.
 *
 * Idempotent — it is a delete keyed on the deadline, so running it twice in a row releases
 * nothing the second time, and a row with no deadline is never touched. Safe to call from a
 * cron tick, a manual admin poke, or on server start.
 *
 * The only thing logged is the count plus at most a few `place slot by handle` labels, and it
 * goes through `redactText` (the same PII pass used for search indexing) — no names, no emails,
 * no full user ids.
 */
export async function expireAddressHolds(
  sql: HoldSql,
  now = Date.now(),
  force = false,
): Promise<{ released: number; skipped: boolean }> {
  if (!force && now - (lastExpiryRun.get(sql) ?? 0) < EXPIRY_THROTTLE_MS) return { released: 0, skipped: true };
  lastExpiryRun.set(sql, now);
  const gone = await sql.query<ExpiredHoldRow>(
    `delete from ndu_address_hold where ${EXPIRED_HOLDS_WHERE} returning address_id, user_id, kind, floor, unit`,
  );
  const line = expiryLogLine(gone, redactText);
  if (gone.length) console.log(line);
  return { released: gone.length, skipped: false };
}
