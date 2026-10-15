/**
 * Evidence file sniffing + metadata stripping (server-only, dependency-free so Node tests can load it).
 * Photos and image receipts lose EXIF/XMP/IPTC/text chunks (GPS, device, names) BEFORE they are
 * hashed, so the stored bytes, the digest and the commitment all describe the stripped file.
 * PDFs are stored byte-identical. Pixel data is never re-encoded here.
 */
export const EVIDENCE_MIMES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type EvidenceMime = (typeof EVIDENCE_MIMES)[number];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffMime(bytes: Buffer): EvidenceMime | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIG)) return "image/png";
  return null;
}

/** Drop JPEG APP1 (EXIF/XMP — GPS lives here), APP13 (IPTC) and COM segments. Image data untouched. */
export function stripJpeg(src: Buffer): Buffer {
  const out: Buffer[] = [src.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= src.length) {
    if (src[i] !== 0xff) throw new Error("That JPEG looks damaged.");
    const marker = src[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) break; // EOI
    if (marker === 0xda) {
      out.push(src.subarray(i)); // start of scan: the rest is entropy-coded image data
      return Buffer.concat(out);
    }
    const len = src.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > src.length) throw new Error("That JPEG looks damaged.");
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) out.push(src.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat([...out, src.subarray(i)]);
}

/** Drop PNG eXIf and text/time chunks (may carry location, device or names). CRCs of kept chunks are unchanged. */
export function stripPng(src: Buffer): Buffer {
  const out: Buffer[] = [src.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= src.length) {
    const len = src.readUInt32BE(i);
    const type = src.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > src.length) throw new Error("That PNG looks damaged.");
    if (!["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(type)) out.push(src.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

export function stripMetadata(mime: EvidenceMime, bytes: Buffer): Buffer {
  if (mime === "image/jpeg") return stripJpeg(bytes);
  if (mime === "image/png") return stripPng(bytes);
  return bytes;
}
