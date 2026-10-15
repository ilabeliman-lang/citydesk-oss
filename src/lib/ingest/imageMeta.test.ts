import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  orientationApp1,
  readExif,
  sniffImage,
  stripImageMetadata,
  stripJpegDeep,
  stripPngDeep,
  stripWebpDeep,
} from "./imageMeta.ts";

const B = (...parts: (number[] | string | Uint8Array)[]) =>
  Buffer.concat(
    parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p as number[]),
    ),
  );
const seg = (marker: number, payload: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
};
/** EXIF APP1 payload (little-endian TIFF) with Orientation + a GPS IFD pointer + a fake GPS string. */
function exifPayload(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(40, 30);
  return Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    tiff,
    Buffer.from("GPSLatitude=6.4541;GPSLongitude=3.3947", "latin1"),
  ]);
}
const JFIF = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
const ICC = seg(0xe2, Buffer.from("ICC_PROFILE\0\x01\x01fakeprofile", "latin1"));
const MPF = seg(0xe2, Buffer.from("MPF\0secondary-image-index", "latin1"));
const XMP = seg(
  0xe1,
  Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Creator=Ada</x:xmpmeta>", "latin1"),
);
const IPTC = seg(0xed, Buffer.from("Photoshop 3.0\0By-line=Ada", "latin1"));
const COM = seg(0xfe, Buffer.from("taken at home", "latin1"));
const DQT = seg(0xdb, Buffer.alloc(65, 1));
const SOS = seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0]));
const SCAN = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]); // stuffed byte + RST0 inside the scan
const EOI = Buffer.from([0xff, 0xd9]);
const TRAILER = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  seg(0xe1, exifPayload(1)),
  Buffer.from("depthmap"),
  EOI,
]);

describe("JPEG deep strip (#2)", () => {
  const jpeg = B(
    [0xff, 0xd8],
    JFIF,
    seg(0xe1, exifPayload(6)),
    XMP,
    ICC,
    MPF,
    IPTC,
    COM,
    DQT,
    SOS,
    SCAN,
    EOI,
    TRAILER,
  );
  const out = Buffer.from(stripJpegDeep(jpeg).bytes);

  it("removes GPS, EXIF, XMP, IPTC, comments, MPF and the appended images", () => {
    for (const leak of [
      "GPSLatitude",
      "Creator=Ada",
      "By-line",
      "taken at home",
      "MPF\0",
      "depthmap",
    ])
      assert.ok(!out.includes(Buffer.from(leak, "latin1")), leak);
    const res = stripJpegDeep(jpeg);
    for (const k of ["gps", "exif", "xmp", "iptc", "comment", "mpf", "trailing"])
      assert.ok(res.removed.includes(k as never), k);
  });
  it("keeps JFIF, ICC, tables and the scan data byte for byte, ending at EOI", () => {
    for (const keep of [JFIF, ICC, DQT, SOS, SCAN]) assert.ok(out.includes(keep));
    assert.deepEqual(out.subarray(-2), EOI);
  });
  it("writes back ONLY the orientation so the photo doesn't turn", () => {
    const res = stripJpegDeep(jpeg);
    assert.equal(res.orientation, 6);
    assert.ok(out.includes(Buffer.from(orientationApp1(6))));
    const app1 = out.indexOf(Buffer.from([0xff, 0xe1]));
    assert.deepEqual(readExif(out.subarray(app1 + 4, app1 + 4 + 30)), {
      orientation: 6,
      gps: false,
    });
  });
  it("is idempotent and leaves a clean photo alone", () => {
    const once = stripJpegDeep(jpeg).bytes;
    const twice = stripJpegDeep(once);
    assert.deepEqual(Buffer.from(twice.bytes), Buffer.from(once));
    const clean = B([0xff, 0xd8], JFIF, DQT, SOS, SCAN, EOI);
    assert.deepEqual(Buffer.from(stripJpegDeep(clean).bytes), clean);
    assert.deepEqual(stripJpegDeep(clean).removed, []);
  });
  it("handles progressive JPEGs (tables between scans)", () => {
    const prog = B(
      [0xff, 0xd8],
      DQT,
      SOS,
      SCAN,
      seg(0xc4, Buffer.alloc(20, 2)),
      COM,
      SOS,
      SCAN,
      EOI,
    );
    const res = Buffer.from(stripJpegDeep(prog).bytes);
    assert.equal(res.length, prog.length - COM.length);
  });
  it("refuses damaged files", () => {
    assert.throws(() => stripJpegDeep(B([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00], "short")));
  });
});

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
};

describe("PNG + WebP strip (#2)", () => {
  it("drops PNG text/eXIf/tIME chunks and data after IEND", () => {
    const png = B(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      chunk("IHDR", Buffer.alloc(13)),
      chunk("tEXt", Buffer.from("Location\0Lagos")),
      chunk("eXIf", Buffer.from("GPS")),
      chunk("tIME", Buffer.alloc(7)),
      chunk("IDAT", Buffer.from([1, 2, 3])),
      chunk("IEND", Buffer.alloc(0)),
      "zip-payload",
    );
    const res = stripPngDeep(png);
    const out = Buffer.from(res.bytes);
    assert.ok(
      !out.includes(Buffer.from("Lagos")) &&
        !out.includes(Buffer.from("zip-payload")) &&
        !out.includes(Buffer.from("tIME")),
    );
    assert.ok(out.includes(Buffer.from("IDAT")));
    assert.deepEqual(res.removed.sort(), ["exif", "text", "trailing"]);
  });
  it("drops WebP EXIF/XMP chunks, clears VP8X flags and fixes the RIFF size", () => {
    const c = (type: string, data: Buffer) => {
      const h = Buffer.alloc(8);
      h.write(type, 0, "latin1");
      h.writeUInt32LE(data.length, 4);
      return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    };
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08 | 0x04 | 0x10;
    const body = Buffer.concat([
      Buffer.from("WEBP"),
      c("VP8X", vp8x),
      c("VP8 ", Buffer.alloc(10, 9)),
      c("EXIF", Buffer.from("GPS=1,2")),
      c("XMP ", Buffer.from("<xmp/>!")),
    ]);
    const head = Buffer.alloc(8);
    head.write("RIFF", 0, "latin1");
    head.writeUInt32LE(body.length, 4);
    const res = stripWebpDeep(Buffer.concat([head, body]));
    const out = Buffer.from(res.bytes);
    assert.equal(sniffImage(out), "webp");
    assert.ok(!out.includes(Buffer.from("GPS=")) && !out.includes(Buffer.from("<xmp")));
    assert.equal(out.readUInt32LE(4), out.length - 8);
    assert.equal(out[20] & 0x0c, 0);
    assert.equal(out[20] & 0x10, 0x10);
  });
  it("passes non-images through untouched", () => {
    const pdf = Buffer.from("%PDF-1.4 /Author (me)");
    const res = stripImageMetadata(pdf);
    assert.equal(res.kind, null);
    assert.equal(res.bytes, pdf);
  });
});
