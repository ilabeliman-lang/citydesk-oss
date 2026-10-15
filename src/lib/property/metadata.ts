/**
 * Public, content-addressed metadata for an NDU property record (plan D1/D2) + the leak test.
 * Pure and isomorphic (imports ./commit.ts and the leak scan) so it runs in Node tests, the server and the browser.
 *
 * What may be public: salted commitments, opaque ids, enums, the claimant's wallet address and
 * signature, an ISO timestamp, and the fixed disclaimer. NEVER names, addresses, coordinates,
 * prices, merchants, serials, emails or database user ids.
 */
import { canonicalHash, canonicalJson, isHex64 } from "./commit.ts";
import { leakKeys } from "../../world/leaks/scan.ts";

export const PROPERTY_SCHEMA = "ndu.property/0.1";
export const PROPERTY_NETWORK = "devnet";
export const PROPERTY_SYMBOL = "NDUREC";
export const PROPERTY_DISCLAIMER =
  "Self-declared claim record on Solana devnet. It shows what was recorded, by which wallet, and when. It does not prove the claim is true and is not legal title.";
export const ASSET_CLASSES = ["household", "equipment"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export const SCOPES = ["personal", "family", "community"] as const;
export type Scope = (typeof SCOPES)[number];
export const CLAIM_STATUSES = ["active", "disputed", "revoked"] as const;
export type PublicClaimStatus = (typeof CLAIM_STATUSES)[number];

export type ClaimBody = {
  schema: typeof PROPERTY_SCHEMA;
  network: typeof PROPERTY_NETWORK;
  record_ref: string;
  asset_class: AssetClass;
  scope: Scope;
  owner_group_commitment: string | null;
  geo_commitment: string;
  scan_commitment: string;
  receipt_commitment: string;
  photo_commitment: string;
  claimant: string;
  issued_at: string;
};

export type PublicMetadata = {
  schema: typeof PROPERTY_SCHEMA;
  network: typeof PROPERTY_NETWORK;
  name: string;
  symbol: typeof PROPERTY_SYMBOL;
  asset_class: AssetClass;
  scope: Scope;
  claim_status: PublicClaimStatus;
  owner_group_commitment: string | null;
  geo_commitment: string;
  scan_commitment: string;
  receipt_commitment: string;
  photo_commitment: string;
  claim: { claimant: string; issued_at: string; record_ref: string; claim_sha256: string };
  claimant_sig: string;
  supersedes: string | null;
  disclaimer: typeof PROPERTY_DISCLAIMER;
};

export const claimHash = (body: ClaimBody) => canonicalHash(body);

/** The exact text the claimant's wallet signs (message only — no transaction, no gas). */
export function claimMessage(hash: string): string {
  return [
    "NDU property claim v0.1 (DEVNET, not legal title)",
    `claim_sha256:${hash}`,
    "Signing records a self-declared claim. It is not a transaction, moves no funds and costs no gas.",
  ].join("\n");
}


/**
 * The leak scan names credential keys. Those fields are not returned.
 * Own keys, then one plain-object level — the same depth as leakKeys.
 * A clean scan returns the same object.
 */
function omitRejectedSecrets(obj: PublicMetadata): PublicMetadata {
  const rejected = leakKeys(obj);
  if (rejected.length === 0) return obj;
  const drop = new Set(rejected);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (drop.has(key)) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested: Record<string, unknown> = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        if (!drop.has(childKey)) nested[childKey] = childValue;
      }
      out[key] = nested;
    } else {
      out[key] = value;
    }
  }
  return out as PublicMetadata;
}

export async function buildMetadata(
  body: ClaimBody,
  claimantSig: string,
  opts: { claimStatus?: PublicClaimStatus; supersedes?: string | null } = {},
): Promise<{ metadata: PublicMetadata; json: string; hash: string }> {
  const metadata: PublicMetadata = {
    schema: PROPERTY_SCHEMA,
    network: PROPERTY_NETWORK,
    name: `NDU item #${body.record_ref.slice(0, 6)}`,
    symbol: PROPERTY_SYMBOL,
    asset_class: body.asset_class,
    scope: body.scope,
    claim_status: opts.claimStatus ?? "active",
    owner_group_commitment: body.owner_group_commitment,
    geo_commitment: body.geo_commitment,
    scan_commitment: body.scan_commitment,
    receipt_commitment: body.receipt_commitment,
    photo_commitment: body.photo_commitment,
    claim: { claimant: body.claimant, issued_at: body.issued_at, record_ref: body.record_ref, claim_sha256: await claimHash(body) },
    claimant_sig: claimantSig,
    supersedes: opts.supersedes ?? null,
    disclaimer: PROPERTY_DISCLAIMER,
  };
  const problems = validatePublicMetadata(metadata);
  if (problems.length) throw new Error(`Refusing to publish metadata: ${problems.join("; ")}`);
  const published = omitRejectedSecrets(metadata);
  const json = canonicalJson(published);
  return { metadata: published, json, hash: await canonicalHash(published) };
}

/** Rebuild the signed claim body from a metadata object (for verification). */
export function claimBodyFrom(m: PublicMetadata): ClaimBody {
  return {
    schema: m.schema,
    network: m.network,
    record_ref: m.claim.record_ref,
    asset_class: m.asset_class,
    scope: m.scope,
    owner_group_commitment: m.owner_group_commitment,
    geo_commitment: m.geo_commitment,
    scan_commitment: m.scan_commitment,
    receipt_commitment: m.receipt_commitment,
    photo_commitment: m.photo_commitment,
    claimant: m.claim.claimant,
    issued_at: m.claim.issued_at,
  };
}

const TOP_KEYS = [
  "schema",
  "network",
  "name",
  "symbol",
  "asset_class",
  "scope",
  "claim_status",
  "owner_group_commitment",
  "geo_commitment",
  "scan_commitment",
  "receipt_commitment",
  "photo_commitment",
  "claim",
  "claimant_sig",
  "supersedes",
  "disclaimer",
];
const CLAIM_KEYS = ["claimant", "issued_at", "record_ref", "claim_sha256"];
const BASE58_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG_B64 = /^[A-Za-z0-9+/]{86}==$/; // 64-byte ed25519 signature
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REF = /^[0-9a-f]{16}$/;
/** The one place a digit run is allowed in public text: the trailing opaque id of an exact "NDU item #<6 hex>" name. */
const OPAQUE_NAME_ID = /(?<=^NDU item )#[0-9a-f]{6}$/;

/**
 * The leak test (NDU-25 / NDU-38): strict allowlist of keys and per-field formats, plus a sweep for
 * anything that looks like a coordinate, an email or a long digit run in the free-text fields.
 * Returns a list of problems; empty = safe to publish.
 */
export function validatePublicMetadata(input: unknown): string[] {
  const out: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["not an object"];
  const m = input as Record<string, unknown>;
  for (const k of Object.keys(m)) if (!TOP_KEYS.includes(k)) out.push(`field not allowed: ${k}`);
  for (const k of TOP_KEYS) if (!(k in m)) out.push(`missing field: ${k}`);
  const want = (ok: boolean, what: string) => {
    if (!ok) out.push(what);
  };
  want(m.schema === PROPERTY_SCHEMA, "bad schema");
  want(m.network === PROPERTY_NETWORK, "network must be devnet");
  want(m.symbol === PROPERTY_SYMBOL, "bad symbol");
  want(typeof m.name === "string" && /^NDU item #[0-9a-f]{6}$/.test(m.name), "name must be opaque");
  want(ASSET_CLASSES.includes(m.asset_class as AssetClass), "bad asset_class");
  want(SCOPES.includes(m.scope as Scope), "bad scope");
  want(CLAIM_STATUSES.includes(m.claim_status as PublicClaimStatus), "bad claim_status");
  want(m.owner_group_commitment === null || isHex64(m.owner_group_commitment), "bad owner_group_commitment");
  want((m.scope === "personal") === (m.owner_group_commitment === null), "group commitment must match scope");
  for (const k of ["geo_commitment", "scan_commitment", "receipt_commitment", "photo_commitment"]) want(isHex64(m[k]), `bad ${k}`);
  want(m.supersedes === null || isHex64(m.supersedes), "bad supersedes");
  want(typeof m.claimant_sig === "string" && SIG_B64.test(m.claimant_sig), "bad claimant_sig");
  want(m.disclaimer === PROPERTY_DISCLAIMER, "disclaimer missing or altered");
  const c = m.claim;
  if (!c || typeof c !== "object" || Array.isArray(c)) out.push("bad claim");
  else {
    const claim = c as Record<string, unknown>;
    for (const k of Object.keys(claim)) if (!CLAIM_KEYS.includes(k)) out.push(`claim field not allowed: ${k}`);
    want(typeof claim.claimant === "string" && BASE58_ADDR.test(claim.claimant), "bad claimant address");
    want(typeof claim.issued_at === "string" && ISO.test(claim.issued_at), "bad issued_at");
    want(typeof claim.record_ref === "string" && REF.test(claim.record_ref), "bad record_ref");
    want(isHex64(claim.claim_sha256), "bad claim_sha256");
  }
  // Belt and braces over the whole serialized object.
  let text = "";
  try {
    text = canonicalJson(m);
  } catch {
    out.push("not serializable");
  }
  if (/@/.test(text)) out.push("looks like it contains an email");
  if (/-?\d{1,3}\.\d{4,}/.test(text)) out.push("looks like it contains a coordinate");
  for (const k of ["name", "asset_class", "scope", "claim_status", "schema", "network", "symbol"]) {
    if (typeof m[k] !== "string") continue;
    // F2: the opaque "#<6 hex>" id in the name is a slice of record_ref (random hex), so it may be all
    // digits (~13% of names). Drop exactly that id before the sweep; anything else still counts.
    const v = k === "name" ? (m[k] as string).replace(OPAQUE_NAME_ID, "") : (m[k] as string);
    if (/\d{5,}/.test(v)) out.push(`long digit run in ${k}`);
  }
  return out;
}
