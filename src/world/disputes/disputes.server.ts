// NDU-34/35: dispute flow on the existing 0019 `disputes` table (no new migration).
// Subject = a property item id. Who may do what:
//   open      a viewer who is NOT the owner (group member), one live dispute per item
//   challenge the item owner answers an open dispute
//   settle    an admin closes a challenged dispute
import type { Sql } from "@/lib/db";
import { PropertyError, viewableItem } from "@/world/property.server";
import { challenge, openDispute, settle, type Dispute, type DisputeStatus } from "./logic";

type Row = { id: string; subject_id: string; status: DisputeStatus; opened_at: string | Date };
const toDispute = (r: Row): Dispute => ({
  id: r.id,
  subjectId: r.subject_id,
  status: r.status,
  openedAt: r.opened_at instanceof Date ? r.opened_at.toISOString() : String(r.opened_at),
});

export type DisputeView = { dispute: Dispute | null; canOpen: boolean; canChallenge: boolean; canSettle: boolean };

async function latest(sql: Sql, itemId: string): Promise<Dispute | null> {
  const rows = await sql<Row>`select * from disputes where subject_id = ${itemId} order by opened_at desc limit 1`;
  return rows[0] ? toDispute(rows[0]) : null;
}

export async function disputeView(sql: Sql, userId: string, itemId: unknown, isAdmin: boolean): Promise<DisputeView> {
  const item = await viewableItem(sql, userId, itemId);
  const d = await latest(sql, item.id);
  const live = d && d.status !== "settled";
  return {
    dispute: d,
    canOpen: !live && item.user_id !== userId,
    canChallenge: d?.status === "open" && item.user_id === userId,
    canSettle: d?.status === "challenged" && isAdmin,
  };
}

export async function disputeAct(
  sql: Sql,
  userId: string,
  itemId: unknown,
  action: "open" | "challenge" | "settle",
  isAdmin: boolean,
): Promise<DisputeView> {
  const item = await viewableItem(sql, userId, itemId);
  const run = async (tx: Sql) => {
    // Serialise actions on one item: lock the item row first.
    await tx`select id from property_items where id = ${item.id} for update`;
    const d = await latest(tx, item.id);
    try {
      if (action === "open") {
        if (item.user_id === userId) throw new PropertyError("You can't dispute your own record.", 403);
        if (d && d.status !== "settled") throw new PropertyError("This record already has an open dispute.", 409);
        const n = openDispute(item.id);
        await tx`insert into disputes (id, subject_id, status) values (${n.id}, ${n.subjectId}, 'open')`;
      } else if (action === "challenge") {
        if (item.user_id !== userId) throw new PropertyError("Only the owner can answer a dispute.", 403);
        if (!d) throw new PropertyError("There is no dispute to answer.", 404);
        const n = challenge(d);
        await tx`update disputes set status = ${n.status} where id = ${d.id}`;
      } else {
        if (!isAdmin) throw new PropertyError("Only an admin can settle a dispute.", 403);
        if (!d) throw new PropertyError("There is no dispute to settle.", 404);
        const n = settle(d);
        await tx`update disputes set status = ${n.status} where id = ${d.id}`;
      }
    } catch (err) {
      if (err instanceof PropertyError) throw err;
      throw new PropertyError(err instanceof Error ? err.message : "That dispute step isn't allowed.", 409);
    }
  };
  if (sql.transaction) await sql.transaction(run);
  else await run(sql);
  return disputeView(sql, userId, item.id, isAdmin);
}
