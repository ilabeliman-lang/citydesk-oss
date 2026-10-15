/**
 * CIDv1 for exact bytes: raw codec (0x55), sha2-256.
 * The same address Kubo returns from `ipfs block put --cid-codec=raw`.
 * This does not pin, upload, or talk to a network.
 */
import { sha256 } from "./commit.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes: Uint8Array): string {
  let value = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** The IPFS content id of these exact bytes. */
export async function contentId(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(bytes);
  const cid = new Uint8Array(4 + digest.byteLength);
  cid[0] = 0x01;
  cid[1] = 0x55;
  cid[2] = 0x12;
  cid[3] = 0x20;
  cid.set(digest, 4);
  return `b${base32(cid)}`;
}
