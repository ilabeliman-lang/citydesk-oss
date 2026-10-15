import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { lookupPin } from "@/world/googlePlaces";
import type { LifeKind } from "@/world/places";

export type RingPlace = {
  id: string;
  name: string;
  kind: LifeKind;
  offer: string;
  lat: number;
  lng: number;
  category: string;
  listing: "self_listed" | "pin_checked";
  verified: boolean;
};

const CATEGORIES = ["shop", "service", "office", "place", "home", "station"] as const;
type Category = (typeof CATEGORIES)[number];

function coord(n: unknown, min: number, max: number): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

function snap(n: number) {
  return Math.round(n / 0.002) * 0.002;
}

function kindOf(category: string): LifeKind {
  if (category === "shop") return "eat";
  if (category === "home" || category === "place") return "rest";
  return "shift";
}

export const listOpenBusinesses = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = coord(input?.lat, -90, 90);
    const lng = coord(input?.lng, -180, 180);
    if (lat === null || lng === null) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<RingPlace[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      category: string;
      offer: string;
      lat: number;
      lng: number;
      listing: string;
      verified: boolean;
    }>`select id, name, category, offer, lat, lng, listing, verified from businesses
      where open = true
        and declared = true
        and abs(lat - ${data.lat}) < 0.03
        and abs(lng - ${data.lng}) < 0.03
      order by verified desc, updated_at desc
      limit 24`;
    return rows.map((row) => ({
      id: `ring-${row.id}`,
      name: row.name,
      kind: kindOf(row.category),
      offer: row.offer,
      lat: row.lat,
      lng: row.lng,
      category: row.category,
      listing: row.listing === "pin_checked" ? "pin_checked" : "self_listed",
      verified: Boolean(row.verified),
    }));
  });

export const openBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { name: string; category: string; offer: string; lat: number; lng: number; declared: boolean; checkPin: boolean }) => {
      const name = String(input?.name ?? "").trim().slice(0, 40);
      const offer = String(input?.offer ?? "").trim().slice(0, 80);
      const category = CATEGORIES.includes(input?.category as Category) ? (input.category as Category) : "shop";
      const lat = coord(input?.lat, -90, 90);
      const lng = coord(input?.lng, -180, 180);
      if (!name || !offer || lat === null || lng === null) throw new Error("Name, offer, and location are required");
      if (input?.declared !== true) throw new Error("You have to say you operate this place");
      return { name, offer, category, lat, lng, declared: true as const, checkPin: Boolean(input?.checkPin) };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<{ n: number }>`select count(*) as n from businesses where owner_id = ${context.userId} and open = true`;
    if (Number(existing[0]?.n ?? 0) >= 3) throw new Error("Three open listings is the limit for now");

    let lat = data.category === "home" ? snap(data.lat) : data.lat;
    let lng = data.category === "home" ? snap(data.lng) : data.lng;
    let listing: "self_listed" | "pin_checked" = "self_listed";
    let pinSource = "stood_here";
    let googlePlaceId: string | null = null;

    if (data.checkPin && data.category !== "home") {
      const pin = await lookupPin(data.name, data.lat, data.lng);
      if (pin.matched) {
        lat = pin.lat;
        lng = pin.lng;
        listing = "pin_checked";
        pinSource = "google_place";
        googlePlaceId = pin.placeId;
      }
    }

    const id = crypto.randomUUID();
    // NDU-AI safe-ingest #4: scam / impersonation check. Flags for a manager; it never bans. Only the
    // OFF-by-default INGEST_SCAM_HOLD flag keeps a "high" listing closed until a manager opens it.
    const { listingReview } = await import("@/lib/ingest/review.server");
    const review = listingReview(id, data.name, data.offer);
    const open = !review.hold;
    await sql`insert into businesses
      (id, owner_id, name, category, offer, lat, lng, open, declared, pin_source, google_place_id, listing, updated_at)
      values (${id}, ${context.userId}, ${data.name}, ${data.category}, ${data.offer}, ${lat}, ${lng}, ${open}, true, ${pinSource}, ${googlePlaceId}, ${listing}, now())`;
    return { id, listing, review: review.public };
  });

export const claimGooglePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { placeId: string; name: string; lat: number; lng: number }) => {
    const placeId = String(input?.placeId ?? "").trim().slice(0, 120);
    const name = String(input?.name ?? "").trim().slice(0, 40);
    const lat = coord(input?.lat, -90, 90);
    const lng = coord(input?.lng, -180, 180);
    if (!placeId || !name || lat === null || lng === null) throw new Error("That Google place is incomplete");
    return { placeId, name, lat, lng };
  })
  .handler(async () => {
    // NDU-UPG 904: do not store a Google place id or move a pin onto Google coordinates.
    return { ok: false as const, reason: "Google places are not shown on this map" };
  });

export const applyBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; lat: number; lng: number }) => {
    const name = String(input?.name ?? "").trim().slice(0, 40);
    const lat = coord(input?.lat, -90, 90);
    const lng = coord(input?.lng, -180, 180);
    if (!name || lat === null || lng === null) throw new Error("Place required");
    return { name, lat, lng };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = crypto.randomUUID();
    await sql`insert into businesses
      (id, owner_id, name, category, offer, lat, lng, open, declared, pin_source, listing, verified, updated_at)
      values (${id}, ${context.userId}, ${data.name}, 'shop', 'Branch application. 40 game vouchers. Waiting for an admin.', ${data.lat}, ${data.lng}, false, true, 'stood_here', 'self_listed', false, now())`;
    return { ok: true as const, reason: "Application sent. An admin still has to confirm the branch." };
  });

export const listMine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; category: string; offer: string; open: boolean }>`
      select id, name, category, offer, open from businesses
      where owner_id = ${context.userId}
      order by updated_at desc
      limit 12`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      offer: row.offer,
      open: Boolean(row.open),
    }));
  });

export const savePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; offer: string }) => {
    const id = bareId(input?.id);
    const offer = String(input?.offer ?? "").trim().slice(0, 80);
    if (!id || !offer) throw new Error("Say what is inside");
    return { id, offer };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owned = await sql<{ id: string }>`select id from businesses where id = ${data.id} and owner_id = ${context.userId}`;
    if (!owned[0]) return { ok: false as const, reason: "Only the owner can change this place" };
    await sql`update businesses set offer = ${data.offer}, updated_at = now() where id = ${data.id}`;
    return { ok: true as const, reason: "Saved. This is the note visitors read. The rooms are not rebuilt." };
  });

export const closeBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => String(id ?? "").replace(/^ring-/, "").slice(0, 80))
  .handler(async ({ context, data: id }) => {
    if (!id) return { ok: false as const };
    const sql = await getSql();
    await sql`update businesses set open = false, updated_at = now() where id = ${id} and owner_id = ${context.userId}`;
    return { ok: true as const };
  });

function bareId(id: string) {
  return String(id ?? "").replace(/^ring-/, "").slice(0, 80);
}

function slotTimes(from = Date.now()) {
  const step = 30 * 60 * 1000;
  const start = Math.ceil(from / step) * step;
  return Array.from({ length: 12 }, (_, i) => new Date(start + i * step).toISOString());
}

export async function isAdmin(userId: string) {
  if (userId === "dev-user") return true;
  const sql = await getSql();
  // NDU-UPG sessions: env allowlist (NDU_ADMIN_EMAILS / NDU_ADMIN_USER_IDS) on top of app_admins; a suspended account is never admin
  const sessions = await import("@/lib/auth/sessions/store.server").catch(() => null);
  if (sessions) return sessions.isAdminUser(sql, userId, (await import("@/lib/auth/sessions/config")).readSessionConfig());
  const rows = await sql<{ admin: boolean }>`
    select (a.email is not null) as admin
    from "user" u
    left join app_admins a on lower(a.email) = lower(u.email)
    where u.id = ${userId}`;
  return Boolean(rows[0]?.admin);
}

export type Seat = { startsAt: string; taken: boolean };
export type Appt = {
  id: string;
  businessId: string;
  businessName: string;
  startsAt: string;
  status: string;
  note: string;
  guest: string;
  mine: boolean;
};

export const sessionRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => ({ admin: await isAdmin(context.userId) }));

export const listForReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Managers only");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      category: string;
      offer: string;
      listing: string;
      verified: boolean;
    }>`select id, name, category, offer, listing, verified from businesses
      where open = true and declared = true
      order by verified asc, updated_at desc
      limit 40`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      offer: row.offer,
      listing: row.listing === "pin_checked" ? "pin_checked" : "self_listed",
      verified: Boolean(row.verified),
    }));
  });

export const setVerified = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; verified: boolean }) => ({
    id: bareId(input?.id),
    verified: Boolean(input?.verified),
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) return { ok: false as const };
    if (!(await isAdmin(context.userId))) throw new Error("Managers only");
    const sql = await getSql();
    if (data.verified) {
      await sql`update businesses set verified = true, verified_at = now(), verified_by = ${context.userId}, updated_at = now() where id = ${data.id} and open = true`;
    } else {
      await sql`update businesses set verified = false, verified_at = null, verified_by = null, updated_at = now() where id = ${data.id}`;
    }
    return { ok: true as const };
  });

export const listSeats = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => bareId(id))
  .handler(async ({ data: id }): Promise<Seat[]> => {
    if (!id) return [];
    const sql = await getSql();
    const biz = await sql<{ verified: boolean }>`select verified from businesses where id = ${id} and open = true and declared = true`;
    if (!biz[0]?.verified) return [];
    const slots = slotTimes();
    const taken = await sql<{ starts_at: string | Date }>`
      select starts_at from bookings
      where business_id = ${id} and status in ('booked', 'checked_in')`;
    const held = new Set(taken.map((row) => new Date(row.starts_at).toISOString()));
    return slots.map((startsAt) => ({ startsAt, taken: held.has(startsAt) }));
  });

export const bookSeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; startsAt: string; note: string }) => {
    const id = bareId(input?.id);
    const startsAt = new Date(String(input?.startsAt ?? "")).toISOString();
    const note = String(input?.note ?? "").trim().slice(0, 80);
    if (!id || Number.isNaN(Date.parse(startsAt))) throw new Error("Pick a time");
    return { id, startsAt, note };
  })
  .handler(async ({ context, data }) => {
    if (!slotTimes().includes(data.startsAt)) return { ok: false as const, reason: "That time is no longer open" };
    const sql = await getSql();
    const biz = await sql<{ verified: boolean }>`select verified from businesses where id = ${data.id} and open = true`;
    if (!biz[0]?.verified) return { ok: false as const, reason: "A manager has not verified this place" };
    const id = crypto.randomUUID();
    try {
      await sql`insert into bookings (id, business_id, user_id, starts_at, note, status)
        values (${id}, ${data.id}, ${context.userId}, ${data.startsAt}, ${data.note}, 'booked')`;
    } catch {
      return { ok: false as const, reason: "That time was just taken" };
    }
    return { ok: true as const, id };
  });

export const listAppointments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Appt[]> => {
    const sql = await getSql();
    const admin = await isAdmin(context.userId);
    const rows = await sql<{
      id: string;
      business_id: string;
      business_name: string;
      starts_at: string | Date;
      status: string;
      note: string;
      user_id: string;
      guest: string | null;
    }>`select b.id, b.business_id, biz.name as business_name, b.starts_at, b.status, b.note, b.user_id, u.name as guest
      from bookings b
      join businesses biz on biz.id = b.business_id
      left join "user" u on u.id = b.user_id
      where b.status in ('booked', 'checked_in')
        and b.starts_at > now() - interval '6 hours'
        and (
          b.user_id = ${context.userId}
          or biz.owner_id = ${context.userId}
          or ${admin} = true
        )
      order by b.starts_at asc
      limit 40`;
    return rows.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      businessName: row.business_name,
      startsAt: new Date(row.starts_at).toISOString(),
      status: row.status,
      note: row.note,
      guest: row.user_id === context.userId ? "You" : (row.guest ?? "Guest"),
      mine: row.user_id === context.userId,
    }));
  });

export const checkIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => String(id ?? "").slice(0, 80))
  .handler(async ({ context, data: id }) => {
    if (!id) return { ok: false as const, reason: "Missing appointment" };
    const sql = await getSql();
    const admin = await isAdmin(context.userId);
    const rows = await sql<{
      user_id: string;
      owner_id: string;
      status: string;
      starts_at: string | Date;
    }>`select b.user_id, biz.owner_id, b.status, b.starts_at
      from bookings b
      join businesses biz on biz.id = b.business_id
      where b.id = ${id}`;
    const row = rows[0];
    if (!row || row.status !== "booked") return { ok: false as const, reason: "Nothing to check in" };
    const allowed = row.user_id === context.userId || row.owner_id === context.userId || admin;
    if (!allowed) return { ok: false as const, reason: "You cannot check this person in" };
    const when = new Date(row.starts_at).getTime();
    const now = Date.now();
    if (now < when - 20 * 60 * 1000) return { ok: false as const, reason: "Check-in opens twenty minutes before" };
    if (now > when + 3 * 60 * 60 * 1000) return { ok: false as const, reason: "That appointment has passed" };
    await sql`update bookings set status = 'checked_in', checked_in_at = now() where id = ${id} and status = 'booked'`;
    return { ok: true as const };
  });

export const YARD_KINDS = ["pump", "canopy", "shop", "office", "wash", "gate"] as const;
export type YardKind = (typeof YARD_KINDS)[number];
export type YardPiece = { k: YardKind; x: number; y: number };

function readPieces(raw: string): YardPiece[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is YardPiece => {
        if (!item || typeof item !== "object") return false;
        const row = item as YardPiece;
        return YARD_KINDS.includes(row.k) && row.x >= 0 && row.x <= 5 && row.y >= 0 && row.y <= 3;
      })
      .slice(0, 16);
  } catch {
    return [];
  }
}

export const getYard = createServerFn({ method: "POST" })
  .validator((id: string) => bareId(id))
  .handler(async ({ data: id }) => {
    if (!id) return null;
    const sql = await getSql();
    const rows = await sql<{
      name: string;
      category: string;
      verified: boolean;
      owner_id: string;
      layout: string;
      fuel_price: number;
    }>`select name, category, verified, owner_id, layout, fuel_price from businesses where id = ${id} and open = true`;
    const row = rows[0];
    if (!row) return null;
    const price = Math.min(40, Math.max(8, Number(row.fuel_price) || 12));
    return {
      name: row.name,
      category: row.category,
      verified: Boolean(row.verified),
      ownerId: row.owner_id,
      pieces: readPieces(row.layout ?? "[]"),
      fuelPrice: price,
    };
  });

export const saveYard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; pieces: YardPiece[]; fuelPrice: number }) => {
    const id = bareId(input?.id);
    const pieces = readPieces(JSON.stringify(input?.pieces ?? []));
    const fuelPrice = Math.min(40, Math.max(8, Math.round(Number(input?.fuelPrice) || 12)));
    return { id, pieces, fuelPrice };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) return { ok: false as const, reason: "Missing place" };
    const sql = await getSql();
    const owned = await sql<{ id: string }>`select id from businesses where id = ${data.id} and owner_id = ${context.userId} and open = true`;
    if (!owned[0]) return { ok: false as const, reason: "Only the owner can design this place" };
    await sql`update businesses set layout = ${JSON.stringify(data.pieces)}, fuel_price = ${data.fuelPrice}, updated_at = now() where id = ${data.id}`;
    return { ok: true as const };
  });

export const buyFuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => bareId(id))
  .handler(async ({ context, data: id }) => {
    if (!id) return { ok: false as const, reason: "Missing station", price: 0 };
    const sql = await getSql();
    const rows = await sql<{ layout: string; fuel_price: number; name: string }>`
      select layout, fuel_price, name from businesses where id = ${id} and open = true and category = 'station'`;
    const row = rows[0];
    if (!row) return { ok: false as const, reason: "This is not a filling station", price: 0 };
    if (!readPieces(row.layout ?? "[]").some((piece) => piece.k === "pump")) {
      return { ok: false as const, reason: "The owner has not placed a pump", price: 0 };
    }
    const price = Math.min(40, Math.max(8, Number(row.fuel_price) || 12));
    await sql`insert into fuel_sales (id, business_id, user_id, vouchers) values (${crypto.randomUUID()}, ${id}, ${context.userId}, ${price})`;
    return { ok: true as const, price, name: row.name };
  });


