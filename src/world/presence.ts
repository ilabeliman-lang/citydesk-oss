import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { sanitizePresence, type PublicPresence } from "./presencePublic";
import { PresenceHeartbeat } from "./net/presenceHeartbeat";

export { sanitizePresence, type PublicPresence };

export type Mine = {
  displayName: string;
  avatar: string;
  lat: number | null;
  lng: number | null;
  visible: boolean;
};

export type Neighbor = {
  id: string;
  displayName: string;
  avatar: string;
  lat: number;
  lng: number;
};

type SaveInput = {
  displayName: string;
  avatar: string;
  lat: number | null;
  lng: number | null;
  visible: boolean;
};

function snap(n: number): number {
  return Math.round(n / 0.002) * 0.002;
}

function coord(n: unknown, min: number, max: number): number | null {
  if (n === null || n === undefined || n === "") return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

export const getMine = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Mine | null> => {
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      avatar: string;
      lat: number | null;
      lng: number | null;
      visible: boolean;
    }>`select display_name, avatar, lat, lng, visible from presence where user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) return null;
    return {
      displayName: row.display_name,
      avatar: row.avatar,
      lat: row.lat,
      lng: row.lng,
      visible: row.visible,
    };
  });

const savePresenceRow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SaveInput): SaveInput => {
    const displayName = String(input?.displayName ?? "")
      .trim()
      .slice(0, 32);
    let avatar = String(input?.avatar ?? "");
    if (!avatar.startsWith("data:image/jpeg;base64,") || avatar.length > 100_000) avatar = "";
    const lat = coord(input?.lat, -90, 90);
    const lng = coord(input?.lng, -180, 180);
    return { displayName, avatar, lat, lng, visible: Boolean(input?.visible) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const shareLat = data.visible && data.lat !== null ? snap(data.lat) : null;
    const shareLng = data.visible && data.lng !== null ? snap(data.lng) : null;
    await sql`insert into presence (user_id, display_name, avatar, lat, lng, share_lat, share_lng, visible, updated_at)
      values (${context.userId}, ${data.displayName}, ${data.avatar}, ${data.lat}, ${data.lng}, ${shareLat}, ${shareLng}, ${data.visible}, now())
      on conflict (user_id) do update set
        display_name = excluded.display_name,
        avatar = excluded.avatar,
        lat = excluded.lat,
        lng = excluded.lng,
        share_lat = excluded.share_lat,
        share_lng = excluded.share_lng,
        visible = excluded.visible,
        updated_at = now()`;
    return { ok: true as const };
  });

export const listNearby = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { lat: number; lng: number }) => {
    const lat = coord(input?.lat, -90, 90);
    const lng = coord(input?.lng, -180, 180);
    if (lat === null || lng === null) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ context, data }): Promise<Neighbor[]> => {
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      display_name: string;
      avatar: string;
      share_lat: number;
      share_lng: number;
    }>`select user_id, display_name, avatar, share_lat, share_lng
      from presence
      where visible = true
        and user_id <> ${context.userId}
        and share_lat is not null
        and share_lng is not null
        and updated_at > now() - interval '20 minutes'
        and abs(share_lat - ${data.lat}) < 0.03
        and abs(share_lng - ${data.lng}) < 0.03
      order by updated_at desc
      limit 40`;
    return rows.map((row) => {
      // NDU-UPG 903: never copy an exact home or scan point. The share grid (~200m) is the public spot.
      const safe = sanitizePresence({
        id: row.user_id,
        displayName: row.display_name || "Neighbor",
        avatar: row.avatar,
      });
      return {
        id: safe.id,
        displayName: safe.displayName || "Neighbor",
        avatar: safe.avatar,
        lat: row.share_lat,
        lng: row.share_lng,
      };
    });
  });

// upg-u-069 — presence heartbeat debounce. The map saves on every state
// change (name, avatar, visible, spot, GPS), which can burst far faster than
// one write per user per 2 seconds. Coalesce those into at most one save per
// user per 2 seconds: leading edge sends now, the latest state in the window
// flushes on the trailing edge so the final state still lands.
const presenceHeartbeat = new PresenceHeartbeat({
  send: (data: SaveInput) => savePresenceRow({ data }),
});

// One browser session is one signed-in user, so the default key is per
// session; callers that know the user id pass it to key the window per user.
const SELF_USER_KEY = "self";

/** Coalesced savePresence: same call shape, at most one heartbeat per 2s. */
export function savePresence(options: { data: SaveInput; userId?: string }) {
  return presenceHeartbeat.push(options.userId ?? SELF_USER_KEY, options.data);
}
