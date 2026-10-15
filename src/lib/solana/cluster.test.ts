import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorMemo, assertDevnetGenesis, assertNotMainnetRpc, DEVNET_GENESIS, MAINNET_GENESIS, requireDevnetCluster } from "./cluster.ts";

test("SOLANA_CLUSTER: only unset or devnet", () => {
  assert.equal(requireDevnetCluster(undefined), "devnet");
  assert.equal(requireDevnetCluster(" Devnet "), "devnet");
  for (const bad of ["mainnet", "mainnet-beta", "testnet", "localnet", "devnet2"]) assert.throws(() => requireDevnetCluster(bad), /devnet only/);
});
test("mainnet RPC URLs and the mainnet genesis are refused", () => {
  assert.throws(() => assertNotMainnetRpc("https://api.mainnet-beta.solana.com"), /Mainnet/);
  assert.throws(() => assertNotMainnetRpc("https://x.helius-rpc.com/?cluster=mainnet"), /Mainnet/);
  assert.equal(assertNotMainnetRpc("https://api.devnet.solana.com"), "https://api.devnet.solana.com");
  assert.throws(() => assertDevnetGenesis(MAINNET_GENESIS), /mainnet/);
  assert.throws(() => assertDevnetGenesis("other"), /not devnet/);
  assert.doesNotThrow(() => assertDevnetGenesis(DEVNET_GENESIS));
});
test("anchor memo is deterministic and names devnet", () => {
  assert.equal(anchorMemo("ab"), "NDU record v1 devnet ab");
});
