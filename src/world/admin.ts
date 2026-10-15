import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isAdmin } from "@/world/businesses";

async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) throw new Error("Managers only");
}

export const adminBoard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const sql = await getSql();
    const open = await sql<{ n: number }>`select count(*) as n from businesses where open = true`;
    const verified = await sql<{ n: number }>`select count(*) as n from businesses where open = true and verified = true`;
    const bookings = await sql<{ n: number }>`select count(*) as n from bookings where status in ('booked', 'checked_in') and starts_at > now() - interval '6 hours'`;
    const fills = await sql<{ n: number; vouchers: number }>`select count(*) as n, coalesce(sum(vouchers), 0) as vouchers from fuel_sales`;
    const places = await sql<{
      id: string;
      name: string;
      category: string;
      offer: string;
      listing: string;
      verified: boolean;
      open: boolean;
      fuel_price: number;
    }>`select id, name, category, offer, listing, verified, open, fuel_price from businesses order by open desc, verified asc, updated_at desc limit 40`;
    const visits = await sql<{
      id: string;
      business_name: string;
      starts_at: string | Date;
      status: string;
      note: string;
      guest: string | null;
    }>`select b.id, biz.name as business_name, b.starts_at, b.status, b.note, u.name as guest
      from bookings b
      join businesses biz on biz.id = b.business_id
      left join "user" u on u.id = b.user_id
      where b.starts_at > now() - interval '1 day'
      order by b.starts_at desc
      limit 30`;
    const sales = await sql<{
      id: string;
      business_name: string;
      vouchers: number;
      created_at: string | Date;
      guest: string | null;
    }>`select f.id, biz.name as business_name, f.vouchers, f.created_at, u.name as guest
      from fuel_sales f
      join businesses biz on biz.id = f.business_id
      left join "user" u on u.id = f.user_id
      order by f.created_at desc
      limit 30`;
    const managers = await sql<{ email: string }>`select email from app_admins order by email`;
    const { scamFor } = await import("@/lib/ingest/review.server"); // NDU-AI safe-ingest #4 (computed on read, no migration)
    return {
      open: Number(open[0]?.n ?? 0),
      verified: Number(verified[0]?.n ?? 0),
      bookings: Number(bookings[0]?.n ?? 0),
      fills: Number(fills[0]?.n ?? 0),
      fuelVouchers: Number(fills[0]?.vouchers ?? 0),
      places: places.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        offer: row.offer,
        listing: row.listing === "pin_checked" ? "pin_checked" : "self_listed",
        verified: Boolean(row.verified),
        open: Boolean(row.open),
        fuelPrice: Number(row.fuel_price) || 12,
        review: scamFor(row.name, row.offer),
      })),
      visits: visits.map((row) => ({
        id: row.id,
        businessName: row.business_name,
        startsAt: new Date(row.starts_at).toISOString(),
        status: row.status,
        note: row.note,
        guest: row.guest ?? "Guest",
      })),
      sales: sales.map((row) => ({
        id: row.id,
        businessName: row.business_name,
        vouchers: Number(row.vouchers),
        at: new Date(row.created_at).toISOString(),
        guest: row.guest ?? "Guest",
      })),
      managers: managers.map((row) => row.email),
    };
  });

export const adminSetOpen = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; open: boolean }) => ({
    id: String(input?.id ?? "").replace(/^ring-/, "").slice(0, 80),
    open: Boolean(input?.open),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (!data.id) return { ok: false as const };
    const sql = await getSql();
    await sql`update businesses set open = ${data.open}, updated_at = now() where id = ${data.id}`;
    return { ok: true as const };
  });

export const adminSetManager = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string; allow: boolean }) => {
    const email = String(input?.email ?? "").trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That is not an email");
    return { email, allow: Boolean(input?.allow) };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const sql = await getSql();
    if (!data.allow) {
      const rows = await sql<{ n: number }>`select count(*) as n from app_admins`;
      if (Number(rows[0]?.n ?? 0) <= 1) return { ok: false as const, reason: "Keep at least one manager" };
      const gone = await sql`delete from app_admins where lower(email) = ${data.email} returning email`;
      if (gone.length) await rotateOnRoleChange(context.userId, data.email, false); // NDU-UPG sessions
      return { ok: true as const };
    }
    const added = await sql`insert into app_admins (email) values (${data.email}) on conflict (email) do nothing returning email`;
    if (added.length) await rotateOnRoleChange(context.userId, data.email, true); // NDU-UPG sessions
    return { ok: true as const };
  });

// NDU-UPG sessions: a role change signs the target out everywhere (fresh session ids on next sign-in) and is audited.
async function rotateOnRoleChange(actorId: string, email: string, granted: boolean) {
  const sql = await getSql();
  await import("@/lib/auth/sessions/store.server")
    .then((m) => m.privilegeChanged(sql, actorId, email, granted))
    .catch((err) => console.error("[ndu-sessions] role-change rotation failed", (err as Error)?.message));
}
