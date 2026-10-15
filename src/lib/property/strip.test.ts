import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sniffMime, stripJpeg, stripMetadata, stripPng } from "./strip.server.ts";

const seg = (marker: number, payload: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
};
// SOI, APP0 JFIF, APP1 Exif with a fake GPS tag, COM, SOS + data, EOI
const JFIF = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
const EXIF = seg(0xe1, Buffer.from("Exif\0\0GPSLatitude=52.2053;GPSLongitude=0.1218", "latin1"));
const COM = seg(0xfe, Buffer.from("taken at home", "latin1"));
const SOS = Buffer.concat([seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]), Buffer.from([0xff, 0xd9])]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8]), JFIF, EXIF, COM, SOS]);

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
};
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", Buffer.alloc(13)),
  chunk("tEXt", Buffer.from("Location\0Cambridge", "latin1")),
  chunk("eXIf", Buffer.from("GPS", "latin1")),
  chunk("IDAT", Buffer.from([1, 2, 3])),
  chunk("IEND", Buffer.alloc(0)),
]);

describe("evidence metadata stripping (NDU-21)", () => {
  it("sniffs only PDF, JPEG and PNG", () => {
    assert.equal(sniffMime(Buffer.from("%PDF-1.7\n")), "application/pdf");
    assert.equal(sniffMime(JPEG), "image/jpeg");
    assert.equal(sniffMime(PNG), "image/png");
    assert.equal(sniffMime(Buffer.from("GIF89a")), null);
  });

  it("removes EXIF (GPS) and comments from JPEG but keeps the image data", () => {
    const out = stripJpeg(JPEG);
    assert.ok(!out.includes(Buffer.from("GPSLatitude")));
    assert.ok(!out.includes(Buffer.from("taken at home")));
    assert.ok(out.includes(JFIF));
    assert.ok(out.includes(SOS));
    assert.equal(out.length, JPEG.length - EXIF.length - COM.length);
  });

  it("removes PNG text and eXIf chunks", () => {
    const out = stripPng(PNG);
    assert.ok(!out.includes(Buffer.from("Cambridge")));
    assert.ok(!out.includes(Buffer.from("eXIf")));
    assert.ok(out.includes(Buffer.from("IDAT")));
  });

  it("leaves PDFs byte-identical", () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Author (me) >> endobj\n%%EOF");
    assert.deepEqual(stripMetadata("application/pdf", pdf), pdf);
  });

  it("rejects a truncated JPEG segment", () => {
    assert.throws(() => stripJpeg(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00]), Buffer.from("short")])));
  });
});
