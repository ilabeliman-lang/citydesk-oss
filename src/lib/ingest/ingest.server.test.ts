import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { defaultFlags } from "./flags.ts";
import {
  forgetEvidence,
  ingestImage,
  IngestRejected,
  phashImage,
  readIndex,
} from "./ingest.server.ts";
import { hamming } from "./phash.ts";
import { readExif } from "./imageMeta.ts";

/** A real JPEG "photo" with EXIF GPS + camera tags, built with sharp. */
async function photo(seed: number, opts: { width?: number; quality?: number; gps?: boolean } = {}) {
  const w = 480;
  const h = 360;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 3;
      const blob = Math.hypot(x - ((100 + seed * 53) % w), y - ((80 + seed * 31) % h)) < 90;
      px[p] = blob ? (seed * 70) % 255 : (x * 255) / w;
      px[p + 1] = blob ? 200 : (y * 255) / h;
      px[p + 2] = blob ? (seed * 130) % 255 : 120;
    }
  }
  let img = sharp(px, { raw: { width: w, height: h, channels: 3 } });
  if (opts.width) img = img.resize(opts.width);
  img = img.jpeg({ quality: opts.quality ?? 90 }).withMetadata({ orientation: 6 });
  if (opts.gps !== false) {
    img = img.withExifMerge({
      IFD0: { Make: "NDUPhone", Model: "Test 1", Artist: "Ada Lovelace" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "6/1 27/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "3/1 23/1 0/1",
      },
    });
  }
  return img.toBuffer();
}

let dir: string;
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ndu-ingest-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("server ingest: strip + pHash dedupe (#2)", () => {
  it("strips GPS / camera / names from a real JPEG but keeps orientation and pixels", async () => {
    const raw = await photo(1);
    assert.ok(raw.includes(Buffer.from("NDUPhone")));
    const res = await ingestImage({ bytes: raw, userId: "u1", itemId: "i1", dir });
    for (const leak of ["NDUPhone", "Ada Lovelace", "Test 1"])
      assert.ok(!res.bytes.includes(Buffer.from(leak)), leak);
    assert.ok(res.review.removed.includes("gps"));
    const meta = await sharp(res.bytes).metadata();
    assert.equal(meta.orientation, 6);
    assert.equal(meta.width, 480);
    const app1 = res.bytes.indexOf(Buffer.from([0xff, 0xe1]));
    assert.equal(readExif(res.bytes.subarray(app1 + 4, app1 + 34)).gps, false);
    await res.remember("e1");
    assert.equal((await stat(path.join(dir, ".ingest", "phash.jsonl"))).mode & 0o777, 0o600);
  });

  it("matches a re-encoded, resized, metadata-free copy; tells apart a different photo", async () => {
    const a = await phashImage(await photo(1));
    const b = await phashImage(await photo(1, { width: 300, quality: 60, gps: false }));
    const c = await phashImage(await photo(4));
    assert.ok(hamming(a, b) <= 10, `copy ${hamming(a, b)}`);
    assert.ok(hamming(a, c) > 14, `different ${hamming(a, c)}`);
  });

  it("flags someone else's photo for review (default) and blocks it only when dedupeBlock is on", async () => {
    const copy = await photo(1, { width: 320, quality: 70, gps: false });
    const res = await ingestImage({ bytes: copy, userId: "u2", itemId: "i7", dir });
    assert.equal(res.review.dedupe?.status, "someone-else");
    const mine = await ingestImage({ bytes: copy, userId: "u1", itemId: "i2", dir });
    assert.equal(mine.review.dedupe?.status, "reused-own");
    const same = await ingestImage({ bytes: copy, userId: "u1", itemId: "i1", dir });
    assert.equal(same.review.dedupe?.status, "same-item");
    const flags = { ...defaultFlags(), dedupeBlock: true };
    await assert.rejects(
      ingestImage({ bytes: copy, userId: "u2", itemId: "i7", dir, flags }),
      (e) => e instanceof IngestRejected && e.status === 409,
    );
  });

  it("forgets shredded evidence", async () => {
    await forgetEvidence(dir, ["e1"]);
    assert.equal((await readIndex(dir)).length, 0);
    const res = await ingestImage({ bytes: await photo(1), userId: "u2", itemId: "i7", dir });
    assert.equal(res.review.dedupe?.status, "new");
  });

  it("an image sharp can't decode is still stripped, and dedupe stands aside instead of blocking", async () => {
    const seg = (m: number, p: Buffer) =>
      Buffer.concat([Buffer.from([0xff, m, (p.length + 2) >> 8, (p.length + 2) & 0xff]), p]);
    const fake = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      seg(0xe1, Buffer.from("Exif\0\0GPSLatitude=1", "latin1")),
      seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
      Buffer.from([0x12, 0xff, 0xd9]),
    ]);
    const res = await ingestImage({ bytes: fake, userId: "u1", itemId: "i1", dir });
    assert.ok(!res.bytes.includes(Buffer.from("GPSLatitude")));
    assert.equal(res.phash, null);
    assert.equal(res.review.dedupe, null);
  });

  it("passes PDFs through and respects the strip/dedupe flags", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%%EOF");
    const res = await ingestImage({ bytes: pdf, userId: "u1", itemId: "i1", dir });
    assert.equal(res.bytes, pdf);
    const raw = await photo(2);
    const off = await ingestImage({
      bytes: raw,
      userId: "u1",
      itemId: "i1",
      dir,
      flags: { ...defaultFlags(), stripMeta: false, dedupe: false },
    });
    assert.equal(off.bytes, raw);
    assert.equal(off.phash, null);
  });
});
