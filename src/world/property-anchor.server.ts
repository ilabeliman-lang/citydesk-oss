// NDU-24/26-29 on DEVNET (Wei 2026-10-14). Option B from ADR 0001: the user signs in their own wallet.
// The server never generates, loads or holds a private key. It builds an UNSIGNED Memo transaction
// (fee payer = the claimant's linked wallet), checks the wallet-signed bytes are exactly that
// transaction, relays it to devnet (genesis-checked) and later confirms it.
// This is a record ANCHOR (memo of the metadata hash), not a compressed NFT; Bubblegum needs a tree
// authority and stays a follow-up.
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Sql } from "@/lib/db";
import { anchorMemo, requireDevnetCluster } from "@/lib/solana/cluster";
import { PropertyError, mintFeatureFlag } from "@/world/property.server";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

type Rec = { id: string; item_id: string; user_id: string; cluster: string; claimant_address: string; metadata_json_hash: string; mint_sig: string | null; status: string };

async function conn() {
  const s = await import("@/world/neura.server");
  return s.devnet(await s.loadConfig());
}

async function ownRecord(sql: Sql, userId: string, itemId: unknown): Promise<Rec> {
  if (!mintFeatureFlag()) throw new PropertyError("On-chain anchoring is switched off on this server.", 403);
  requireDevnetCluster();
  const rows = await sql<Rec>`select id, item_id, user_id, cluster, claimant_address, metadata_json_hash, mint_sig, status
    from property_records where item_id = ${String(itemId ?? "")} and status <> 'superseded' order by created_at desc limit 1`;
  const rec = rows[0];
  if (!rec || rec.user_id !== userId) throw new PropertyError("Unknown record.", 404);
  if (rec.cluster !== "devnet") throw new PropertyError("Only devnet records can be anchored.", 409);
  return rec;
}

export function anchorInstruction(claimant: PublicKey, metadataHash: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: claimant, isSigner: true, isWritable: false }],
    data: Buffer.from(anchorMemo(metadataHash), "utf8"),
  });
}

/** Strict check that signed bytes are our one-memo transaction, paid and signed by the claimant. */
export function checkSignedAnchor(signedB64: string, claimant: string, metadataHash: string): Transaction {
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(signedB64, "base64"));
  } catch {
    throw new PropertyError("That signed transaction couldn't be read.", 400);
  }
  if (!tx.feePayer || tx.feePayer.toBase58() !== claimant) throw new PropertyError("The fee payer must be your linked wallet.", 400);
  if (tx.instructions.length !== 1) throw new PropertyError("Unexpected instructions in the transaction.", 400);
  const ix = tx.instructions[0];
  if (!ix.programId.equals(MEMO_PROGRAM) || Buffer.from(ix.data).toString("utf8") !== anchorMemo(metadataHash)) {
    throw new PropertyError("The transaction isn't this record's anchor.", 400);
  }
  if (!tx.verifySignatures(true)) throw new PropertyError("The wallet signature doesn't verify.", 400);
  return tx;
}

export async function prepareAnchor(sql: Sql, userId: string, itemId: unknown) {
  const rec = await ownRecord(sql, userId, itemId);
  if (rec.mint_sig && rec.status !== "failed") throw new PropertyError("This record is already anchored.", 409);
  const c = await conn();
  const payer = new PublicKey(rec.claimant_address);
  if ((await c.getBalance(payer).catch(() => 0)) < 10_000) {
    throw new PropertyError("Your linked wallet needs a little devnet SOL for the fee (free at faucet.solana.com).", 409);
  }
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(anchorInstruction(payer, rec.metadata_json_hash));
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), claimant: rec.claimant_address, cluster: "devnet" as const };
}

export async function submitAnchor(sql: Sql, userId: string, itemId: unknown, signedB64: unknown) {
  const rec = await ownRecord(sql, userId, itemId);
  if (rec.mint_sig && rec.status !== "failed") throw new PropertyError("This record is already anchored.", 409);
  const tx = checkSignedAnchor(String(signedB64 ?? ""), rec.claimant_address, rec.metadata_json_hash);
  const c = await conn();
  let sig: string;
  try {
    sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  } catch (err) {
    throw new PropertyError(`Devnet refused the transaction: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`, 502);
  }
  await sql`update property_records set mint_sig = ${sig}, status = 'pending' where id = ${rec.id}`;
  return { signature: sig, status: "pending" as const, explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` };
}

/** Confirm a pending anchor (called from the verification card). Never throws. */
export async function confirmAnchor(sql: Sql, rec: { id: string; mint_sig: string | null; status: string; metadata_json_hash: string }) {
  if (!rec.mint_sig || rec.status === "confirmed" || rec.status === "finalized") return rec.status;
  try {
    const c = await conn();
    const st = (await c.getSignatureStatuses([rec.mint_sig])).value[0];
    if (!st) return rec.status;
    const next = st.err ? "failed" : st.confirmationStatus === "finalized" ? "finalized" : st.confirmationStatus === "confirmed" ? "confirmed" : "pending";
    if (next !== rec.status) await sql`update property_records set status = ${next} where id = ${rec.id}`;
    return next;
  } catch {
    return rec.status;
  }
}
