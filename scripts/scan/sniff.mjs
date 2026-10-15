// @ts-check
/**
 * NDU-UPG #354 / #379: decide a scan's real format from its bytes (never the file name),
 * and guard USDZ (a zip) against zip bombs before anything unpacks it.
 */
import { open } from "node:fs/promises";

/** Bytes to read for `sniffFormat` (zip local header + first file name). */
export const SNIFF_BYTES = 64;

/**
 * Format from the first bytes, or null when nothing matches. `.splat` has no header
 * (raw 32-byte records), so it is only accepted when the name says splat and the size fits.
 * @param {Uint8Array} head
 * @param {number} bytes total file size
 * @param {string} [claimed] extension the uploader used
 * @returns {"glb"|"gltf"|"usdz"|"ply"|"spz"|"splat"|null}
 */
export function sniffFormat(head, bytes, claimed) {
  const b = Buffer.from(head.buffer, head.byteOffset, head.byteLength);
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "glTF" && b.readUInt32LE(4) === 2) return "glb";
  if (b.length >= 30 && b.readUInt32LE(0) === 0x04034b50) {
    // USDZ: an uncompressed zip whose first entry is the root .usd/.usda/.usdc layer
    const nameLen = b.readUInt16LE(26);
    const name = b.toString("latin1", 30, Math.min(b.length, 30 + nameLen)).toLowerCase();
    return /\.usd[ac]?$/.test(name) || (nameLen > b.length - 30 && name.includes(".usd")) ? "usdz" : null;
  }
  if (b.toString("latin1", 0, 4) === "ply\n" || b.toString("latin1", 0, 5) === "ply\r\n") return "ply";
  if (b[0] === 0x1f && b[1] === 0x8b) return "spz";
  const text = b.toString("utf8").trimStart();
  if (text.startsWith("{") && /"asset"|"scenes?"|"nodes"|"meshes"|"buffers"|^\{\s*$/.test(text)) return "gltf";
  if (text.startsWith("{")) return "gltf";
  if (claimed === "splat" && bytes > 0 && bytes % 32 === 0) return "splat";
  return null;
}

/**
 * Walk a zip's central directory without extracting: count entries, sum uncompressed
 * sizes, refuse absolute/parent paths and encrypted entries.
 * @param {string} file
 * @param {{ maxEntries: number, maxUncompressed: number }} limits
 * @returns {Promise<{ ok: true, entries: string[], uncompressed: number } | { ok: false, reason: string }>}
 */
export async function inspectZip(file, limits) {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return { ok: false, reason: "The USDZ file is damaged (no zip directory)." };
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOffset === 0xffffffff) return { ok: false, reason: "Zip64 USDZ files are not supported." };
    if (count > limits.maxEntries) return { ok: false, reason: `The USDZ holds ${count} files; the limit is ${limits.maxEntries}.` };
    if (cdOffset + cdSize > size) return { ok: false, reason: "The USDZ file is damaged (bad zip directory)." };
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const entries = [];
    let total = 0;
    let at = 0;
    for (let i = 0; i < count; i += 1) {
      if (at + 46 > cd.length || cd.readUInt32LE(at) !== 0x02014b50) return { ok: false, reason: "The USDZ file is damaged." };
      const flags = cd.readUInt16LE(at + 8);
      const usize = cd.readUInt32LE(at + 24);
      const nameLen = cd.readUInt16LE(at + 28);
      const extraLen = cd.readUInt16LE(at + 30);
      const commentLen = cd.readUInt16LE(at + 32);
      const name = cd.toString("utf8", at + 46, at + 46 + nameLen);
      if (flags & 1) return { ok: false, reason: "Encrypted USDZ files are not supported." };
      if (name.startsWith("/") || name.split(/[\\/]/).includes("..")) return { ok: false, reason: "The USDZ has unsafe file paths." };
      total += usize;
      if (total > limits.maxUncompressed) return { ok: false, reason: "The USDZ unpacks too large." };
      entries.push(name);
      at += 46 + nameLen + extraLen + commentLen;
    }
    if (!entries.some((n) => /\.usd[ac]?$/i.test(n))) return { ok: false, reason: "No USD scene inside this USDZ." };
    return { ok: true, entries, uncompressed: total };
  } finally {
    await fh.close();
  }
}
