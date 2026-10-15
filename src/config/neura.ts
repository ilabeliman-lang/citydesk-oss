/**
 * NEURA / NeuraNet integration — PUBLIC, devnet-only constants (safe in the bundle).
 *
 * This build is Solana DEVNET ONLY. There is deliberately no mainnet switch here:
 * moving to mainnet is a separate, gated change (clean mint verified on-chain,
 * escrow audit, legal review). Devnet test tokens have no value.
 *
 * Server-side overrides (payee, devnet NEURA stand-in mint, dispatcher URL) live in
 * `neura.devnet.json` at the project root or server env — see `src/world/neura.server.ts`.
 * No private keys or seed phrases are ever stored, requested, or handled by the app:
 * the user signs in their own wallet.
 */
export const NEURA_NET = {
  cluster: "devnet",
  /** Wallet Standard chain id. */
  chain: "solana:devnet",
  /** Default public devnet RPC (server-side reads + relaying user-signed devnet txs). */
  rpc: "https://api.devnet.solana.com",
  /** Solana devnet genesis hash — the server refuses any RPC that is not devnet. */
  devnetGenesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  /** Circle's devnet USDC (test token, no value). Verified on devnet 2026-10-07: 6 decimals. */
  devnetUsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  /** SPL Memo program — every hire transfer carries a memo with its hire id. */
  memoProgram: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  faucets: {
    sol: "https://faucet.solana.com",
    usdc: "https://faucet.circle.com",
  },
} as const;

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/**
 * NDU property records ("My room, on the map, with a receipt") — PUBLIC constants (safe in the bundle).
 * Devnet only. The on/off switches are SERVER env (`PROPERTY_ENABLED`, `PROPERTY_MINT_ENABLED`), read in
 * `src/world/property.server.ts` and reported to the UI by `getPropertyStatus`, so one place decides.
 * On-chain minting is NOT implemented in this build: it is blocked on the signing decision (NDU-2).
 */
export {
  ASSET_CLASSES as PROPERTY_ASSET_CLASSES,
  PROPERTY_DISCLAIMER,
  PROPERTY_SCHEMA,
  SCOPES as PROPERTY_SCOPES,
} from "@/lib/property/metadata";

export const PROPERTY = {
  cluster: "devnet",
  /** Hard cap of items recorded per room scan (NDU-20). */
  maxItemsPerScan: 3,
  /** Receipt / photo size cap (evidence is encrypted server-side, so it goes through the server). */
  maxEvidenceBytes: 10 * 1024 * 1024,
  /** Bump when the consent copy changes; users re-consent to a new version. */
  consentVersion: "2026-10-07.1",
  banner: "DEVNET · test record · not real ownership",
  /** Group invite links expire after this many hours. */
  inviteHours: 72,
} as const;
