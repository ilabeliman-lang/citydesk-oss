// NDU-2 (Wei 2026-10-14: devnet only). Hard guard: mainnet is impossible in this build.
// Pure module, no RPC, so tests run under node --experimental-strip-types.
export const ALLOWED_CLUSTER = "devnet" as const;
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

/** SOLANA_CLUSTER must be unset or exactly "devnet". Anything else throws. */
export function requireDevnetCluster(value: string | undefined = typeof process !== "undefined" ? process.env.SOLANA_CLUSTER : undefined): "devnet" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "" || v === ALLOWED_CLUSTER) return ALLOWED_CLUSTER;
  throw new Error(`SOLANA_CLUSTER=${v.slice(0, 20)} is not allowed: this build is devnet only.`);
}

/** Reject any RPC URL that names mainnet (checked before the genesis-hash check, which also runs). */
export function assertNotMainnetRpc(url: string): string {
  if (/mainnet|solana-mainnet|api\.mainnet-beta/i.test(url)) throw new Error("Mainnet RPC refused: this build is devnet only.");
  return url;
}

/** The genesis hash of the connected cluster must be devnet's. */
export function assertDevnetGenesis(hash: string): void {
  if (hash === MAINNET_GENESIS) throw new Error("Connected to mainnet — refused.");
  if (hash !== DEVNET_GENESIS) throw new Error("Connected cluster is not devnet — refused.");
}

/** Memo the user signs for a property record anchor. Deterministic and short. */
export const anchorMemo = (metadataHash: string) => `NDU record v1 devnet ${metadataHash}`;
