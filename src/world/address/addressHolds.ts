import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { expireAddressHolds, readHoldTtlDays } from "./holdExpiry";

export type AddressHold = {
  addressId: string;
  userId: string;
  name: string;
  kind: "title" | "floor" | "flat";
  floor: number;
  unit: string;
};

function cleanId(value: unknown): string {
  return String(value ?? "").trim().slice(0, 80);
}

function asKind(value: unknown): "title" | "floor" | "flat" {
  return value === "floor" || value === "flat" ? value : "title";
}

async function rowsFor(addressId: string): Promise<AddressHold[]> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ user_id: string; name: string | null; kind: string; floor: number; unit: string }>`
    select h.user_id, u.name, h.kind, h.floor, h.unit
    from ndu_address_hold h
    left join "user" u on u.id = h.user_id
    where h.address_id = ${addressId}
      and (h.expires_at is null or h.expires_at >= now())
    order by h.kind, h.floor, h.unit`;
  return rows.map((row) => ({
    addressId,
    userId: row.user_id,
    name: row.name || "Resident",
    kind: row.kind === "floor" || row.kind === "flat" ? row.kind : "title",
    floor: Number(row.floor) || 0,
    unit: row.unit || "",
  }));
}

/** Names on an address. No email. */
export const listAddressHolds = createServerFn({ method: "POST" })
  .validator((input: { addressId?: string }) => ({ addressId: cleanId(input?.addressId) }))
  .handler(async ({ data }) => {
    if (!data.addressId) return { holds: [] as AddressHold[] };
    return { holds: await rowsFor(data.addressId) };
  });

export const claimAddressHold = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { addressId?: string; label?: string; storeys?: number; kind?: string; floor?: number; unit?: string }) => {
    const kind = asKind(input?.kind);
    const floor = kind === "title" ? 0 : Math.max(1, Math.min(200, Math.round(Number(input?.floor) || 1)));
    const unit = kind === "flat" ? String(input?.unit ?? "").trim().slice(0, 6).toUpperCase() : "";
    return {
      addressId: cleanId(input?.addressId),
      label: String(input?.label ?? "Address").trim().slice(0, 80) || "Address",
      storeys: Math.max(1, Math.min(200, Math.round(Number(input?.storeys) || 1))),
      kind,
      floor,
      unit,
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.addressId) return { ok: false as const, reason: "This place has no address.", holds: [] as AddressHold[] };
    if (data.kind === "flat" && !data.unit) return { ok: false as const, reason: "Name the flat.", holds: await rowsFor(data.addressId) };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`insert into ndu_address (id, label, storeys) values (${data.addressId}, ${data.label}, ${data.storeys})
      on conflict (id) do update set label = excluded.label, storeys = greatest(ndu_address.storeys, excluded.storeys)`;
    if (data.kind === "floor" || data.kind === "flat") {
      const taken = await sql<{ name: string | null }>`
        select u.name from ndu_address_hold h
        left join "user" u on u.id = h.user_id
        where h.address_id = ${data.addressId} and h.kind = ${data.kind} and h.floor = ${data.floor} and h.unit = ${data.unit} and h.user_id <> ${context.userId}
          and (h.expires_at is null or h.expires_at >= now())
        limit 1`;
      if (taken[0]) {
        return { ok: false as const, reason: `Held by ${taken[0].name || "someone else"}.`, holds: await rowsFor(data.addressId) };
      }
    }
    // NDU-UPG u-038 + u-046: still idempotent on the primary key; a replay only refreshes the TTL.
    // Claiming (or re-claiming) starts the TTL window. now() + make_interval keeps the deadline in
    // database time, so it is measured against the same clock as `expires_at < now()` in the worker.
    await sql`insert into ndu_address_hold (address_id, user_id, kind, floor, unit, expires_at)
      values (${data.addressId}, ${context.userId}, ${data.kind}, ${data.floor}, ${data.unit}, now() + make_interval(days => ${readHoldTtlDays()}))
      on conflict (address_id, user_id, kind, floor, unit) do update set expires_at = excluded.expires_at`;
    return { ok: true as const, holds: await rowsFor(data.addressId) };
  });

export const revokeAddressHold = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { addressId?: string; userId?: string; kind?: string; floor?: number; unit?: string }) => ({
    addressId: cleanId(input?.addressId),
    userId: cleanId(input?.userId),
    kind: asKind(input?.kind),
    floor: Math.max(0, Math.min(200, Math.round(Number(input?.floor) || 0))),
    unit: String(input?.unit ?? "").slice(0, 6),
  }))
  .handler(async ({ context, data }) => {
    if (!data.addressId || !data.userId) return { ok: false as const, holds: [] as AddressHold[] };
    const { isAdmin } = await import("@/world/businesses");
    const operator = await isAdmin(context.userId);
    if (!operator && data.userId !== context.userId) return { ok: false as const, holds: await rowsFor(data.addressId) };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from ndu_address_hold
      where address_id = ${data.addressId} and user_id = ${data.userId} and kind = ${data.kind} and floor = ${data.floor} and unit = ${data.unit}`;
    return { ok: true as const, holds: await rowsFor(data.addressId) };
  });

// ---------------------------------------------------------------------------------------------
// Expiry worker (NDU-UPG upg-u-046)
//
// The worker itself (`expireAddressHolds`) lives in ./holdExpiry.ts so it can be unit tested
// without a database; this file adds the server-fn triggers around it and re-exports it.

export { expireAddressHolds } from "./holdExpiry";

/** Manual / scheduled trigger. Managers only — an ordinary resident must not release other people's holds. */
export const runExpireAddressHolds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { force?: boolean }) => ({ force: input?.force === true }))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await import("@/world/businesses");
    if (!(await isAdmin(context.userId))) return { ok: false as const, reason: "Managers only.", released: 0 };
    const { getSql } = await import("@/lib/db");
    const { released } = await expireAddressHolds(await getSql(), Date.now(), data.force);
    return { ok: true as const, released };
  });

/**
 * Fire-and-forget sweep for callers that already have a connection (cron tick, server start).
 * Never throws: an expiry failure must not take down the request that triggered it.
 */
export async function kickExpireAddressHolds(now = Date.now(), force = false): Promise<number> {
  try {
    const { getSql } = await import("@/lib/db");
    const { released } = await expireAddressHolds(await getSql(), now, force);
    return released;
  } catch (err) {
    console.error("[holds] expiry sweep failed", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** The current window in days, for diagnostics. */
export function holdExpiryWindowDays(): number {
  return readHoldTtlDays();
}
