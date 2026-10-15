/**
 * Client-only Solana wallet access via the Wallet Standard (Phantom, Solflare,
 * Backpack all register here). Import this module lazily — it touches `window`.
 *
 * The app NEVER sees a private key or seed phrase. It only asks the user's wallet to:
 *   - connect (share the public address),
 *   - sign a plain-text message (proof of ownership / hire intent — no tx, no gas),
 *   - sign a devnet transaction the user reviews and approves in the wallet popup.
 */
import { getWallets } from "@wallet-standard/app";

export type StdAccount = {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
};

type Feature<T> = T | undefined;
type ConnectFeature = { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly StdAccount[] }> };
type DisconnectFeature = { disconnect: () => Promise<void> };
type SignMessageFeature = {
  signMessage: (...inputs: { account: StdAccount; message: Uint8Array }[]) => Promise<{ signedMessage: Uint8Array; signature: Uint8Array }[]>;
};
type SignTransactionFeature = {
  signTransaction: (
    ...inputs: { account: StdAccount; transaction: Uint8Array; chain?: string }[]
  ) => Promise<{ signedTransaction: Uint8Array }[]>;
};

export type StdWallet = {
  name: string;
  icon: string;
  chains: readonly string[];
  features: Record<string, unknown>;
  accounts: readonly StdAccount[];
};

export function solanaWallets(): StdWallet[] {
  const { get } = getWallets();
  return (get() as unknown as StdWallet[]).filter(
    (w) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features && "solana:signMessage" in w.features,
  );
}

export function onWalletsChanged(cb: () => void): () => void {
  const api = getWallets();
  const offA = api.on("register", cb);
  const offB = api.on("unregister", cb);
  return () => {
    offA();
    offB();
  };
}

export async function connectWallet(wallet: StdWallet): Promise<StdAccount> {
  const f = wallet.features["standard:connect"] as Feature<ConnectFeature>;
  if (!f) throw new Error("This wallet can't connect.");
  const { accounts } = await f.connect();
  const acc = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!acc) throw new Error("The wallet didn't share an account.");
  return acc;
}

export async function disconnectWallet(wallet: StdWallet): Promise<void> {
  const f = wallet.features["standard:disconnect"] as Feature<DisconnectFeature>;
  await f?.disconnect().catch(() => undefined);
}

/** Sign a plain-text message. Returns the 64-byte ed25519 signature, base64. No transaction, no gas. */
export async function signText(wallet: StdWallet, account: StdAccount, text: string): Promise<string> {
  const f = wallet.features["solana:signMessage"] as Feature<SignMessageFeature>;
  if (!f) throw new Error("This wallet can't sign messages.");
  const [out] = await f.signMessage({ account, message: new TextEncoder().encode(text) });
  return toB64(out.signature);
}

/** Ask the wallet to sign (NOT send) a devnet transaction. The user reviews and approves it in the wallet. */
export async function signDevnetTransaction(wallet: StdWallet, account: StdAccount, txB64: string): Promise<string> {
  const f = wallet.features["solana:signTransaction"] as Feature<SignTransactionFeature>;
  if (!f) throw new Error("This wallet can't sign a transaction for review.");
  const [out] = await f.signTransaction({ account, transaction: fromB64(txB64), chain: "solana:devnet" });
  return toB64(out.signedTransaction);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

// ── tiny session store so the wallet + compute sheets share one connection ──

type Session = { wallet: StdWallet; account: StdAccount } | null;
let session: Session = null;
const listeners = new Set<() => void>();

export function getSession(): Session {
  return session;
}

export function setSession(next: Session) {
  session = next;
  for (const l of listeners) l();
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
