/**
 * NDU property commitments (plan D3) — ONE isomorphic implementation for browser and server
 * (WebCrypto `crypto.subtle`, available in browsers and Node 22). No imports, so Node's
 * `--experimental-strip-types` test runner can load it directly.
 *
 *   file_digest = SHA-256(stored_bytes)                                   (hex)
 *   commitment  = SHA-256("ndu.commit.v1|" + kind + "|" || salt_32B || file_digest_32B)   (hex)
 *
 * One random 32-byte salt per (item, kind); salts are stored encrypted server-side and are never
 * logged. The salt is what makes a commitment safe to publish: without it, low-entropy inputs
 * (a geohash, a group id) could be brute-forced from the hash.
 */

export const COMMIT_DOMAIN = "ndu.commit.v1";
export const COMMIT_KINDS = ["receipt", "photo", "scan", "geo", "group"] as const;
export type CommitKind = (typeof COMMIT_KINDS)[number];
export const SALT_BYTES = 32;

const utf8 = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is not available here");
  return c.subtle;
}

/** Copy into a fresh ArrayBuffer-backed view (keeps WebCrypto's BufferSource typing happy). */
function own(bytes: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) throw new Error("Not lowercase hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const isHex64 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

export async function sha256(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", own(bytes)));
}

export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  return toHex(await sha256(bytes));
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Hex(utf8.encode(text));
}

/** SHA-256 of the bytes that are actually stored (photos: after EXIF stripping). */
export const fileDigest = sha256Hex;

/** 32 CSPRNG bytes. Never log these. */
export function newSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}

export async function commit(kind: CommitKind, salt: Uint8Array, digestHex: string): Promise<string> {
  if (!COMMIT_KINDS.includes(kind)) throw new Error("Unknown commitment kind");
  if (salt.byteLength !== SALT_BYTES) throw new Error("Salt must be 32 bytes");
  if (!isHex64(digestHex)) throw new Error("Digest must be 32-byte lowercase hex");
  const prefix = utf8.encode(`${COMMIT_DOMAIN}|${kind}|`);
  const digest = fromHex(digestHex);
  const data = new Uint8Array(prefix.byteLength + SALT_BYTES + digest.byteLength);
  data.set(prefix, 0);
  data.set(salt, prefix.byteLength);
  data.set(digest, prefix.byteLength + SALT_BYTES);
  return sha256Hex(data);
}

/** Canonical JSON: object keys sorted, no whitespace. Rejects values JSON can't represent faithfully. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("Non-finite number in canonical JSON");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
    }
    default:
      throw new Error(`Cannot canonicalize ${typeof value}`);
  }
}

export async function canonicalHash(value: unknown): Promise<string> {
  return sha256Text(canonicalJson(value));
}

export type ManifestFile = { role: string; format: string; bytes: number; sha256: string };

/**
 * Canonical scan manifest `{files:[{role, format, bytes, sha256}]}` sorted by role. Placement is NOT
 * part of it (that goes into the geo commitment). Its SHA-256 is the scan commitment's digest.
 */
export async function scanManifest(files: ManifestFile[]): Promise<{ json: string; digest: string }> {
  const sorted = [...files]
    .map((f) => ({ role: f.role, format: f.format, bytes: f.bytes, sha256: f.sha256 }))
    .sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
  const json = canonicalJson({ files: sorted });
  return { json, digest: await sha256Text(json) };
}

const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash. Precision 7 ≈ 153 m × 153 m: "about one building block". */
export function geohash(lat: number, lng: number, precision = 7): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Bad coordinate");
  }
  const la = [-90, 90];
  const lo = [-180, 180];
  let out = "";
  let bits = 0;
  let ch = 0;
  let even = true;
  while (out.length < precision) {
    const range = even ? lo : la;
    const v = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (v >= mid) {
      ch = ch * 2 + 1;
      range[0] = mid;
    } else {
      ch *= 2;
      range[1] = mid;
    }
    even = !even;
    bits += 1;
    if (bits === 5) {
      out += B32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return out;
}

/** Digest fed into the geo commitment: building-level (geohash-7) only, never the precise spot. */
export async function geoDigest(lat: number, lng: number): Promise<string> {
  return sha256Text(`ndu.geo.v1|${geohash(lat, lng, 7)}`);
}

/** Digest fed into the owner-group commitment (the group id never appears on-chain). */
export async function groupDigest(groupId: string): Promise<string> {
  return sha256Text(`ndu.group.v1|${groupId}`);
}

/** Hash of a public metadata object = SHA-256 of its canonical JSON bytes (what the URI names). */
export const metadataJsonHash = canonicalHash;
