/**
 * NDU property records — SERVER-ONLY helpers (plan E4/E5/E7). Imported dynamically from server-fn
 * handlers and API routes only, never from client code (mirrors neura.ts / neura.server.ts).
 *
 * Posture (unchanged from neura.server.ts): Solana DEVNET only, and THE SERVER NEVER SIGNS.
 * Users sign a plain-text claim MESSAGE in their own wallet (no transaction, no gas). The on-chain
 * mint is a clearly-marked stub behind `PROPERTY_MINT_ENABLED` (off): it is blocked on the signing
 * decision (NDU-2). Nothing in this file generates, stores or uses a private key or seed phrase.
 *
 * Off-chain data: receipts/photos are encrypted at rest (envelope encryption, PROPERTY_KEK); salts,
 * labels and group names are wrapped with the same KEK; commitments follow D3 (src/lib/property/commit).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSql, type Sql } from "@/lib/db";
import { PROPERTY } from "@/config/neura";
import { commit, geoDigest, groupDigest, isHex64, newSalt, scanManifest, sha256Hex, type CommitKind } from "@/lib/property/commit";
import { contentId } from "@/lib/property/cid";
import { loadKek, openBlob, sealBlob, unwrap, unwrapText, wrap, wrapText, type Kek } from "@/lib/property/envelope.server";
import {
  ASSET_CLASSES,
  SCOPES,
  buildMetadata,
  claimBodyFrom,
  claimHash,
  claimMessage,
  validatePublicMetadata,
  PROPERTY_DISCLAIMER,
  PROPERTY_NETWORK,
  PROPERTY_SCHEMA,
  type AssetClass,
  type ClaimBody,
  type PublicMetadata,
  type Scope,
} from "@/lib/property/metadata";
import { EVIDENCE_MIMES, sniffMime, stripMetadata, type EvidenceMime } from "@/lib/property/strip.server";
import { scanRoot } from "@/world/scan-store.server";
import { dedupeMessage, forgetEvidence, forgetItem, ingestImage, IngestRejected } from "@/lib/ingest/ingest.server"; // NDU-AI safe-ingest
import { verifyMessageSignature } from "@/world/neura.server";

// ── config / feature flags ─────────────────────────────────────────────────

/** A message that is safe to show the user as-is. */
export class PropertyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PropertyConfig = {
  enabled: boolean;
  kek: Kek | null;
  /** Names (never values) of required server env vars that are missing. */
  missing: string[];
  mintFlag: boolean;
};

const warned = globalThis as typeof globalThis & { __ndu_property_warned__?: string };

export function propertyConfig(): PropertyConfig {
  const enabled = process.env.PROPERTY_ENABLED?.trim() === "true";
  const kek = loadKek();
  const missing: string[] = [];
  if (!kek) missing.push("PROPERTY_KEK (32 bytes, base64)");
  if (enabled && missing.length && warned.__ndu_property_warned__ !== missing.join()) {
    warned.__ndu_property_warned__ = missing.join();
    console.warn(`[property] PROPERTY_ENABLED is on but the feature stays off: missing server env ${missing.join(", ")}`);
  }
  return { enabled, kek, missing, mintFlag: mintFeatureFlag() };
}

/** Every property fn starts here. Off / unconfigured => refuse (AC: no property server fn answers). */
export function requireReady(): Kek {
  const cfg = propertyConfig();
  if (!cfg.enabled) throw new PropertyError("Property records are switched off on this server.", 404);
  if (!cfg.kek) throw new PropertyError("Property records aren't configured on this server yet.", 503);
  return cfg.kek;
}

// ── ⚠️ ON-CHAIN MINT: STUB, FLAG OFF ───────────────────────────────────────

/** Feature flag for the on-chain mint. OFF unless PROPERTY_MINT_ENABLED=true — and even then the stub refuses. */
export function mintFeatureFlag(): boolean {
  return process.env.PROPERTY_MINT_ENABLED?.trim() === "true";
}

/**
 * TODO(NDU-24/26/27/28/29) — STUB. On-chain minting is deliberately NOT implemented.
 *
 * BLOCKED ON A USER DECISION (NDU-2, docs/adr/0001-property-registry-signing.md):
 *   A) a devnet-only registry-authority keypair on the server signs Bubblegum V2 mints, or
 *   B) the user approves each mint in their own wallet from an admin queue (server never signs).
 * Until that decision is signed off, this build must not generate, hold, load or use ANY private
 * key, must not create a Umi/Metaplex signer and must not send any transaction. So this function
 * only ever throws; it has no RPC connection, no keypair path and no instruction building.
 */
export async function mintCompressedRecordStub(recordId: string): Promise<never> {
  void recordId;
  throw new PropertyError(
    "On-chain minting isn't built yet: it's waiting on the signing decision (NDU-2). Your claim is saved off-chain and nothing was sent to Solana.",
    501,
  );
}

// ── rate limits (NDU-17) ───────────────────────────────────────────────────

const LIMITS: Record<string, { perDay: number; label: string }> = {
  item: { perDay: 30, label: "new items" },
  evidence: { perDay: 60, label: "receipt and photo uploads" },
  claim: { perDay: 10, label: "claims" },
  group: { perDay: 5, label: "new groups" },
  invite: { perDay: 10, label: "invites" },
  join: { perDay: 20, label: "invite codes" },
};

export async function rateCheck(sql: Sql, userId: string, action: keyof typeof LIMITS): Promise<void> {
  const limit = LIMITS[action];
  const rows = await sql<{ n: number }>`select count(*)::int as n from property_rate_events
    where user_id = ${userId} and action = ${action} and at > now() - interval '1 day'`;
  if (Number(rows[0]?.n ?? 0) >= limit.perDay) {
    throw new PropertyError(`Daily limit reached for ${limit.label} (${limit.perDay} a day). Try again tomorrow.`, 429);
  }
  await sql`insert into property_rate_events (user_id, action) values (${userId}, ${action})`;
  if (Math.random() < 0.02) await sql`delete from property_rate_events where at < now() - interval '3 days'`;
}

// ── input helpers ───────────────────────────────────────────────────────────

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

export function cleanText(v: unknown, max: number): string {
  return [...String(v ?? "")]
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(0, max);
}

export function asAssetClass(v: unknown): AssetClass {
  if (!ASSET_CLASSES.includes(v as AssetClass)) throw new PropertyError("Pick household or equipment.");
  return v as AssetClass;
}

export function asScope(v: unknown): Scope {
  if (!SCOPES.includes(v as Scope)) throw new PropertyError("Pick Personal, Family or Community.");
  return v as Scope;
}

// ── consent (NDU-4) ─────────────────────────────────────────────────────────

export async function hasConsent(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`select count(*)::int as n from property_consents
    where user_id = ${userId} and copy_version = ${PROPERTY.consentVersion}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function requireConsent(sql: Sql, userId: string): Promise<void> {
  if (!(await hasConsent(sql, userId))) throw new PropertyError("Please read and accept the property-record notice first.", 412);
}

// ── groups (NDU-22, off-chain only) ─────────────────────────────────────────

export async function isMember(sql: Sql, userId: string, groupId: string | null): Promise<boolean> {
  if (!groupId) return false;
  const rows = await sql<{ n: number }>`select count(*)::int as n from property_group_members
    where group_id = ${groupId} and user_id = ${userId}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

export type GroupView = { id: string; kind: "family" | "community"; name: string; role: "head" | "member"; members: number };

export async function listGroups(sql: Sql, kek: Kek, userId: string): Promise<GroupView[]> {
  const rows = await sql<{ id: string; kind: "family" | "community"; name_enc: string; role: "head" | "member"; members: number }>`
    select g.id, g.kind, g.name_enc, m.role,
      (select count(*)::int from property_group_members x where x.group_id = g.id) as members
    from property_group_members m join property_groups g on g.id = m.group_id
    where m.user_id = ${userId} order by g.created_at`;
  return rows.map((r) => ({ id: r.id, kind: r.kind, role: r.role, members: Number(r.members), name: safeText(kek, r.name_enc, `group|${r.id}`) }));
}

function safeText(kek: Kek, wrapped: string, aad: string): string {
  try {
    return unwrapText(kek, wrapped, aad);
  } catch {
    return "(unreadable)";
  }
}

export async function createGroup(sql: Sql, kek: Kek, userId: string, kind: unknown, name: unknown): Promise<GroupView> {
  const k = kind === "family" || kind === "community" ? kind : null;
  if (!k) throw new PropertyError("A group is Family or Community.");
  const n = cleanText(name, 60);
  if (!n) throw new PropertyError("Give the group a name (only members see it).");
  await rateCheck(sql, userId, "group");
  const id = randomUUID();
  await sql`insert into property_groups (id, kind, name_enc, created_by) values (${id}, ${k}, ${wrapText(kek, n, `group|${id}`)}, ${userId})`;
  await sql`insert into property_group_members (group_id, user_id, role) values (${id}, ${userId}, 'head')`;
  return { id, kind: k, name: n, role: "head", members: 1 };
}

const tokenHash = (token: string) => createHash("sha256").update(`ndu.invite.v1|${token}`).digest("hex");

export async function createInvite(sql: Sql, userId: string, groupId: unknown): Promise<{ code: string; expiresAt: string }> {
  if (!isUuid(groupId) || !(await isMember(sql, userId, groupId))) throw new PropertyError("Unknown group.", 404);
  await rateCheck(sql, userId, "invite");
  const code = randomBytes(18).toString("base64url");
  const expires = new Date(Date.now() + PROPERTY.inviteHours * 3600_000);
  await sql`insert into property_group_invites (token_hash, group_id, created_by, expires_at)
    values (${tokenHash(code)}, ${groupId}, ${userId}, ${expires.toISOString()})`;
  return { code, expiresAt: expires.toISOString() };
}

export async function joinGroup(sql: Sql, kek: Kek, userId: string, code: unknown): Promise<GroupView> {
  const c = cleanText(code, 64);
  if (!/^[A-Za-z0-9_-]{20,32}$/.test(c)) throw new PropertyError("That invite code doesn't look right.");
  await rateCheck(sql, userId, "join");
  const rows = await sql<{ group_id: string }>`update property_group_invites set used_by = ${userId}, used_at = now()
    where token_hash = ${tokenHash(c)} and used_at is null and expires_at > now() returning group_id`;
  const groupId = rows[0]?.group_id;
  if (!groupId) throw new PropertyError("That invite is used, expired or unknown.", 404);
  await sql`insert into property_group_members (group_id, user_id, role) values (${groupId}, ${userId}, 'member') on conflict do nothing`;
  const mine = await listGroups(sql, kek, userId);
  const g = mine.find((x) => x.id === groupId);
  if (!g) throw new PropertyError("Could not join that group.");
  return g;
}

/** Leaving never moves or alters anyone's items; access ends on the next fetch. */
export async function leaveGroup(sql: Sql, userId: string, groupId: unknown): Promise<void> {
  if (!isUuid(groupId)) throw new PropertyError("Unknown group.", 404);
  await sql`delete from property_group_members where group_id = ${groupId} and user_id = ${userId}`;
}

// ── items (NDU-17/20) ───────────────────────────────────────────────────────

export type ItemRow = {
  id: string;
  user_id: string;
  scan_id: string | null;
  record_ref: string;
  asset_class: AssetClass;
  scope: Scope;
  group_id: string | null;
  label_enc: string;
  pin_x: number | null;
  pin_y: number | null;
  pin_z: number | null;
  claim_status: string;
  created_at: string | Date;
};

type EvidenceRow = {
  id: string;
  item_id: string;
  kind: "receipt" | "photo";
  mime: string;
  bytes: number | string;
  sha256: string;
  storage_key: string | null;
  dek_wrapped: string | null;
  created_at: string | Date;
  shredded_at: string | Date | null;
};

export type EvidenceView =
  | { state: "none" }
  | { state: "withdrawn"; at: string }
  | { state: "stored"; id: string; mime: string; bytes: number; sha256: string; at: string };

export type ItemView = {
  id: string;
  scanId: string | null;
  label: string;
  assetClass: AssetClass;
  scope: Scope;
  groupId: string | null;
  groupName: string | null;
  status: string;
  isOwner: boolean;
  receipt: EvidenceView;
  photo: EvidenceView;
  claimed: boolean;
  createdAt: string;
};

const iso = (v: string | Date) => new Date(v).toISOString();

export async function loadItem(sql: Sql, id: unknown): Promise<ItemRow | null> {
  if (!isUuid(id)) return null;
  const rows = await sql<ItemRow>`select * from property_items where id = ${id}`;
  return rows[0] ?? null;
}

/** Owner, or a member of the item's Family/Community group. Personal items are owner-only. */
export async function canView(sql: Sql, userId: string, item: ItemRow): Promise<boolean> {
  if (item.user_id === userId) return true;
  return item.scope !== "personal" && (await isMember(sql, userId, item.group_id));
}

/** Loads an item the caller may see; otherwise behaves exactly as if it didn't exist. */
export async function viewableItem(sql: Sql, userId: string, id: unknown): Promise<ItemRow> {
  const item = await loadItem(sql, id);
  if (!item || !(await canView(sql, userId, item))) throw new PropertyError("Unknown item.", 404);
  return item;
}

export async function ownedDraftItem(sql: Sql, userId: string, id: unknown): Promise<ItemRow> {
  const item = await loadItem(sql, id);
  if (!item || item.user_id !== userId) throw new PropertyError("Unknown item.", 404);
  if (item.claim_status !== "draft") throw new PropertyError("This item is claimed, so its details are locked.", 409);
  return item;
}

async function liveEvidence(sql: Sql, itemIds: string[]): Promise<EvidenceRow[]> {
  if (!itemIds.length) return [];
  return sql.query<EvidenceRow>(
    `select distinct on (item_id, kind) * from property_item_evidence where item_id = any($1::text[]) order by item_id, kind, created_at desc`,
    [itemIds],
  );
}

function evidenceView(rows: EvidenceRow[], itemId: string, kind: "receipt" | "photo"): EvidenceView {
  const r = rows.find((e) => e.item_id === itemId && e.kind === kind);
  if (!r) return { state: "none" };
  if (r.shredded_at || !r.storage_key) return { state: "withdrawn", at: iso(r.shredded_at ?? r.created_at) };
  return { state: "stored", id: r.id, mime: r.mime, bytes: Number(r.bytes), sha256: r.sha256, at: iso(r.created_at) };
}

export async function itemViews(sql: Sql, kek: Kek, userId: string, rows: ItemRow[]): Promise<ItemView[]> {
  const evidence = await liveEvidence(sql, rows.map((r) => r.id));
  const groups = new Map((await listGroups(sql, kek, userId)).map((g) => [g.id, g.name]));
  const claimed = new Set(
    rows.length
      ? (
          await sql.query<{ item_id: string }>(`select item_id from property_records where item_id = any($1::text[]) and status <> 'superseded'`, [
            rows.map((r) => r.id),
          ])
        ).map((r) => r.item_id)
      : [],
  );
  return rows.map((r) => ({
    id: r.id,
    scanId: r.user_id === userId ? r.scan_id : null,
    label: safeText(kek, r.label_enc, `label|${r.id}`),
    assetClass: r.asset_class,
    scope: r.scope,
    groupId: r.group_id,
    groupName: r.group_id ? (groups.get(r.group_id) ?? "a group you left") : null,
    status: r.claim_status,
    isOwner: r.user_id === userId,
    receipt: evidenceView(evidence, r.id, "receipt"),
    photo: evidenceView(evidence, r.id, "photo"),
    claimed: claimed.has(r.id),
    createdAt: iso(r.created_at),
  }));
}

async function ownedScan(sql: Sql, userId: string, scanId: unknown) {
  if (!isUuid(scanId)) throw new PropertyError("Unknown scan.", 404);
  const rows = await sql<{ id: string; format: string; bytes: number | string; sha256: string; storage_key: string; lng: number | null; lat: number | null }>`
    select id, format, bytes, sha256, storage_key, lng, lat from scan_assets where id = ${scanId} and user_id = ${userId}`;
  if (!rows[0]) throw new PropertyError("Unknown scan.", 404);
  return rows[0];
}

export async function listItemsForScan(sql: Sql, kek: Kek, userId: string, scanId: unknown): Promise<ItemView[]> {
  const scan = await ownedScan(sql, userId, scanId);
  const rows = await sql<ItemRow>`select * from property_items where scan_id = ${scan.id} and user_id = ${userId} order by created_at`;
  return itemViews(sql, kek, userId, rows);
}

/** Items shared with the caller through a Family/Community group (not their own). */
export async function listSharedItems(sql: Sql, kek: Kek, userId: string): Promise<ItemView[]> {
  const rows = await sql<ItemRow>`select i.* from property_items i
    join property_group_members m on m.group_id = i.group_id and m.user_id = ${userId}
    where i.scope <> 'personal' and i.user_id <> ${userId} order by i.created_at desc limit 50`;
  return itemViews(sql, kek, userId, rows);
}

async function checkScopeGroup(sql: Sql, userId: string, scope: Scope, groupId: unknown): Promise<string | null> {
  if (scope === "personal") return null;
  if (!isUuid(groupId) || !(await isMember(sql, userId, groupId))) throw new PropertyError("Pick one of your groups for a Family or Community item.");
  const rows = await sql<{ kind: string }>`select kind from property_groups where id = ${groupId}`;
  if (rows[0]?.kind !== scope) throw new PropertyError(`That group is not a ${scope} group.`);
  return groupId;
}

export async function addItem(
  sql: Sql,
  kek: Kek,
  userId: string,
  input: { scanId: unknown; label: unknown; assetClass: unknown; scope: unknown; groupId?: unknown },
): Promise<ItemView> {
  await requireConsent(sql, userId);
  const scan = await ownedScan(sql, userId, input.scanId);
  const label = cleanText(input.label, 80);
  if (!label) throw new PropertyError("Give the item a short private label (only you and your group see it).");
  const assetClass = asAssetClass(input.assetClass);
  const scope = asScope(input.scope);
  const groupId = await checkScopeGroup(sql, userId, scope, input.groupId);
  const count = await sql<{ n: number }>`select count(*)::int as n from property_items where scan_id = ${scan.id} and user_id = ${userId}`;
  if (Number(count[0]?.n ?? 0) >= PROPERTY.maxItemsPerScan) {
    throw new PropertyError(`A room can hold up to ${PROPERTY.maxItemsPerScan} items in this test.`, 409);
  }
  await rateCheck(sql, userId, "item");
  const id = randomUUID();
  const ref = randomBytes(8).toString("hex");
  await insertItemCapped(
    sql,
    { id, userId, scanId: scan.id, recordRef: ref, assetClass, scope, groupId, labelEnc: wrapText(kek, label, `label|${id}`) },
    PROPERTY.maxItemsPerScan,
  );
  const rows = await sql<ItemRow>`select * from property_items where id = ${id}`;
  return (await itemViews(sql, kek, userId, rows))[0];
}

/**
 * F1: the per-scan item cap, race-free. The early count in addItem is only a fast path; this re-counts
 * and inserts in ONE transaction holding a row lock on the scan, so parallel adds for the same room
 * queue behind each other and can never push it past `max` (READ COMMITTED: each statement after
 * the lock sees the rows the previous holder committed).
 */
export async function insertItemCapped(
  sql: Sql,
  row: { id: string; userId: string; scanId: string; recordRef: string; assetClass: string; scope: string; groupId: string | null; labelEnc: string },
  max: number,
): Promise<void> {
  const run = async (tx: Sql) => {
    await tx`select id from scan_assets where id = ${row.scanId} and user_id = ${row.userId} for update`;
    const count = await tx<{ n: number }>`select count(*)::int as n from property_items where scan_id = ${row.scanId} and user_id = ${row.userId}`;
    if (Number(count[0]?.n ?? 0) >= max) throw new PropertyError(`A room can hold up to ${max} items in this test.`, 409);
    await tx`insert into property_items (id, user_id, scan_id, record_ref, asset_class, scope, group_id, label_enc)
      values (${row.id}, ${row.userId}, ${row.scanId}, ${row.recordRef}, ${row.assetClass}, ${row.scope}, ${row.groupId}, ${row.labelEnc})`;
  };
  if (sql.transaction) await sql.transaction(run);
  else await run(sql); // stub Sql without transactions (tests only): no lock, same checks
}

export async function updateItem(
  sql: Sql,
  kek: Kek,
  userId: string,
  input: { id: unknown; label?: unknown; assetClass?: unknown; scope?: unknown; groupId?: unknown },
): Promise<ItemView> {
  const item = await ownedDraftItem(sql, userId, input.id);
  const label = input.label === undefined ? null : cleanText(input.label, 80);
  if (label === "") throw new PropertyError("The label can't be empty.");
  const assetClass = input.assetClass === undefined ? item.asset_class : asAssetClass(input.assetClass);
  const scope = input.scope === undefined ? item.scope : asScope(input.scope);
  const groupId = input.scope === undefined && input.groupId === undefined ? item.group_id : await checkScopeGroup(sql, userId, scope, input.groupId);
  await sql`update property_items set asset_class = ${assetClass}, scope = ${scope}, group_id = ${groupId},
    label_enc = ${label === null ? item.label_enc : wrapText(kek, label, `label|${item.id}`)}, updated_at = now()
    where id = ${item.id} and user_id = ${userId}`;
  if (scope === "personal") await sql`delete from property_item_commitments where item_id = ${item.id} and kind = 'group'`;
  const rows = await sql<ItemRow>`select * from property_items where id = ${item.id}`;
  return (await itemViews(sql, kek, userId, rows))[0];
}

/** Delete = crypto-shred: ciphertext files, wrapped DEKs, salts, label and the off-chain record go. */
export async function deleteItem(sql: Sql, userId: string, id: unknown): Promise<void> {
  const item = await loadItem(sql, id);
  if (!item || item.user_id !== userId) throw new PropertyError("Unknown item.", 404);
  const ev = await sql<{ storage_key: string | null }>`select storage_key from property_item_evidence where item_id = ${item.id}`;
  for (const e of ev) if (e.storage_key) await rm(evidencePath(e.storage_key), { force: true });
  await sql`delete from property_items where id = ${item.id} and user_id = ${userId}`;
  await forgetItem(evidenceRoot(), item.id).catch(() => undefined); // NDU-AI safe-ingest: drop its pHashes
}

// ── evidence: strip, hash, commit, encrypt, store (NDU-19/21) ────────────────

export function evidenceRoot(): string {
  return process.env.PROPERTY_EVIDENCE_DIR?.trim() || path.resolve(process.cwd(), "..", ".citydesk-evidence");
}

function evidencePath(key: string): string {
  if (!/^[0-9a-f-]{36}\.bin$/.test(key)) throw new Error("bad evidence key");
  return path.join(evidenceRoot(), key);
}

async function upsertCommitment(sql: Sql, kek: Kek, itemId: string, kind: CommitKind, digest: string, sourceRef: string | null, salt?: Uint8Array) {
  const s = salt ?? newSalt();
  const commitment = await commit(kind, s, digest);
  const saltWrapped = wrap(kek, s, `salt|${itemId}|${kind}`);
  await sql`insert into property_item_commitments (item_id, kind, salt_wrapped, commitment, source_ref)
    values (${itemId}, ${kind}, ${saltWrapped}, ${commitment}, ${sourceRef})
    on conflict (item_id, kind) do update set salt_wrapped = excluded.salt_wrapped, commitment = excluded.commitment,
      source_ref = excluded.source_ref, created_at = now()`;
  return commitment;
}

type CommitRow = { kind: CommitKind; salt_wrapped: string | null; commitment: string; source_ref: string | null };

async function commitments(sql: Sql, itemId: string): Promise<Map<CommitKind, CommitRow>> {
  const rows = await sql<CommitRow>`select kind, salt_wrapped, commitment, source_ref from property_item_commitments where item_id = ${itemId}`;
  return new Map(rows.map((r) => [r.kind, r]));
}

/** Keep the salt if there is one (so re-preparing a claim is stable); recompute if the input changed. */
async function ensureCommitment(sql: Sql, kek: Kek, itemId: string, kind: CommitKind, digest: string, sourceRef: string | null): Promise<string> {
  const have = (await commitments(sql, itemId)).get(kind);
  if (have?.salt_wrapped) {
    const salt = unwrap(kek, have.salt_wrapped, `salt|${itemId}|${kind}`);
    const c = await commit(kind, salt, digest);
    if (c === have.commitment && have.source_ref === sourceRef) return c;
    return upsertCommitment(sql, kek, itemId, kind, digest, sourceRef, salt);
  }
  return upsertCommitment(sql, kek, itemId, kind, digest, sourceRef);
}

async function shredKind(sql: Sql, itemId: string, kind: "receipt" | "photo") {
  const old = await sql<{ id: string; storage_key: string | null }>`select id, storage_key from property_item_evidence
    where item_id = ${itemId} and kind = ${kind} and shredded_at is null`;
  for (const o of old) if (o.storage_key) await rm(evidencePath(o.storage_key), { force: true });
  await forgetEvidence(evidenceRoot(), old.map((o) => o.id)).catch(() => undefined); // NDU-AI safe-ingest
  await sql`update property_item_evidence set storage_key = null, dek_wrapped = null, shredded_at = now()
    where item_id = ${itemId} and kind = ${kind} and shredded_at is null`;
  await sql`update property_item_commitments set salt_wrapped = null where item_id = ${itemId} and kind = ${kind}`;
}

export async function storeEvidence(
  sql: Sql,
  kek: Kek,
  userId: string,
  itemId: unknown,
  kind: unknown,
  raw: Buffer,
): Promise<{ id: string; kind: "receipt" | "photo"; mime: EvidenceMime; bytes: number; sha256: string; review?: { removed: string[]; notice: string | null } }> {
  await requireConsent(sql, userId);
  if (kind !== "receipt" && kind !== "photo") throw new PropertyError("Evidence is a receipt or a photo.");
  const item = await ownedDraftItem(sql, userId, itemId);
  const mime = sniffMime(raw);
  if (mime && !EVIDENCE_MIMES.includes(mime)) throw new PropertyError("Unsupported file type.", 415);
  if (!mime) throw new PropertyError("Use a JPG or PNG photo, or a PDF/JPG/PNG receipt.", 415);
  if (kind === "photo" && mime === "application/pdf") throw new PropertyError("The item photo must be a JPG or PNG.", 415);
  await rateCheck(sql, userId, "evidence");
  let clean: Buffer;
  try {
    clean = stripMetadata(mime, raw);
  } catch (err) {
    throw new PropertyError(err instanceof Error ? err.message : "That file looks damaged.", 415);
  }
  // NDU-AI safe-ingest #1/#2: deep strip (MPF/trailing images too), pHash dedupe, optional server NSFW.
  let ingest: Awaited<ReturnType<typeof ingestImage>>;
  try {
    ingest = await ingestImage({ bytes: clean, userId, itemId: item.id, dir: evidenceRoot() });
  } catch (err) {
    if (err instanceof IngestRejected) throw new PropertyError(err.message, err.status);
    throw err;
  }
  clean = ingest.bytes;
  // NDU-AI safe-ingest end
  const digest = await sha256Hex(clean);
  const id = randomUUID();
  const key = `${id}.bin`;
  const { sealed, dekWrapped } = sealBlob(kek, clean, `${item.id}|${kind}|${id}`);
  await mkdir(evidenceRoot(), { recursive: true, mode: 0o700 });
  const tmp = path.join(evidenceRoot(), `.${id}.part`);
  await writeFile(tmp, sealed, { mode: 0o600 });
  await rename(tmp, evidencePath(key));
  await chmod(evidencePath(key), 0o600).catch(() => undefined);
  try {
    await shredKind(sql, item.id, kind);
    await sql`insert into property_item_evidence (id, item_id, user_id, kind, mime, bytes, sha256, storage_key, dek_wrapped)
      values (${id}, ${item.id}, ${userId}, ${kind}, ${mime}, ${clean.length}, ${digest}, ${key}, ${dekWrapped})`;
    await upsertCommitment(sql, kek, item.id, kind, digest, id);
  } catch (err) {
    await rm(evidencePath(key), { force: true });
    throw err;
  }
  await ingest.remember(id).catch((err) => console.warn("[ingest] pHash index write failed:", err instanceof Error ? err.message : err)); // NDU-AI safe-ingest
  return { id, kind, mime, bytes: clean.length, sha256: digest, review: { removed: ingest.review.removed, notice: dedupeMessage(ingest.review.dedupe) } };
}

export async function shredEvidence(sql: Sql, userId: string, itemId: unknown, kind: unknown): Promise<void> {
  if (kind !== "receipt" && kind !== "photo") throw new PropertyError("Evidence is a receipt or a photo.");
  const item = await loadItem(sql, itemId);
  if (!item || item.user_id !== userId) throw new PropertyError("Unknown item.", 404);
  await shredKind(sql, item.id, kind);
}

/** Decrypted evidence bytes for an authorized viewer (owner or group member). */
export async function readEvidence(sql: Sql, kek: Kek, userId: string, evidenceId: unknown): Promise<{ bytes: Buffer; mime: string }> {
  if (!isUuid(evidenceId)) throw new PropertyError("Not found", 404);
  const rows = await sql<EvidenceRow>`select * from property_item_evidence where id = ${evidenceId}`;
  const ev = rows[0];
  if (!ev || !ev.storage_key || !ev.dek_wrapped) throw new PropertyError("Not found", 404);
  await viewableItem(sql, userId, ev.item_id);
  const sealed = await readFile(evidencePath(ev.storage_key));
  return { bytes: openBlob(kek, sealed, ev.dek_wrapped, `${ev.item_id}|${ev.kind}|${ev.id}`), mime: ev.mime };
}

// ── claim: prepare → user signs MESSAGE → submit (NDU-26, minus the mint) ─────

async function linkedWallet(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{ address: string }>`select address from wallet_links where user_id = ${userId} and chain = 'solana' and cluster = 'devnet'`;
  return rows[0]?.address ?? null;
}

async function claimBody(sql: Sql, kek: Kek, userId: string, item: ItemRow, issuedAt: string): Promise<ClaimBody> {
  const wallet = await linkedWallet(sql, userId);
  if (!wallet) throw new PropertyError("Link a devnet wallet first (More → Wallet). Claims are signed by your own wallet.", 412);
  if (!item.scan_id) throw new PropertyError("This item's room scan was deleted.", 409);
  const scan = await ownedScan(sql, userId, item.scan_id);
  if (scan.lng === null || scan.lat === null) throw new PropertyError("Place the room scan on the map first.", 409);
  const have = await commitments(sql, item.id);
  const ev = await liveEvidence(sql, [item.id]);
  for (const kind of ["receipt", "photo"] as const) {
    const v = evidenceView(ev, item.id, kind);
    if (v.state !== "stored" || !have.get(kind)?.salt_wrapped) throw new PropertyError(`Add the item's ${kind} first.`, 409);
  }
  const manifest = await scanManifest([{ role: "model", format: scan.format, bytes: Number(scan.bytes), sha256: scan.sha256 }]);
  const scanC = await ensureCommitment(sql, kek, item.id, "scan", manifest.digest, scan.id);
  const geoC = await ensureCommitment(sql, kek, item.id, "geo", await geoDigest(scan.lat, scan.lng), scan.id);
  const groupC = item.scope === "personal" || !item.group_id ? null : await ensureCommitment(sql, kek, item.id, "group", await groupDigest(item.group_id), item.group_id);
  return {
    schema: PROPERTY_SCHEMA,
    network: PROPERTY_NETWORK,
    record_ref: item.record_ref,
    asset_class: item.asset_class,
    scope: item.scope,
    owner_group_commitment: groupC,
    geo_commitment: geoC,
    scan_commitment: scanC,
    receipt_commitment: have.get("receipt")!.commitment,
    photo_commitment: have.get("photo")!.commitment,
    claimant: wallet,
    issued_at: issuedAt,
  };
}

export async function prepareClaim(sql: Sql, kek: Kek, userId: string, itemId: unknown) {
  const item = await ownedDraftItem(sql, userId, itemId);
  const issuedAt = new Date().toISOString();
  const body = await claimBody(sql, kek, userId, item, issuedAt);
  const hash = await claimHash(body);
  return { itemId: item.id, issuedAt, claimHash: hash, claimant: body.claimant, message: claimMessage(hash) };
}

export async function submitClaim(sql: Sql, kek: Kek, userId: string, input: { itemId: unknown; issuedAt: unknown; signature: unknown }) {
  const item = await ownedDraftItem(sql, userId, input.itemId);
  const issuedAt = String(input.issuedAt ?? "");
  const t = Date.parse(issuedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(issuedAt) || !Number.isFinite(t) || Date.now() - t > 15 * 60_000 || t - Date.now() > 60_000) {
    throw new PropertyError("That claim expired. Prepare it again.", 409);
  }
  const signature = cleanText(input.signature, 120);
  const body = await claimBody(sql, kek, userId, item, issuedAt);
  const hash = await claimHash(body);
  const message = claimMessage(hash);
  if (!verifyMessageSignature(message, signature, body.claimant)) {
    throw new PropertyError("The signature doesn't match your linked wallet, or the room changed since you signed. Prepare and sign again.", 400);
  }
  await rateCheck(sql, userId, "claim");
  const { json, hash: metaHash } = await buildMetadata(body, signature);
  const id = randomUUID();
  await sql`insert into property_records (id, item_id, user_id, cluster, claim_hash, claim_message, claimant_address, claimant_sig,
      metadata_json, metadata_json_hash, uri, status)
    values (${id}, ${item.id}, ${userId}, 'devnet', ${hash}, ${message}, ${body.claimant}, ${signature},
      ${json}, ${metaHash}, ${`/api/property/meta/${metaHash}.json`}, 'awaiting_mint')`;
  await sql`update property_items set claim_status = 'claimed_offchain', updated_at = now() where id = ${item.id}`;

  // ⚠️ The on-chain step. Flag OFF by default; the stub refuses even when the flag is on.
  // NDU devnet: the server never signs. With the flag on, the owner anchors from their own wallet.
  const mintNote = mintFeatureFlag()
    ? "Saved off-chain. Open the verification card to anchor it on Solana devnet from your wallet."
    : "Saved off-chain. On-chain anchoring is switched off on this server, so nothing was sent to Solana.";
  return { recordId: id, metadataHash: metaHash, status: "awaiting_mint" as const, mintNote };
}

// ── verification card (NDU-30) ──────────────────────────────────────────────

export type CheckStatus = "pass" | "fail" | "unavailable" | "withdrawn";
export type VerifyCheck = { n: number; key: string; title: string; status: CheckStatus; detail: string; proves: string; doesNotProve: string };

type RecordRow = {
  id: string;
  claim_hash: string;
  claim_message: string;
  claimant_address: string;
  claimant_sig: string;
  metadata_json: string;
  metadata_json_hash: string;
  uri: string;
  asset_id: string | null;
  mint_sig: string | null;
  status: string;
  created_at: string | Date;
};

async function fileSha256(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest("hex");
}

export type VerificationCard = {
  item: ItemView;
  record: null | {
    status: string;
    claimant: string;
    metadataHash: string;
    contentId: string | null;
    uri: string;
    claimedAt: string;
    assetId: string | null;
    mintSig: string | null;
  };
  commitments: { kind: CommitKind; commitment: string }[];
  checks: VerifyCheck[];
  mintEnabled: boolean;
  disclaimer: string;
  checkedAt: string;
};

export async function verifyItem(sql: Sql, kek: Kek, userId: string, itemId: unknown): Promise<VerificationCard> {
  const item = await viewableItem(sql, userId, itemId);
  const [view] = await itemViews(sql, kek, userId, [item]);
  const recs = await sql<RecordRow>`select * from property_records where item_id = ${item.id} and status <> 'superseded' order by created_at desc limit 1`;
  const rec = recs[0] ?? null;
  const have = await commitments(sql, item.id);
  let meta: PublicMetadata | null = null;
  if (rec) {
    try {
      meta = JSON.parse(rec.metadata_json) as PublicMetadata;
    } catch {
      meta = null;
    }
  }
  /** Commitments are compared against the signed metadata when a claim exists, else the stored set. */
  const expected = (kind: CommitKind): string | null => {
    if (meta) {
      const m = meta as unknown as Record<string, unknown>;
      const v = kind === "group" ? m.owner_group_commitment : m[`${kind}_commitment`];
      return isHex64(v) ? v : null;
    }
    return have.get(kind)?.commitment ?? null;
  };
  let receiptCid: string | null = null;
  const checks: VerifyCheck[] = [];

  // 1 — on-chain record (NDU devnet anchor: user-signed memo of the metadata hash)
  let anchorStatus = rec?.status ?? "";
  if (rec?.mint_sig) {
    const a = await import("./property-anchor.server");
    anchorStatus = await a.confirmAnchor(sql, rec);
  }
  const anchored = Boolean(rec?.mint_sig) && (anchorStatus === "confirmed" || anchorStatus === "finalized");
  checks.push({
    n: 1,
    key: "onchain",
    title: "Record anchored on Solana devnet",
    status: anchored ? "pass" : rec?.mint_sig && anchorStatus === "failed" ? "fail" : "unavailable",
    detail: !rec
      ? "Not claimed yet, so there is nothing on-chain."
      : rec.mint_sig
        ? anchored
          ? `Anchored on devnet in transaction ${rec.mint_sig.slice(0, 10)}… (memo carries the metadata hash).`
          : anchorStatus === "failed"
            ? "The devnet transaction failed. You can anchor it again."
            : "Sent to devnet, waiting for confirmation."
        : mintFeatureFlag()
          ? "Claimed off-chain. The owner can anchor it on devnet from their own wallet."
          : "Not anchored: on-chain anchoring is switched off on this server.",
    proves: "That this exact metadata hash was signed by the claimant's wallet and recorded on devnet.",
    doesNotProve: "That the claim is true, or anything about legal ownership. Devnet is a test network.",
  });

  // 2 — content-addressed metadata hash
  if (!rec) {
    checks.push({ n: 2, key: "uri", title: "Metadata matches its content hash", status: "unavailable", detail: "Not claimed yet.", proves: "", doesNotProve: "" });
  } else {
    const h = await sha256Hex(new TextEncoder().encode(rec.metadata_json));
    const problems = meta ? validatePublicMetadata(meta) : ["unreadable"];
    const ok = h === rec.metadata_json_hash && rec.uri.endsWith(`${h}.json`) && problems.length === 0;
    if (ok) receiptCid = await contentId(new TextEncoder().encode(rec.metadata_json));
    checks.push({
      n: 2,
      key: "uri",
      title: "Metadata matches its content hash",
      status: ok ? "pass" : "fail",
      detail: ok
        ? `The stored public metadata re-hashes to the hash in its address and passes the privacy allow-list. Content id ${receiptCid}. It is not pinned, and it is not on Arweave.`
        : `Mismatch or disallowed content${problems.length ? `: ${problems[0]}` : ""}.`,
      proves: "The public record wasn't edited after it was written.",
      doesNotProve: "That the record is on-chain (see check 1).",
    });
  }

  // 3 — claimant signature
  if (!rec || !meta) {
    checks.push({ n: 3, key: "sig", title: "Claimant's wallet signed this claim", status: "unavailable", detail: "Not claimed yet.", proves: "", doesNotProve: "" });
  } else {
    const body = claimBodyFrom(meta);
    const h = await claimHash(body);
    const ok = h === meta.claim.claim_sha256 && h === rec.claim_hash && verifyMessageSignature(claimMessage(h), meta.claimant_sig, meta.claim.claimant);
    checks.push({
      n: 3,
      key: "sig",
      title: "Claimant's wallet signed this claim",
      status: ok ? "pass" : "fail",
      detail: ok ? `Valid ed25519 signature by ${meta.claim.claimant} over claim ${h.slice(0, 12)}…` : "The signature does not verify against the claim.",
      proves: "That whoever controls this wallet made this exact claim at this time.",
      doesNotProve: "Who that person is in real life, or that they own the item.",
    });
  }

  // 4, 5 — receipt and photo re-hash
  const evRows = await liveEvidence(sql, [item.id]);
  for (const [n, kind] of [
    [4, "receipt"],
    [5, "photo"],
  ] as const) {
    const title = kind === "receipt" ? "Stored receipt matches its commitment" : "Stored photo matches its commitment";
    const ev = evRows.find((e) => e.kind === kind);
    const exp = expected(kind);
    const salt = have.get(kind)?.salt_wrapped;
    const base = {
      n,
      key: kind,
      title,
      proves: `That the ${kind} on file is byte-for-byte the one committed to${rec ? " in the signed claim" : ""}.`,
      doesNotProve: kind === "receipt" ? "That the receipt is genuine, or that it is for this item." : "That the photo shows this exact item, or when it was taken.",
    };
    if (!ev) {
      checks.push({ ...base, status: "unavailable", detail: `No ${kind} added yet.` });
      continue;
    }
    if (ev.shredded_at || !ev.storage_key || !ev.dek_wrapped || !salt) {
      checks.push({ ...base, status: "withdrawn", detail: "Evidence withdrawn by owner." });
      continue;
    }
    try {
      const sealed = await readFile(evidencePath(ev.storage_key));
      const plain = openBlob(kek, sealed, ev.dek_wrapped, `${item.id}|${kind}|${ev.id}`);
      const digest = await sha256Hex(plain);
      const c = await commit(kind, unwrap(kek, salt, `salt|${item.id}|${kind}`), digest);
      const ok = digest === ev.sha256 && exp !== null && c === exp;
      checks.push({
        ...base,
        status: ok ? "pass" : "fail",
        detail: ok
          ? `Decrypted ${kind} re-hashes to ${digest.slice(0, 12)}… and to commitment ${c.slice(0, 12)}…`
          : digest !== ev.sha256
            ? `The stored ${kind} has changed since upload.`
            : `The ${kind} doesn't match the ${rec ? "signed" : "stored"} commitment.`,
      });
    } catch {
      checks.push({ ...base, status: "fail", detail: `The stored ${kind} could not be decrypted or read (tampered or missing).` });
    }
  }

  // 6 — scan manifest
  {
    const base = {
      n: 6,
      key: "scan",
      title: "Room scan matches its commitment",
      proves: "That the 3D scan on file is the one committed to in the claim.",
      doesNotProve: "That the scan shows a real place, or where it is (placement is a separate, building-level commitment).",
    };
    const exp = expected("scan");
    const salt = have.get("scan")?.salt_wrapped;
    const scanRows = item.scan_id
      ? await sql<{ format: string; bytes: number | string; sha256: string; storage_key: string }>`
          select format, bytes, sha256, storage_key from scan_assets where id = ${item.scan_id}`
      : [];
    const scan = scanRows[0];
    if (!scan) checks.push({ ...base, status: "withdrawn", detail: "The room scan was deleted by its owner." });
    else {
      let digest = "";
      try {
        digest = await fileSha256(path.join(scanRoot(), scan.storage_key));
      } catch {
        digest = "";
      }
      if (!digest) checks.push({ ...base, status: "fail", detail: "The scan file is missing on the server." });
      else if (digest !== scan.sha256) checks.push({ ...base, status: "fail", detail: "The scan file has changed since upload." });
      else if (!exp || !salt) checks.push({ ...base, status: "unavailable", detail: "Scan file is intact (matches its upload hash). Its commitment is made when you claim the item." });
      else {
        const manifest = await scanManifest([{ role: "model", format: scan.format, bytes: Number(scan.bytes), sha256: digest }]);
        const c = await commit("scan", unwrap(kek, salt, `salt|${item.id}|scan`), manifest.digest);
        checks.push({
          ...base,
          status: c === exp ? "pass" : "fail",
          detail: c === exp ? `Scan file re-hashes into commitment ${c.slice(0, 12)}…` : "The scan doesn't match the committed manifest.",
        });
      }
    }
  }

  // 7 — non-transferable
  checks.push({
    n: 7,
    key: "nontransferable",
    title: "Record is non-transferable",
    status: "unavailable",
    detail: "Needs an on-chain asset (frozen MPL-Core collection). Not minted yet.",
    proves: "That the record can't be sold or moved to another wallet.",
    doesNotProve: "Anything about the physical item.",
  });

  // 8 — disputes
  checks.push({
    n: 8,
    key: "dispute",
    title: "No open dispute",
    status: item.claim_status === "disputed" ? "fail" : "unavailable",
    detail:
      item.claim_status === "disputed"
        ? "This record is disputed."
        : "The challenge / dispute process isn't built yet (NDU-32+), so nobody has been able to challenge this record.",
    proves: "That nobody with access has formally challenged the claim.",
    doesNotProve: "That nobody else believes they own it.",
  });

  return {
    item: view,
    record: rec
      ? {
          status: rec.status,
          claimant: rec.claimant_address,
          metadataHash: rec.metadata_json_hash,
          contentId: receiptCid,
          uri: rec.uri,
          claimedAt: iso(rec.created_at),
          assetId: rec.asset_id,
          mintSig: rec.mint_sig,
        }
      : null,
    commitments: [...have.values()].map((c) => ({ kind: c.kind, commitment: c.commitment })),
    checks,
    mintEnabled: mintFeatureFlag(),
    disclaimer: PROPERTY_DISCLAIMER,
    checkedAt: new Date().toISOString(),
  };
}

/** Public-metadata bytes by content hash (only for viewers of the item while minting is off). */
export async function readMetadata(sql: Sql, userId: string, hash: string): Promise<string> {
  const h = hash.replace(/\.json$/, "");
  if (!isHex64(h)) throw new PropertyError("Not found", 404);
  const rows = await sql<{ item_id: string; metadata_json: string }>`select item_id, metadata_json from property_records where metadata_json_hash = ${h}`;
  const row = rows[0];
  if (!row) throw new PropertyError("Not found", 404);
  await viewableItem(sql, userId, row.item_id);
  if ((await sha256Hex(new TextEncoder().encode(row.metadata_json))) !== h) throw new PropertyError("Not found", 404);
  return row.metadata_json;
}
