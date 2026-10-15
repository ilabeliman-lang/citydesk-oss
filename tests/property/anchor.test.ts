/**
 * NDU devnet anchor: the signed-bytes check accepts only our one-memo tx, paid + signed by the claimant.
 * Keys here are throwaway, generated in-memory by the TEST only (the app never generates keys).
 */
import { it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
process.env.DATABASE_URL ||= "postgres://ci@127.0.0.1:9/ndu_ci_unused";

it("checkSignedAnchor: good tx passes; wrong payer, extra ix, wrong memo, unsigned all fail", async () => {
  const { anchorInstruction, checkSignedAnchor } = await import("../../src/world/property-anchor.server.ts");
  const user = Keypair.generate();
  const other = Keypair.generate();
  const hash = "a".repeat(64);
  const bh = "11111111111111111111111111111111";
  const mk = (payer = user, memoHash = hash, extra = false) => {
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash: bh, lastValidBlockHeight: 1 }).add(anchorInstruction(payer.publicKey, memoHash));
    if (extra) tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: other.publicKey, lamports: 1 }));
    tx.sign(payer);
    return tx.serialize().toString("base64");
  };
  assert.ok(checkSignedAnchor(mk(), user.publicKey.toBase58(), hash));
  assert.throws(() => checkSignedAnchor(mk(other), user.publicKey.toBase58(), hash), /fee payer/);
  assert.throws(() => checkSignedAnchor(mk(user, hash, true), user.publicKey.toBase58(), hash), /Unexpected/);
  assert.throws(() => checkSignedAnchor(mk(user, "b".repeat(64)), user.publicKey.toBase58(), hash), /anchor/);
  const unsigned = new Transaction({ feePayer: user.publicKey, blockhash: bh, lastValidBlockHeight: 1 }).add(anchorInstruction(user.publicKey, hash));
  assert.throws(() => checkSignedAnchor(unsigned.serialize({ requireAllSignatures: false }).toString("base64"), user.publicKey.toBase58(), hash), /signature/);
});

it("anchoring refuses when the flag is off or the cluster is not devnet", async () => {
  const { prepareAnchor } = await import("../../src/world/property-anchor.server.ts");
  const sql = (() => { throw new Error("db must not be reached"); }) as never;
  delete process.env.PROPERTY_MINT_ENABLED;
  await assert.rejects(prepareAnchor(sql, "u", "i"), /switched off/);
  process.env.PROPERTY_MINT_ENABLED = "true";
  process.env.SOLANA_CLUSTER = "mainnet-beta";
  await assert.rejects(prepareAnchor(sql, "u", "i"), /devnet only/);
  delete process.env.SOLANA_CLUSTER;
  delete process.env.PROPERTY_MINT_ENABLED;
});
