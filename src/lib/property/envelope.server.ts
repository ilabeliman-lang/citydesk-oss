/**
 * Envelope encryption for NDU property evidence, salts, labels and group names (plan D4). SERVER-ONLY.
 *
 * - Each evidence object gets its own random AES-256-GCM data key (DEK).
 * - DEKs, salts and short secrets are wrapped with the server key-encryption key `PROPERTY_KEK`
 *   (32 bytes, base64, server env only) under a key id (`PROPERTY_KEK_ID`, default "k1") for rotation.
 * - Every ciphertext is bound to its row/purpose through GCM additional data, so ciphertexts can't
 *   be swapped between items or kinds. A wrong key id, wrong AAD or tampered tag FAILS CLOSED.
 *
 * Honest limit: the server can decrypt — this is encryption at rest, not end-to-end.
 * "Delete" = destroy the wrapped DEK + salt + ciphertext (crypto-shredding).
 *
 * This is a symmetric data-at-rest key. It is NOT, and must never become, a Solana/wallet signing key.
 * The KEK value is never logged, returned, or sent to the client.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type Kek = { id: string; key: Buffer };

const WRAP_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Reads the KEK from env. Returns null (never throws, never prints the value) when missing/invalid. */
export function loadKek(env: Record<string, string | undefined> = process.env): Kek | null {
  const raw = env.PROPERTY_KEK?.trim();
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (key.length !== 32) return null;
  const id = (env.PROPERTY_KEK_ID?.trim() || "k1").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "k1";
  return { id, key };
}

function gcmSeal(key: Buffer, plain: Buffer, aad: string): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv, ct, tag: c.getAuthTag() };
}

function gcmOpen(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer, aad: string): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Wrap a small secret (DEK, salt, label, group name) with the KEK: `v1.<kid>.<iv>.<ct>.<tag>` (base64url parts). */
export function wrap(kek: Kek, plain: Buffer | Uint8Array, aad: string): string {
  const { iv, ct, tag } = gcmSeal(kek.key, Buffer.from(plain), `ndu.wrap.v1|${kek.id}|${aad}`);
  return [WRAP_VERSION, kek.id, iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export function unwrap(kek: Kek, wrapped: string, aad: string): Buffer {
  const parts = String(wrapped).split(".");
  if (parts.length !== 5 || parts[0] !== WRAP_VERSION) throw new Error("Unreadable wrapped value");
  if (parts[1] !== kek.id) throw new Error("Wrapped with a different key id");
  const [iv, ct, tag] = parts.slice(2).map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Unreadable wrapped value");
  return gcmOpen(kek.key, iv, ct, tag, `ndu.wrap.v1|${kek.id}|${aad}`);
}

export const wrapText = (kek: Kek, text: string, aad: string) => wrap(kek, Buffer.from(text, "utf8"), aad);
export const unwrapText = (kek: Kek, wrapped: string, aad: string) => unwrap(kek, wrapped, aad).toString("utf8");

/** Encrypt a blob under a fresh DEK. Stored layout: iv(12) | ciphertext | tag(16). Returns the DEK wrapped. */
export function sealBlob(kek: Kek, plain: Buffer, aad: string): { sealed: Buffer; dekWrapped: string } {
  const dek = randomBytes(32);
  const { iv, ct, tag } = gcmSeal(dek, plain, `ndu.blob.v1|${aad}`);
  const dekWrapped = wrap(kek, dek, `dek|${aad}`);
  dek.fill(0);
  return { sealed: Buffer.concat([iv, ct, tag]), dekWrapped };
}

export function openBlob(kek: Kek, sealed: Buffer, dekWrapped: string, aad: string): Buffer {
  if (sealed.length < IV_BYTES + TAG_BYTES) throw new Error("Unreadable sealed blob");
  const dek = unwrap(kek, dekWrapped, `dek|${aad}`);
  try {
    return gcmOpen(
      dek,
      sealed.subarray(0, IV_BYTES),
      sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES),
      sealed.subarray(sealed.length - TAG_BYTES),
      `ndu.blob.v1|${aad}`,
    );
  } finally {
    dek.fill(0);
  }
}
