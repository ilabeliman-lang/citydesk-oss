/**
 * NDU-AI safe ingest #2: image metadata strip (isomorphic: browser + Node, Uint8Array only, no deps).
 *
 * JPEG: drops APP1 (EXIF incl. GPS, XMP), APP2 except ICC_PROFILE (MPF secondary images, FlashPix),
 *   APP3–APP13 (IPTC/Photoshop in APP13), APP15, COM, and EVERYTHING after the primary image's EOI
 *   (phones append depth maps / gain maps / thumbnails there, each with its own EXIF). Keeps JFIF (APP0),
 *   ICC (APP2) and Adobe (APP14, needed for colour). If the photo had a non-default EXIF orientation, a
 *   tiny fresh EXIF block carrying ONLY the orientation tag is written back so the picture doesn't turn.
 * PNG:  drops eXIf, tEXt, zTXt, iTXt, tIME and anything after IEND.
 * WebP: drops EXIF and XMP chunks and clears their VP8X flags.
 * Pixel data is never decoded or re-encoded here, so the strip is lossless.
 */
export type ImageKind = "jpeg" | "png" | "webp";
export type MetaKind =
  "exif" | "gps" | "xmp" | "iptc" | "comment" | "mpf" | "text" | "trailing" | "other-app";
export type StripResult = {
  bytes: Uint8Array;
  kind: ImageKind | null;
  removed: MetaKind[];
  orientation: number;
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b: Uint8Array, at: number, n: number) => {
  let s = "";
  for (let i = 0; i < n && at + i < b.length; i += 1) s += String.fromCharCode(b[at + i]);
  return s;
};
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) =>
  ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u32le = (b: Uint8Array, at: number) =>
  b[at] + (b[at + 1] << 8) + (b[at + 2] << 16) + ((b[at + 3] << 24) >>> 0);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return "png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

/** Reads the EXIF orientation (1–8) and whether a GPS IFD is present from an APP1 payload. */
export function readExif(payload: Uint8Array): { orientation: number; gps: boolean } {
  const none = { orientation: 1, gps: false };
  if (ascii(payload, 0, 6) !== "Exif\0\0" || payload.length < 14) return none;
  const t = payload.subarray(6);
  const le = ascii(t, 0, 2) === "II";
  if (!le && ascii(t, 0, 2) !== "MM") return none;
  const r16 = (at: number) => (le ? t[at] | (t[at + 1] << 8) : u16be(t, at));
  const r32 = (at: number) => (le ? u32le(t, at) : u32be(t, at));
  const ifd = r32(4);
  if (ifd + 2 > t.length) return none;
  const n = r16(ifd);
  let orientation = 1;
  let gps = false;
  for (let i = 0; i < n; i += 1) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) break;
    const tag = r16(e);
    if (tag === 0x0112) {
      const v = r16(e + 8);
      if (v >= 1 && v <= 8) orientation = v;
    }
    if (tag === 0x8825) gps = true;
  }
  return { orientation, gps };
}

/** A 32-byte APP1 segment with nothing but the orientation tag (big-endian TIFF). */
export function orientationApp1(orientation: number): Uint8Array {
  const payload = [
    ...[0x45, 0x78, 0x69, 0x66, 0, 0], // "Exif\0\0"
    ...[0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8], // MM, 42, IFD0 at 8
    ...[0, 1], // one entry
    ...[0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation & 0xff, 0, 0], // Orientation SHORT x1
    ...[0, 0, 0, 0], // no next IFD
  ];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

function damaged(): never {
  throw new Error("That JPEG looks damaged.");
}

export function stripJpegDeep(src: Uint8Array): StripResult {
  const removed = new Set<MetaKind>();
  const out: Uint8Array[] = [src.subarray(0, 2)];
  let orientation = 1;
  let insertAt = -1; // where to put the orientation-only APP1 (after APP0 if present)
  let i = 2;
  let inScan = false;
  const keepSegment = (marker: number, payload: Uint8Array): boolean => {
    if (marker === 0xe0) return true; // JFIF / JFXX
    if (marker === 0xe1) {
      if (ascii(payload, 0, 6) === "Exif\0\0") {
        const ex = readExif(payload);
        if (ex.orientation !== 1) orientation = ex.orientation;
        removed.add("exif");
        if (ex.gps) removed.add("gps");
      } else if (ascii(payload, 0, 4) === "http") removed.add("xmp");
      else removed.add("other-app");
      return false;
    }
    if (marker === 0xe2) {
      if (ascii(payload, 0, 12) === "ICC_PROFILE\0") return true;
      removed.add(ascii(payload, 0, 4) === "MPF\0" ? "mpf" : "other-app");
      return false;
    }
    if (marker === 0xee) return true; // Adobe colour transform
    if (marker === 0xed) {
      removed.add("iptc");
      return false;
    }
    if (marker === 0xfe) {
      removed.add("comment");
      return false;
    }
    if (marker >= 0xe3 && marker <= 0xef) {
      removed.add("other-app");
      return false;
    }
    return true;
  };
  while (i < src.length) {
    if (inScan) {
      // entropy-coded data: copy until a real marker
      const start = i;
      while (i < src.length) {
        if (src[i] === 0xff && i + 1 < src.length) {
          const m = src[i + 1];
          if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) {
            i += 2;
            continue;
          }
          if (m === 0xff) {
            i += 1;
            continue;
          }
          break;
        }
        i += 1;
      }
      out.push(src.subarray(start, i));
      inScan = false;
      continue;
    }
    if (src[i] !== 0xff) damaged();
    const marker = src[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd9) {
      out.push(src.subarray(i, i + 2));
      i += 2;
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(src.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > src.length) damaged();
    const len = u16be(src, i + 2);
    if (len < 2 || i + 2 + len > src.length) damaged();
    const payload = src.subarray(i + 4, i + 2 + len);
    if (keepSegment(marker, payload)) {
      out.push(src.subarray(i, i + 2 + len));
      if (marker === 0xe0 && insertAt < 0) insertAt = out.length;
    }
    i += 2 + len;
    if (marker === 0xda) inScan = true;
  }
  if (i < src.length) {
    // anything after EOI that isn't just padding
    for (let k = i; k < src.length; k += 1) {
      if (src[k] !== 0x00) {
        removed.add("trailing");
        break;
      }
    }
  }
  if (orientation !== 1) out.splice(insertAt < 0 ? 1 : insertAt, 0, orientationApp1(orientation));
  return { bytes: concat(out), kind: "jpeg", removed: [...removed], orientation };
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

export function stripPngDeep(src: Uint8Array): StripResult {
  const removed = new Set<MetaKind>();
  const out: Uint8Array[] = [src.subarray(0, 8)];
  let i = 8;
  let ended = false;
  while (i + 12 <= src.length) {
    const len = u32be(src, i);
    const type = ascii(src, i + 4, 4);
    const end = i + 12 + len;
    if (end > src.length) throw new Error("That PNG looks damaged.");
    if (PNG_DROP.has(type)) removed.add(type === "eXIf" ? "exif" : "text");
    else out.push(src.subarray(i, end));
    i = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error("That PNG looks damaged.");
  if (i < src.length) removed.add("trailing");
  return { bytes: concat(out), kind: "png", removed: [...removed], orientation: 1 };
}

export function stripWebpDeep(src: Uint8Array): StripResult {
  const removed = new Set<MetaKind>();
  const kept: Uint8Array[] = [];
  let i = 12;
  const riffEnd = Math.min(src.length, 8 + u32le(src, 4));
  while (i + 8 <= riffEnd) {
    const type = ascii(src, i, 4);
    const len = u32le(src, i + 4);
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > src.length) throw new Error("That WebP looks damaged.");
    if (type === "EXIF") removed.add("exif");
    else if (type === "XMP ") removed.add("xmp");
    else {
      const chunk = src.slice(i, Math.min(end, src.length));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04); // EXIF + XMP flags
      kept.push(chunk);
    }
    i = end;
  }
  if (riffEnd < src.length) removed.add("trailing");
  const body = concat(kept);
  const head = new Uint8Array(12);
  head.set(src.subarray(0, 4), 0);
  const size = body.length + 4;
  head.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff], 4);
  head.set(src.subarray(8, 12), 8);
  return { bytes: concat([head, body]), kind: "webp", removed: [...removed], orientation: 1 };
}

/** Strip whatever image this is; non-images come back untouched with kind null. */
export function stripImageMetadata(src: Uint8Array): StripResult {
  const kind = sniffImage(src);
  if (kind === "jpeg") return stripJpegDeep(src);
  if (kind === "png") return stripPngDeep(src);
  if (kind === "webp") return stripWebpDeep(src);
  return { bytes: src, kind: null, removed: [], orientation: 1 };
}

/** Plain-words labels for the "what we removed" chips. */
export const META_LABEL: Record<MetaKind, string> = {
  gps: "Location",
  exif: "Camera details",
  xmp: "Edit history",
  iptc: "Captions & names",
  comment: "Comments",
  mpf: "Hidden extra pictures",
  text: "Text notes",
  trailing: "Hidden extra data",
  "other-app": "App data",
};
