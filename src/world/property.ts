/**
 * NDU property records — server functions (plan NDU-17). Every fn: authMiddleware + scoped by the
 * verified `context.userId`; the server-only module is imported inside handlers only.
 * Devnet only. The server never signs: claims are signed as a plain MESSAGE in the user's own wallet,
 * and the on-chain mint is a stub behind an OFF flag (blocked on the signing decision, NDU-2).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { PROPERTY } from "@/config/neura";
import { getBearerToken } from "@/lib/auth/client";
import { shredPlan } from "@/world/property-ui/shred";
import { createGroup as openGroup } from "@/world/groups/sheet";

export type {
  CheckStatus,
  EvidenceView,
  GroupView,
  ItemView,
  VerificationCard,
  VerifyCheck,
} from "@/world/property.server";

const srv = () => import("./property.server");

/** Turn server-side PropertyErrors into plain Errors with a safe message; hide anything else. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const s = await srv();
    if (err instanceof s.PropertyError) throw new Error(err.message);
    console.error("[property] unexpected error:", err instanceof Error ? err.message : err);
    throw new Error("Something went wrong with property records. Please try again.");
  }
}

export type PropertyStatus = {
  enabled: boolean;
  ready: boolean;
  /** Names of missing server env vars (shown to admins only in logs; here just a flag). */
  configured: boolean;
  mintEnabled: false;
  consented: boolean;
  consentVersion: string;
  walletLinked: boolean;
};

/** Is the feature on, configured, and has the caller accepted the notice? Never throws when off. */
export const getPropertyStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PropertyStatus> => {
    const s = await srv();
    const cfg = s.propertyConfig();
    const base: PropertyStatus = {
      enabled: cfg.enabled,
      ready: cfg.enabled && !!cfg.kek,
      configured: !!cfg.kek,
      mintEnabled: false,
      consented: false,
      consentVersion: PROPERTY.consentVersion,
      walletLinked: false,
    };
    if (!base.ready) return base;
    const sql = await getSql();
    const w = await sql<{ n: number }>`select count(*)::int as n from wallet_links where user_id = ${context.userId} and chain = 'solana' and cluster = 'devnet'`;
    return { ...base, consented: await s.hasConsent(sql, context.userId), walletLinked: Number(w[0]?.n ?? 0) > 0 };
  });

export const acceptPropertyConsent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { version: string }) => ({ version: String(input?.version ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      s.requireReady();
      if (data.version !== PROPERTY.consentVersion) throw new s.PropertyError("The notice changed. Reload and read it again.");
      const sql = await getSql();
      await sql`insert into property_consents (user_id, copy_version) values (${context.userId}, ${data.version}) on conflict do nothing`;
      return { ok: true as const };
    }),
  );

export const listScanItems = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { scanId: string }) => ({ scanId: String(input?.scanId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.listItemsForScan(await getSql(), kek, context.userId, data.scanId);
    }),
  );

export const listSharedItems = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.listSharedItems(await getSql(), kek, context.userId);
    }),
  );

type ItemInput = { scanId: string; label: string; assetClass: string; scope: string; groupId?: string | null };

export const addPropertyItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ItemInput) => input)
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.addItem(await getSql(), kek, context.userId, data);
    }),
  );

type ItemPatch = { id: string; label?: string; assetClass?: string; scope?: string; groupId?: string | null };

export const updatePropertyItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ItemPatch) => input)
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.updateItem(await getSql(), kek, context.userId, data);
    }),
  );

export const deletePropertyItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      s.requireReady();
      const plan = shredPlan(data.id);
      await s.deleteItem(await getSql(), context.userId, plan.recordId);
      return { ok: true as const };
    }),
  );

export const withdrawEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string; kind: "receipt" | "photo" }) => ({ itemId: String(input?.itemId ?? ""), kind: input?.kind }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      s.requireReady();
      await s.shredEvidence(await getSql(), context.userId, data.itemId, data.kind);
      return { ok: true as const };
    }),
  );

// ── groups ──

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.listGroups(await getSql(), kek, context.userId);
    }),
  );

export const createPropertyGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: "family" | "community"; name: string }) => input)
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      const sql = await getSql();
      await s.requireConsent(sql, context.userId);
      const group = openGroup(data.name, context.userId);
      return s.createGroup(sql, kek, context.userId, data.kind, group.name);
    }),
  );

export const createGroupInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string }) => ({ groupId: String(input?.groupId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      s.requireReady();
      return s.createInvite(await getSql(), context.userId, data.groupId);
    }),
  );

export const joinPropertyGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string }) => ({ code: String(input?.code ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      const sql = await getSql();
      await s.requireConsent(sql, context.userId);
      return s.joinGroup(sql, kek, context.userId, data.code);
    }),
  );

export const leavePropertyGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string }) => ({ groupId: String(input?.groupId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      s.requireReady();
      await s.leaveGroup(await getSql(), context.userId, data.groupId);
      return { ok: true as const };
    }),
  );

// ── claim (message signature only; mint stubbed + off) ──

export const preparePropertyClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string }) => ({ itemId: String(input?.itemId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.prepareClaim(await getSql(), kek, context.userId, data.itemId);
    }),
  );

export const submitPropertyClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string; issuedAt: string; signature: string }) => input)
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.submitClaim(await getSql(), kek, context.userId, data);
    }),
  );

// ── verification card ──

export const verifyPropertyItem = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string }) => ({ itemId: String(input?.itemId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const s = await srv();
      const kek = s.requireReady();
      return s.verifyItem(await getSql(), kek, context.userId, data.itemId);
    }),
  );

// ── NDU devnet anchor (user signs in their own wallet; server never holds a key) ──

export const prepareRecordAnchor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string }) => ({ itemId: String(input?.itemId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const a = await import("./property-anchor.server");
      return a.prepareAnchor(await getSql(), context.userId, data.itemId);
    }),
  );

export const submitRecordAnchor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string; signed: string }) => ({ itemId: String(input?.itemId ?? ""), signed: String(input?.signed ?? "").slice(0, 4096) }))
  .handler(({ context, data }) =>
    run(async () => {
      const a = await import("./property-anchor.server");
      return a.submitAnchor(await getSql(), context.userId, data.itemId, data.signed);
    }),
  );

// ── NDU-34/35 disputes (0019 table; open by a viewer, answered by the owner, settled by an admin) ──

async function callerIsAdmin(userId: string): Promise<boolean> {
  const [{ isAdminUser }, { readSessionConfig }] = await Promise.all([
    import("@/lib/auth/sessions/store.server"),
    import("@/lib/auth/sessions/config"),
  ]);
  return isAdminUser(await getSql(), userId, readSessionConfig()).catch(() => false);
}

export const getItemDispute = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string }) => ({ itemId: String(input?.itemId ?? "") }))
  .handler(({ context, data }) =>
    run(async () => {
      const d = await import("@/world/disputes/disputes.server");
      return d.disputeView(await getSql(), context.userId, data.itemId, await callerIsAdmin(context.userId));
    }),
  );

export const actOnItemDispute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { itemId: string; action: string }) => {
    const action = String(input?.action ?? "");
    if (action !== "open" && action !== "challenge" && action !== "settle") throw new Error("Bad dispute action.");
    return { itemId: String(input?.itemId ?? ""), action: action as "open" | "challenge" | "settle" };
  })
  .handler(({ context, data }) =>
    run(async () => {
      const d = await import("@/world/disputes/disputes.server");
      return d.disputeAct(await getSql(), context.userId, data.itemId, data.action, await callerIsAdmin(context.userId));
    }),
  );

// ── client helpers (evidence goes through a raw-body API route, like scans) ──

export const evidenceUrl = (id: string) => `/api/property/evidence/${id}`;

function authHeaders(): Record<string, string> {
  const token = getBearerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type UploadedEvidence = {
  id: string;
  kind: "receipt" | "photo";
  mime: string;
  bytes: number;
  sha256: string;
  /** NDU-AI safe-ingest: what the server stripped, and a plain-words duplicate notice (review flag, not a verdict). */
  review?: { removed: string[]; notice: string | null };
};

/** Upload a receipt or photo. The server strips image metadata, hashes, commits and encrypts it. */
export async function uploadEvidence(itemId: string, kind: "receipt" | "photo", body: Blob): Promise<UploadedEvidence> {
  if (body.size > PROPERTY.maxEvidenceBytes) throw new Error(`Files are limited to ${PROPERTY.maxEvidenceBytes / 1048576} MB.`);
  const res = await fetch("/api/property/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Item-Id": itemId, "X-Evidence-Kind": kind, ...authHeaders() },
    body,
  });
  let json: { evidence?: UploadedEvidence; error?: string } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    // non-JSON error page
  }
  if (res.status !== 201 || !json.evidence) throw new Error(json.error || `Upload failed (${res.status}).`);
  return json.evidence;
}

/** Fetch decrypted evidence for display (owner / group member only) as an object URL. */
export async function evidenceObjectUrl(id: string): Promise<string> {
  const res = await fetch(evidenceUrl(id), { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not open that file.");
  return URL.createObjectURL(await res.blob());
}
