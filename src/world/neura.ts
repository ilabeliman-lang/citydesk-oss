/**
 * NEURA wallet link + NeuraNet Compute desk — server functions (Solana DEVNET only).
 *
 * Every function here is behind the existing better-auth login (authMiddleware) and
 * scoped to the verified `context.userId`. The server never holds or requests a key:
 * the user signs every message and every transfer in their own wallet (Phantom etc.).
 * Server-only Solana code lives in `./neura.server` and is imported ONLY inside handlers
 * (so the client bundle never references it).
 */
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

const NONCE_TTL_MIN = 10;
const MAX_HIRES_PER_DAY = 20;

function str(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

async function linkedWallet(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ address: string }>`
    select address from wallet_links where user_id = ${userId} and chain = 'solana' and cluster = 'devnet'`;
  return rows[0]?.address ?? null;
}

// ── config the UI needs (public values only) ─────────────────────────────

export const getNeuraSetup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    let tokens: { key: string; symbol: string; label: string; mint: string; decimals: number }[] = [];
    let rpcOk = true;
    try {
      const conn = await s.devnet(cfg);
      tokens = (await s.tokenOptions(cfg, conn)).map(({ key, symbol, label, mint, decimals }) => ({ key, symbol, label, mint, decimals }));
    } catch {
      rpcOk = false;
    }
    return {
      cluster: "devnet" as const,
      rpcOk,
      tokens,
      payee: cfg.payee,
      dispatcherConfigured: Boolean(cfg.dispatcherUrl),
      neuraStandInConfigured: Boolean(cfg.neuraMint),
    };
  });

// ── wallet link: nonce → user signs (no tx, no gas) → server verifies ──────

export const getWalletNonce = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { address: string }) => ({ address: str(input?.address, 44) }))
  .handler(async ({ context, data }) => {
    const s = await import("./neura.server");
    if (!s.isSolanaAddress(data.address)) throw new Error("That is not a Solana wallet address.");
    const sql = await getSql();
    await sql`delete from wallet_nonces where user_id = ${context.userId} or expires_at < now()`;
    const nonce = crypto.randomUUID();
    const issued = new Date().toISOString();
    const message = [
      "NDU · link wallet (Solana devnet)",
      "Signing proves you control this wallet. It is NOT a transaction and costs no gas.",
      `wallet:${data.address}`,
      `user:${context.userId}`,
      `nonce:${nonce}`,
      `issued:${issued}`,
    ].join("\n");
    await sql`insert into wallet_nonces (nonce, user_id, address, message, expires_at)
      values (${nonce}, ${context.userId}, ${data.address}, ${message}, now() + make_interval(mins => ${NONCE_TTL_MIN}))`;
    return { nonce, message };
  });

export const linkWallet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { address: string; nonce: string; signature: string }) => ({
    address: str(input?.address, 44),
    nonce: str(input?.nonce, 64),
    signature: str(input?.signature, 200),
  }))
  .handler(async ({ context, data }) => {
    const s = await import("./neura.server");
    const sql = await getSql();
    const rows = await sql<{ message: string; address: string }>`
      delete from wallet_nonces
      where nonce = ${data.nonce} and user_id = ${context.userId} and expires_at > now()
      returning message, address`;
    const row = rows[0];
    if (!row || row.address !== data.address) return { ok: false as const, reason: "That sign-in request expired. Try again." };
    if (!s.verifyMessageSignature(row.message, data.signature, data.address)) {
      return { ok: false as const, reason: "The signature didn't match that wallet." };
    }
    const taken = await sql<{ user_id: string }>`
      select user_id from wallet_links where chain = 'solana' and cluster = 'devnet' and address = ${data.address}`;
    if (taken[0] && taken[0].user_id !== context.userId) {
      return { ok: false as const, reason: "That wallet is already linked to another Ndu account." };
    }
    await sql`insert into wallet_links (user_id, chain, cluster, address, verified_at)
      values (${context.userId}, 'solana', 'devnet', ${data.address}, now())
      on conflict (user_id, chain, cluster) do update set address = excluded.address, verified_at = now()`;
    return { ok: true as const, address: data.address };
  });

export const unlinkWallet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`delete from wallet_links where user_id = ${context.userId} and chain = 'solana' and cluster = 'devnet'`;
    return { ok: true as const };
  });

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ address: string; verified_at: string }>`
      select address, verified_at::text as verified_at from wallet_links
      where user_id = ${context.userId} and chain = 'solana' and cluster = 'devnet'`;
    const row = rows[0];
    if (!row) return { linked: false as const };
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    try {
      const conn = await s.devnet(cfg);
      const tokens = await s.tokenOptions(cfg, conn);
      const bal = await s.balances(conn, row.address, tokens);
      return { linked: true as const, address: row.address, verifiedAt: row.verified_at, ...bal, rpcOk: true };
    } catch {
      return { linked: true as const, address: row.address, verifiedAt: row.verified_at, sol: null, tokens: [], rpcOk: false };
    }
  });

// ── Compute desk ───────────────────────────────────────────────────────────

export const getComputeDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    const desk = await s.computeDesk(cfg);
    return { ...desk, catalog: s.CATALOG };
  });

type HireRow = {
  id: string;
  offer_id: string;
  offer_name: string;
  source: string;
  token_key: string;
  mint: string;
  decimals: number;
  amount_base: string;
  amount_ui: string;
  payee: string | null;
  wallet: string;
  intent_message: string;
  intent_signature: string | null;
  tx_signature: string | null;
  status: string;
  note: string | null;
  created_at: string;
  dispatcher_job_id: string | null;
};

function publicHire(h: HireRow) {
  return {
    id: h.id,
    offerName: h.offer_name,
    source: h.source,
    token: h.token_key,
    amount: h.amount_ui,
    payee: h.payee,
    wallet: h.wallet,
    intentMessage: h.intent_message,
    intentSigned: Boolean(h.intent_signature),
    txSignature: h.tx_signature,
    status: h.status,
    note: h.note,
    createdAt: h.created_at,
    dispatcherJobId: h.dispatcher_job_id,
    dispatcherStatus: null as string | null,
  };
}
export type PublicHire = ReturnType<typeof publicHire>;

async function loadHire(userId: string, id: string): Promise<HireRow | null> {
  const sql = await getSql();
  const rows = await sql<HireRow>`
    select id, offer_id, offer_name, source, token_key, mint, decimals, amount_base, amount_ui, payee, wallet,
      intent_message, intent_signature, tx_signature, status, note, created_at::text as created_at, dispatcher_job_id
    from compute_hires where id = ${id} and user_id = ${userId}`;
  return rows[0] ?? null;
}

export const listMyHires = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<HireRow>`
      select id, offer_id, offer_name, source, token_key, mint, decimals, amount_base, amount_ui, payee, wallet,
        intent_message, intent_signature, tx_signature, status, note, created_at::text as created_at, dispatcher_job_id
      from compute_hires where user_id = ${context.userId} order by created_at desc limit 20`;
    const out = rows.map(publicHire);
    const withJobs = out.filter((h) => h.dispatcherJobId).slice(0, 5);
    if (withJobs.length) {
      const s = await import("./neura.server");
      const cfg = await s.loadConfig();
      await Promise.all(withJobs.map(async (h) => (h.dispatcherStatus = await s.dispatcherJobStatus(cfg, h.dispatcherJobId!))));
    }
    return out;
  });

/** Step 1: record a hire INTENT (nothing moves). Price comes from the server catalog. */
export const createHireIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offerId: string; token: string }) => ({
    offerId: str(input?.offerId, 60),
    token: input?.token === "neura" ? ("neura" as const) : ("usdc" as const),
  }))
  .handler(async ({ context, data }) => {
    const wallet = await linkedWallet(context.userId);
    if (!wallet) return { ok: false as const, reason: "Link a wallet first (sign once, no gas)." };
    const sql = await getSql();
    const recent = await sql<{ n: number }>`
      select count(*) as n from compute_hires where user_id = ${context.userId} and created_at > now() - interval '1 day'`;
    if (Number(recent[0]?.n ?? 0) >= MAX_HIRES_PER_DAY) return { ok: false as const, reason: "Daily demo hire limit reached." };

    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    const offer = await s.findOffer(cfg, data.offerId);
    if (!offer) return { ok: false as const, reason: "That offer is no longer listed." };
    if (!(Number(offer.price) > 0)) return { ok: false as const, reason: "This listing has no price set." };
    const conn = await s.devnet(cfg);
    const token = (await s.tokenOptions(cfg, conn)).find((t) => t.key === data.token);
    if (!token) return { ok: false as const, reason: "That devnet test token isn't available." };

    const id = crypto.randomUUID();
    const amountBase = s.toBaseUnits(offer.price, token.decimals);
    const message = [
      "NDU Compute desk · hire intent (Solana DEVNET, test tokens only)",
      "Signing approves this intent only. It is NOT a transaction and costs no gas.",
      `hire:${id}`,
      `offer:${offer.name}`,
      `amount:${offer.price} ${token.symbol} (devnet)`,
      `payee:${cfg.payee ?? "not configured"}`,
      `wallet:${wallet}`,
      `issued:${new Date().toISOString()}`,
    ].join("\n");
    await sql`insert into compute_hires
      (id, user_id, wallet, cluster, offer_id, offer_name, source, token_key, mint, decimals, amount_base, amount_ui, payee, intent_message, status)
      values (${id}, ${context.userId}, ${wallet}, 'devnet', ${offer.id}, ${offer.name}, ${offer.source}, ${token.key}, ${token.mint},
        ${token.decimals}, ${amountBase.toString()}, ${offer.price}, ${cfg.payee}, ${message}, 'intent')`;
    const hire = await loadHire(context.userId, id);
    return { ok: true as const, hire: publicHire(hire!) };
  });

/** Step 2: the user signed the intent message in their wallet (no gas). */
export const signHireIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; signature: string }) => ({ id: str(input?.id, 64), signature: str(input?.signature, 200) }))
  .handler(async ({ context, data }) => {
    const hire = await loadHire(context.userId, data.id);
    if (!hire || hire.status !== "intent") return { ok: false as const, reason: "This hire isn't waiting for a signature." };
    const s = await import("./neura.server");
    if (!s.verifyMessageSignature(hire.intent_message, data.signature, hire.wallet)) {
      return { ok: false as const, reason: "The signature didn't match your linked wallet." };
    }
    const sql = await getSql();
    await sql`update compute_hires set intent_signature = ${data.signature}, status = 'signed', updated_at = now()
      where id = ${hire.id} and user_id = ${context.userId}`;
    return { ok: true as const, hire: publicHire((await loadHire(context.userId, hire.id))!) };
  });

/** Step 3a: build the UNSIGNED devnet transfer for the user's wallet to review and sign. */
export const buildHireTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 64) }))
  .handler(async ({ context, data }) => {
    const hire = await loadHire(context.userId, data.id);
    if (!hire || hire.status !== "signed") return { ok: false as const, reason: "Sign the hire intent first." };
    if (!hire.payee) return { ok: false as const, reason: "No devnet payee address is configured, so the transfer step is off." };
    const current = await linkedWallet(context.userId);
    if (current !== hire.wallet) return { ok: false as const, reason: "Your linked wallet changed since this hire. Start a new hire." };
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    const conn = await s.devnet(cfg);
    return s.buildUnsignedTransfer(conn, {
      from: hire.wallet,
      payee: hire.payee,
      token: { mint: hire.mint, decimals: hire.decimals, programId: await s.programOfMint(cfg, conn, hire.mint) },
      amountBase: BigInt(hire.amount_base),
      memo: `ndu-hire:${hire.id}`,
    });
  });

/** Step 3b: the user SIGNED the transfer in their wallet; relay it to devnet and verify it on-chain. */
export const submitHireTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; signedTx: string }) => ({ id: str(input?.id, 64), signedTx: str(input?.signedTx, 4000) }))
  .handler(async ({ context, data }) => {
    const hire = await loadHire(context.userId, data.id);
    if (!hire || hire.status !== "signed" || !hire.payee) return { ok: false as const, reason: "This hire isn't ready for a transfer." };
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    const conn = await s.devnet(cfg);
    const transfer = {
      from: hire.wallet,
      payee: hire.payee,
      token: { mint: hire.mint, decimals: hire.decimals, programId: await s.programOfMint(cfg, conn, hire.mint) },
      amountBase: BigInt(hire.amount_base),
      memo: `ndu-hire:${hire.id}`,
    };
    const result = await s.relayAndVerify(conn, data.signedTx, transfer);
    const sql = await getSql();
    if (result.ok) {
      const note = cfg.dispatcherUrl
        ? "Paid on devnet. Next: sign once more (no gas) to queue the job on NeuraNet."
        : "Paid on devnet. Dispatcher not connected — no compute job was queued.";
      await sql`update compute_hires set tx_signature = ${result.signature}, status = 'paid_devnet', note = ${note}, updated_at = now()
        where id = ${hire.id} and user_id = ${context.userId}`;
    } else if (result.signature) {
      await sql`update compute_hires set tx_signature = ${result.signature}, note = ${result.reason}, updated_at = now()
        where id = ${hire.id} and user_id = ${context.userId} and tx_signature is null`;
    }
    const fresh = await loadHire(context.userId, hire.id);
    return result.ok ? { ok: true as const, hire: publicHire(fresh!) } : { ok: false as const, reason: result.reason, hire: publicHire(fresh!) };
  });

/** Re-check a relayed transfer that wasn't confirmed yet. */
export const recheckHire = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 64) }))
  .handler(async ({ context, data }) => {
    const hire = await loadHire(context.userId, data.id);
    if (!hire || !hire.tx_signature || !hire.payee || hire.status === "paid_devnet") {
      return { ok: false as const, reason: "Nothing to re-check." };
    }
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    const conn = await s.devnet(cfg);
    const res = await s.verifyLanded(conn, hire.tx_signature, {
      from: hire.wallet,
      payee: hire.payee,
      token: { mint: hire.mint, decimals: hire.decimals, programId: await s.programOfMint(cfg, conn, hire.mint) },
      amountBase: BigInt(hire.amount_base),
      memo: `ndu-hire:${hire.id}`,
    });
    if (res.ok) {
      const sql = await getSql();
      await sql`update compute_hires set status = 'paid_devnet', note = 'Paid on devnet.', updated_at = now()
        where id = ${hire.id} and user_id = ${context.userId}`;
    }
    return res.ok ? { ok: true as const } : { ok: false as const, reason: res.reason };
  });

export const cancelHire = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 64) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update compute_hires set status = 'cancelled', updated_at = now()
      where id = ${data.id} and user_id = ${context.userId} and status in ('intent', 'signed') and tx_signature is null`;
    return { ok: true as const };
  });

// ── Queue a paid hire on the NeuraNet dispatcher (off-chain, wallet-signed) ──

/** Step 4a: build the dispatcher's canonical create_job message for the user to sign (no gas). */
export const prepareDispatcherJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 64) }))
  .handler(async ({ context, data }) => {
    const hire = await loadHire(context.userId, data.id);
    if (!hire || hire.status !== "paid_devnet" || !hire.tx_signature) return { ok: false as const, reason: "Only a hire paid on devnet can be queued." };
    if (hire.dispatcher_job_id) return { ok: false as const, reason: "This hire is already queued on NeuraNet." };
    const s = await import("./neura.server");
    const cfg = await s.loadConfig();
    if (!cfg.dispatcherUrl) return { ok: false as const, reason: "The NeuraNet dispatcher isn't connected." };
    const kind = s.jobKindFor(hire.offer_id);
    if (!kind) return { ok: false as const, reason: "Sample (mock) listings can't be queued on NeuraNet." };
    const nonce = Date.now();
    const message = s.dispatcherCreateJobMessage(
      { kind, reward: Number(hire.amount_base), chainJobId: null, externalRef: `ndu-hire:${hire.id} devnet-tx:${hire.tx_signature}` },
      nonce,
    );
    const sql = await getSql();
    await sql`update compute_hires set dispatcher_message = ${message}, updated_at = now()
      where id = ${hire.id} and user_id = ${context.userId}`;
    return { ok: true as const, message };
  });

/** Step 4b: the user signed the dispatcher message; relay it to POST /jobs. */
export const queueDispatcherJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; signature: string }) => ({ id: str(input?.id, 64), signature: str(input?.signature, 200) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ dispatcher_message: string | null }>`
      select dispatcher_message from compute_hires where id = ${data.id} and user_id = ${context.userId}`;
    const hire = await loadHire(context.userId, data.id);
    const message = rows[0]?.dispatcher_message;
    if (!hire || !message || hire.status !== "paid_devnet" || hire.dispatcher_job_id) {
      return { ok: false as const, reason: "Prepare the NeuraNet job first." };
    }
    const s = await import("./neura.server");
    if (!s.verifyMessageSignature(message, data.signature, hire.wallet)) {
      return { ok: false as const, reason: "The signature didn't match your linked wallet." };
    }
    const m = /^Neuranet create_job\n(.*)\nnonce:(\d+)$/s.exec(message);
    if (!m) return { ok: false as const, reason: "Stored job message is malformed." };
    const payload = JSON.parse(m[1]) as { kind: string; reward: number; chainJobId: null; externalRef: string };
    const cfg = await s.loadConfig();
    const res = await s.dispatcherCreateJob(cfg, { ...payload, wallet: hire.wallet, nonce: Number(m[2]), signature: data.signature });
    if (!res.ok) return { ok: false as const, reason: res.reason };
    await sql`update compute_hires set dispatcher_job_id = ${res.id},
      note = ${`Paid on devnet · queued on NeuraNet as job #${res.id} (off-chain). No node has picked it up yet.`}, updated_at = now()
      where id = ${hire.id} and user_id = ${context.userId}`;
    return { ok: true as const, jobId: res.id };
  });
