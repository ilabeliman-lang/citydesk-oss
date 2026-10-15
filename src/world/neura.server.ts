/**
 * Server-only Solana DEVNET helpers for the NEURA wallet link + Compute desk.
 * Imported dynamically from server-function handlers only (never from client code).
 *
 * Safety posture:
 * - Devnet only: every RPC connection is checked against the devnet genesis hash.
 * - No private keys: the server never signs anything. It builds UNSIGNED
 *   transactions for the user's wallet, and relays a transaction ONLY after the
 *   user has signed it in their wallet (fee payer = the user, devnet SOL).
 * - Prices are looked up server-side; the client never sets an amount.
 */
import { assertDevnetGenesis, assertNotMainnetRpc, requireDevnetCluster } from "@/lib/solana/cluster";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { NEURA_NET } from "@/config/neura";

// ── config ──────────────────────────────────────────────────────────────

export type NeuraServerConfig = {
  rpc: string;
  payee: string | null;
  neuraMint: string | null;
  dispatcherUrl: string | null;
};

export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try {
    return PublicKey.isOnCurve(new PublicKey(value).toBytes());
  } catch {
    return false;
  }
}

async function readFileConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(join(process.cwd(), "neura.devnet.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Env wins over `neura.devnet.json`. Public values only — nothing here is secret. */
export async function loadConfig(): Promise<NeuraServerConfig> {
  const file = await readFileConfig();
  const pick = (envKey: string, fileKey: string): string | null => {
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv) return fromEnv;
    const fromFile = file[fileKey];
    return typeof fromFile === "string" && fromFile.trim() ? fromFile.trim() : null;
  };
  const rpc = pick("SOLANA_DEVNET_RPC_URL", "rpcUrl") ?? NEURA_NET.rpc;
  const payee = pick("NEURA_DEVNET_PAYEE", "payee");
  const neuraMint = pick("NEURA_DEVNET_MINT", "neuraDevnetMint");
  const dispatcher = pick("NEURANET_DISPATCHER_URL", "dispatcherUrl");
  return {
    rpc,
    payee: isSolanaAddress(payee) ? payee : null,
    neuraMint: neuraMint && isMintShaped(neuraMint) ? neuraMint : null,
    dispatcherUrl: dispatcher && /^https?:\/\//.test(dispatcher) ? dispatcher.replace(/\/+$/, "") : null,
  };
}

function isMintShaped(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ── devnet connection (genesis-checked) ──────────────────────────────────

const g = globalThis as typeof globalThis & {
  __neuraDevnetChecked__?: Map<string, Promise<void>>;
  __neuraMintCache__?: Map<string, { at: number; info: MintInfo | null }>;
  __neuraDeskCache__?: { at: number; key: string; desk: ComputeDeskData };
};

export async function devnet(cfg: NeuraServerConfig): Promise<Connection> {
  // NDU-2 hard guard (devnet only): env cluster + URL check before any connection; genesis check below.
  requireDevnetCluster();
  assertNotMainnetRpc(cfg.rpc);
  const conn = new Connection(cfg.rpc, "confirmed");
  g.__neuraDevnetChecked__ ??= new Map();
  let check = g.__neuraDevnetChecked__.get(cfg.rpc);
  if (!check) {
    check = conn.getGenesisHash().then((hash) => {
      assertDevnetGenesis(hash);
      if (hash !== NEURA_NET.devnetGenesisHash) {
        throw new Error("Configured Solana RPC is not devnet — refusing to use it.");
      }
    });
    g.__neuraDevnetChecked__.set(cfg.rpc, check);
    check.catch(() => g.__neuraDevnetChecked__?.delete(cfg.rpc));
  }
  await check;
  return conn;
}

// ── tokens ──────────────────────────────────────────────────────────────

export type TokenKey = "usdc" | "neura";
export type MintInfo = { mint: string; decimals: number; programId: string };
export type TokenOption = MintInfo & { key: TokenKey; symbol: string; label: string };

async function mintInfo(conn: Connection, mint: string): Promise<MintInfo | null> {
  g.__neuraMintCache__ ??= new Map();
  const hit = g.__neuraMintCache__.get(mint);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.info;
  let info: MintInfo | null = null;
  try {
    const acc = await conn.getParsedAccountInfo(new PublicKey(mint));
    const data = acc.value?.data;
    if (data && typeof data === "object" && "parsed" in data && data.parsed?.type === "mint") {
      info = { mint, decimals: Number(data.parsed.info.decimals), programId: acc.value!.owner.toBase58() };
    }
  } catch {
    info = null;
  }
  g.__neuraMintCache__.set(mint, { at: Date.now(), info });
  return info;
}

/** Devnet USDC always; the devnet NEURA stand-in only if configured AND it exists as a mint on devnet. */
export async function tokenOptions(cfg: NeuraServerConfig, conn: Connection): Promise<TokenOption[]> {
  const out: TokenOption[] = [];
  const usdc = await mintInfo(conn, NEURA_NET.devnetUsdcMint);
  if (usdc) out.push({ ...usdc, key: "usdc", symbol: "USDC", label: "USDC (devnet test token)" });
  if (cfg.neuraMint) {
    const neura = await mintInfo(conn, cfg.neuraMint);
    if (neura) out.push({ ...neura, key: "neura", symbol: "NEURA", label: "NEURA devnet stand-in (test token)" });
  }
  return out;
}

export async function programOfMint(cfg: NeuraServerConfig, conn: Connection, mint: string): Promise<string> {
  const t = (await tokenOptions(cfg, conn)).find((x) => x.mint === mint);
  if (!t) throw new Error("That devnet token is no longer configured.");
  return t.programId;
}

export async function balances(conn: Connection, owner: string, tokens: TokenOption[]) {
  const pk = new PublicKey(owner);
  const sol = await conn.getBalance(pk).catch(() => null);
  const rows: { symbol: string; label: string; amount: string }[] = [];
  for (const t of tokens) {
    const ata = getAssociatedTokenAddressSync(new PublicKey(t.mint), pk, false, new PublicKey(t.programId));
    const bal = await conn.getTokenAccountBalance(ata).catch(() => null);
    rows.push({ symbol: t.symbol, label: t.label, amount: bal?.value.uiAmountString ?? "0" });
  }
  return { sol: sol === null ? null : (sol / 1e9).toString(), tokens: rows };
}

// ── signatures ──────────────────────────────────────────────────────────

export function verifyMessageSignature(message: string, signatureB64: string, address: string): boolean {
  try {
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}

// ── webhook signature verification (HMAC-SHA256, constant-time) ─────────

/**
 * Neura signs every webhook it POSTs at us with HMAC-SHA256 over the RAW request
 * bytes and sends the hex digest in the `x-neura-signature-256` header.
 *
 * Rules this module enforces:
 * - The MAC is computed over the raw body EXACTLY as received. Never re-serialize
 *   JSON first — a single whitespace/key-order change invalidates the signature.
 *   Handlers must read the body once (`await request.text()`) and pass those bytes.
 * - The secret lives in the server env only: `NEURA_WEBHOOK_SECRET`. No literal
 *   secret is stored in the repo, and the public `neura.devnet.json` is never read
 *   for it.
 * - The digest is compared with `crypto.timingSafeEqual`, so a wrong signature
 *   cannot be recovered byte-by-byte from response timing.
 * - Every failure is fail-closed: missing header, malformed digest, mismatch, or an
 *   unset secret all REJECT before any handler work happens.
 */

/** Header carrying the hex HMAC-SHA256 of the raw body. */
export const NEURA_WEBHOOK_SIGNATURE_HEADER = "x-neura-signature-256";

/** The webhook MAC secret, from the server env. Null when it is not configured. */
export function neuraWebhookSecret(): string | null {
  const secret = process.env.NEURA_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

/** Constant-time check of a hex HMAC-SHA256 digest. Length mismatch is not a match. */
function digestMatches(expected: Buffer, givenHex: unknown): boolean {
  if (typeof givenHex !== "string" || !/^[0-9a-f]+$/i.test(givenHex)) return false;
  if (givenHex.length !== expected.length * 2) return false;
  return timingSafeEqual(expected, Buffer.from(givenHex, "hex"));
}

/** True only when `signature` is the HMAC-SHA256 (hex) of this exact raw body. */
export function verifyNeuraWebhookSignature(
  rawBody: string | Uint8Array,
  signature: unknown,
  secret: string = neuraWebhookSecret() ?? "",
): boolean {
  if (!secret || typeof signature !== "string") return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return digestMatches(expected, signature.trim());
}

export type NeuraWebhookCheck = { ok: true } | { ok: false; status: 401 | 400 | 500; error: string };

/**
 * Guard for a Neura webhook handler: call this FIRST, before reading or parsing
 * anything, and return the error body as-is when `ok` is false.
 *
 *   const raw = await request.text();
 *   const check = checkNeuraWebhook(raw, request.headers.get(NEURA_WEBHOOK_SIGNATURE_HEADER));
 *   if (!check.ok) return new Response(JSON.stringify({ error: check.error }), { status: check.status, headers: { "content-type": "application/json" } });
 */
export function checkNeuraWebhook(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
): NeuraWebhookCheck {
  if (!signatureHeader || !signatureHeader.trim()) {
    return { ok: false, status: 401, error: `Missing ${NEURA_WEBHOOK_SIGNATURE_HEADER} header.` };
  }
  const secret = neuraWebhookSecret();
  if (!secret) {
    return { ok: false, status: 500, error: "Neura webhook verification is not configured on the server." };
  }
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader.trim())) {
    return { ok: false, status: 400, error: `Malformed ${NEURA_WEBHOOK_SIGNATURE_HEADER} header (expected 64 hex chars).` };
  }
  if (!verifyNeuraWebhookSignature(rawBody, signatureHeader, secret)) {
    return { ok: false, status: 401, error: "Webhook signature does not match — request rejected." };
  }
  return { ok: true };
}

// ── amounts ─────────────────────────────────────────────────────────────

/** "1.5" with 6 decimals -> 1500000n. Prices are server-defined strings. */
export function toBaseUnits(ui: string, decimals: number): bigint {
  const [whole, frac = ""] = ui.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

// ── hire transfer: build (unsigned) → user signs in wallet → relay to devnet → verify ──

export type HireTransfer = {
  from: string;
  payee: string;
  token: MintInfo;
  amountBase: bigint;
  memo: string;
};

export async function buildUnsignedTransfer(
  conn: Connection,
  t: HireTransfer,
): Promise<{ ok: true; tx: string } | { ok: false; reason: string }> {
  const owner = new PublicKey(t.from);
  const payee = new PublicKey(t.payee);
  const mint = new PublicKey(t.token.mint);
  const program = new PublicKey(t.token.programId);
  const src = getAssociatedTokenAddressSync(mint, owner, false, program);
  const dst = getAssociatedTokenAddressSync(mint, payee, false, program);

  const bal = await conn.getTokenAccountBalance(src).catch(() => null);
  if (!bal || BigInt(bal.value.amount) < t.amountBase) {
    return { ok: false, reason: "Your linked wallet doesn't hold enough of this devnet test token. Get some from the devnet faucet first." };
  }
  const lamports = await conn.getBalance(owner).catch(() => 0);
  if (lamports < 3_000_000) {
    return { ok: false, reason: "Your linked wallet needs a little devnet SOL for the network fee (free from faucet.solana.com)." };
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight });
  tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, dst, payee, mint, program));
  tx.add(createTransferCheckedInstruction(src, mint, dst, owner, t.amountBase, t.token.decimals, [], program));
  tx.add(
    new TransactionInstruction({
      programId: new PublicKey(NEURA_NET.memoProgram),
      keys: [{ pubkey: owner, isSigner: true, isWritable: false }],
      data: Buffer.from(t.memo, "utf8"),
    }),
  );
  const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { ok: true, tx: bytes.toString("base64") };
}

/**
 * Relay a transaction the USER already signed in their wallet to DEVNET, then verify
 * on-chain that it is exactly the expected transfer (signer, mint, source, destination,
 * amount, memo). The server holds no key and adds no signature.
 */
export async function relayAndVerify(
  conn: Connection,
  signedTxB64: string,
  t: HireTransfer,
): Promise<{ ok: true; signature: string } | { ok: false; reason: string; signature?: string }> {
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(signedTxB64, "base64"));
  } catch {
    return { ok: false, reason: "That signed transaction could not be read." };
  }
  if (!tx.feePayer || tx.feePayer.toBase58() !== t.from) {
    return { ok: false, reason: "The fee payer is not your linked wallet." };
  }
  if (!tx.verifySignatures(true)) {
    return { ok: false, reason: "The wallet signature is missing or invalid." };
  }
  const first = tx.signatures[0]?.signature;
  if (!first) return { ok: false, reason: "No signature on the transaction." };
  const signature = bs58.encode(first);

  // Pre-flight: the transaction must contain our exact transfer before we relay it.
  const pre = checkInstructions(
    tx.instructions.map((ix) => ({ programId: ix.programId.toBase58(), keys: ix.keys.map((k) => k.pubkey.toBase58()), data: ix.data })),
    t,
  );
  if (!pre) return { ok: false, reason: "The signed transaction doesn't match this hire." };

  try {
    await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  } catch (e) {
    return { ok: false, reason: `Devnet rejected the transaction: ${(e as Error).message.slice(0, 160)}` };
  }
  const result = await verifyLanded(conn, signature, t, 20);
  return result.ok ? { ok: true, signature } : { ok: false, reason: result.reason, signature };
}

export function checkInstructions(
  ixs: { programId: string; keys: string[]; data: Uint8Array }[],
  t: HireTransfer,
): boolean {
  const mint = new PublicKey(t.token.mint);
  const program = new PublicKey(t.token.programId);
  const src = getAssociatedTokenAddressSync(mint, new PublicKey(t.from), false, program).toBase58();
  const dst = getAssociatedTokenAddressSync(mint, new PublicKey(t.payee), false, program).toBase58();
  const transfer = ixs.find(
    (ix) =>
      ix.programId === t.token.programId &&
      ix.data[0] === 12 && // TransferChecked
      ix.keys[0] === src &&
      ix.keys[1] === t.token.mint &&
      ix.keys[2] === dst &&
      ix.keys[3] === t.from,
  );
  if (!transfer) return false;
  const amount = Buffer.from(transfer.data).readBigUInt64LE(1);
  if (amount !== t.amountBase || transfer.data[9] !== t.token.decimals) return false;
  const memo = ixs.find((ix) => ix.programId === NEURA_NET.memoProgram);
  if (!memo || Buffer.from(memo.data).toString("utf8") !== t.memo) return false;
  // Nothing else may move tokens: only ATA-create, compute-budget, the transfer and the memo.
  const allowed = new Set([
    t.token.programId,
    NEURA_NET.memoProgram,
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "ComputeBudget111111111111111111111111111111",
    "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95", // Phantom's Lighthouse guard (assertions only)
  ]);
  return ixs.every((ix) => allowed.has(ix.programId)) && ixs.filter((ix) => ix.programId === t.token.programId).length === 1;
}

/** Poll devnet for the parsed transaction and check it is the expected, successful transfer. */
export async function verifyLanded(
  conn: Connection,
  signature: string,
  t: HireTransfer,
  tries = 1,
): Promise<{ ok: true } | { ok: false; reason: string; pending?: boolean }> {
  for (let i = 0; i < tries; i += 1) {
    const parsed = await conn
      .getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
      .catch(() => null);
    if (parsed) {
      if (parsed.meta?.err) return { ok: false, reason: "The devnet transaction failed on-chain." };
      const signer = parsed.transaction.message.accountKeys.find((k) => k.signer && k.pubkey.toBase58() === t.from);
      if (!signer) return { ok: false, reason: "Transaction was not signed by your linked wallet." };
      const ixs = parsed.transaction.message.instructions as (ParsedInstruction | PartiallyDecodedInstruction)[];
      const mint = new PublicKey(t.token.mint);
      const program = new PublicKey(t.token.programId);
      const src = getAssociatedTokenAddressSync(mint, new PublicKey(t.from), false, program).toBase58();
      const dst = getAssociatedTokenAddressSync(mint, new PublicKey(t.payee), false, program).toBase58();
      const transfer = ixs.find((ix) => {
        if (!("parsed" in ix) || ix.parsed?.type !== "transferChecked") return false;
        const info = ix.parsed.info;
        return (
          info.source === src &&
          info.destination === dst &&
          info.mint === t.token.mint &&
          info.authority === t.from &&
          String(info.tokenAmount?.amount) === t.amountBase.toString()
        );
      });
      const memo = ixs.find((ix) => ix.programId.toBase58() === NEURA_NET.memoProgram);
      const memoText = memo && "parsed" in memo ? String(memo.parsed) : "";
      if (!transfer) return { ok: false, reason: "No matching devnet transfer in that transaction." };
      if (memoText !== t.memo) return { ok: false, reason: "The transfer memo doesn't match this hire." };
      return { ok: true };
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: false, reason: "Not confirmed on devnet yet. Check again in a moment.", pending: true };
}

// ── Compute desk: NeuraNet dispatcher (read-only) or clearly-labeled mock ──

export type DeskAgent = { id: string; name: string; discipline: string; description: string; price: string; royaltyBps: number };
export type ComputeDeskData = {
  source: "dispatcher" | "mock";
  sourceNote: string;
  stats: { gpus: number; gpusEnabled: number; agents: number; feeBps: number; chainEnabled: boolean };
  agents: DeskAgent[];
};

/** GPU rental + job offers. Server-side catalog: the client never sets a price. Devnet test-token prices. */
export const CATALOG: { id: string; name: string; kind: string; detail: string; price: string }[] = [
  { id: "job-audio-stem", name: "Audio stem separation", kind: "audio_stem_separation", detail: "Split a song into vocals/drums/bass. The one job kind the NeuraNet node client really runs today (CPU).", price: "0.50" },
  { id: "gpu-t3-1h", name: "GPU rental · Tier 3 · 1 hour", kind: "gpu_rental", detail: "Consumer GPU — transcode / tagging.", price: "1.00" },
  { id: "gpu-t2-1h", name: "GPU rental · Tier 2 · 1 hour", kind: "gpu_rental", detail: "RTX 4090/3090-class — audio, stem separation, small models.", price: "3.00" },
  { id: "gpu-t1-1h", name: "GPU rental · Tier 1 · 1 hour", kind: "gpu_rental", detail: "A100/H100-class — heavy render / LLM.", price: "8.00" },
];

const MOCK_AGENTS: DeskAgent[] = [
  { id: "mock-1", name: "Caption Smith (MOCK)", discipline: "media", description: "Writes captions and alt text for photos. Sample listing — not a real agent.", price: "0.20", royaltyBps: 7000 },
  { id: "mock-2", name: "Ledger Tidy (MOCK)", discipline: "data", description: "Cleans a CSV and flags bad rows. Sample listing — not a real agent.", price: "0.40", royaltyBps: 7000 },
  { id: "mock-3", name: "Stem Splitter (MOCK)", discipline: "audio", description: "Wraps the audio stem-separation job. Sample listing — not a real agent.", price: "0.60", royaltyBps: 6000 },
];

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function computeDesk(cfg: NeuraServerConfig): Promise<ComputeDeskData> {
  const key = cfg.dispatcherUrl ?? "mock";
  const cached = g.__neuraDeskCache__;
  if (cached && cached.key === key && Date.now() - cached.at < 30_000) return cached.desk;

  let desk: ComputeDeskData | null = null;
  let failure = "";
  if (cfg.dispatcherUrl) {
    try {
      const base = cfg.dispatcherUrl;
      const [health, stats, agents] = (await Promise.all([
        getJson(`${base}/health`),
        getJson(`${base}/stats`),
        getJson(`${base}/agents`),
      ])) as [
        { ok?: boolean; chainEnabled?: boolean },
        { gpus?: number; gpusEnabled?: number; agents?: number; feeBps?: number },
        { agents?: { id: number | string; name: string; discipline?: string; description?: string; price_per_call?: string | number; royalty_bps?: number }[] },
      ];
      desk = {
        source: "dispatcher",
        sourceNote: "LIVE from the NeuraNet dispatcher (off-chain mode, on this studio). Fee is planned, not charged.",
        stats: {
          gpus: Number(stats.gpus ?? 0),
          gpusEnabled: Number(stats.gpusEnabled ?? 0),
          agents: Number(stats.agents ?? 0),
          feeBps: Number(stats.feeBps ?? 0),
          chainEnabled: Boolean(health.chainEnabled),
        },
        agents: (agents.agents ?? []).slice(0, 30).map((a) => ({
          id: `d-${a.id}`,
          name: String(a.name).slice(0, 60),
          discipline: String(a.discipline ?? "").slice(0, 30),
          description: String(a.description ?? "").slice(0, 160),
          price: normalizePrice(a.price_per_call),
          royaltyBps: Number(a.royalty_bps ?? 0),
        })),
      };
    } catch (e) {
      failure = ` (dispatcher at the configured URL did not answer: ${(e as Error).message.slice(0, 60)})`;
    }
  }
  desk ??= {
    source: "mock",
    sourceNote: `MOCK DATA — the NeuraNet dispatcher is not connected${failure}. GPU counts and agents below are samples.`,
    stats: { gpus: 3, gpusEnabled: 2, agents: MOCK_AGENTS.length, feeBps: 250, chainEnabled: false },
    agents: MOCK_AGENTS,
  };
  g.__neuraDeskCache__ = { at: Date.now(), key, desk };
  return desk;
}

function normalizePrice(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "0";
  return (Math.round(Math.min(n, 1000) * 1e6) / 1e6).toString();
}

// ── NeuraNet dispatcher job creation (off-chain, wallet-signed) ──────────────

/** Dispatcher job kind for an offer id. Mock agents can't be queued. */
export function jobKindFor(offerId: string): string | null {
  const item = CATALOG.find((c) => c.id === offerId);
  if (item) return item.kind;
  if (/^d-\d+$/.test(offerId)) return `agent_call:${offerId.slice(2)}`;
  return null;
}

export type DispatcherJobPayload = { kind: string; reward: number; chainJobId: null; externalRef: string };

/** Must match neuranet-dispatcher auth.walletAuthMessage("create_job", …) byte-for-byte (same key order). */
export function dispatcherCreateJobMessage(p: DispatcherJobPayload, nonce: number): string {
  const payload = { kind: p.kind, reward: p.reward, chainJobId: p.chainJobId, externalRef: p.externalRef };
  return `Neuranet create_job\n${JSON.stringify(payload)}\nnonce:${nonce}`;
}

export async function dispatcherCreateJob(
  cfg: NeuraServerConfig,
  body: DispatcherJobPayload & { wallet: string; nonce: number; signature: string },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!cfg.dispatcherUrl) return { ok: false, reason: "The NeuraNet dispatcher isn't connected." };
  try {
    const res = await fetch(`${cfg.dispatcherUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !json.ok || !json.id) return { ok: false, reason: `Dispatcher refused the job: ${String(json.error ?? res.status).slice(0, 120)}` };
    return { ok: true, id: String(json.id) };
  } catch (e) {
    return { ok: false, reason: `Dispatcher did not answer: ${(e as Error).message.slice(0, 80)}` };
  }
}

export async function dispatcherJobStatus(cfg: NeuraServerConfig, id: string): Promise<string | null> {
  if (!cfg.dispatcherUrl || !/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${cfg.dispatcherUrl}/jobs/${id}/status`, { signal: AbortSignal.timeout(3000) });
    const json = (await res.json()) as { job?: { status?: string } };
    return json.job?.status ?? null;
  } catch {
    return null;
  }
}

/** Server-side price lookup for an offer id (catalog or desk agent). */
export async function findOffer(cfg: NeuraServerConfig, offerId: string) {
  const item = CATALOG.find((c) => c.id === offerId);
  if (item) return { id: item.id, name: item.name, price: item.price, source: "catalog" as const };
  const desk = await computeDesk(cfg);
  const agent = desk.agents.find((a) => a.id === offerId);
  if (agent) return { id: agent.id, name: `Agent · ${agent.name}`, price: agent.price, source: desk.source };
  return null;
}
