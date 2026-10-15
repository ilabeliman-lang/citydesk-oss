import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeVerdict,
  findMatches,
  hamming,
  isPhash,
  phashRgba,
  resizeGray,
  SAME_PICTURE_BITS,
} from "./phash.ts";

/** Deterministic "photo": smooth shapes + texture, so it behaves like a real picture under resize/noise. */
function scene(
  w: number,
  h: number,
  seed: number,
  opts: { brighten?: number; noise?: number; shiftX?: number } = {},
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const blobs = Array.from({ length: 6 }, () => ({
    x: rnd(),
    y: rnd(),
    r: 0.08 + rnd() * 0.25,
    c: [rnd() * 255, rnd() * 255, rnd() * 255],
  }));
  let n = seed * 7 + 1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = (x + (opts.shiftX ?? 0)) / w;
      const v = y / h;
      let r = 40 + 120 * v;
      let g = 60 + 80 * u;
      let b = 90;
      for (const bl of blobs) {
        const d = Math.hypot(u - bl.x, v - bl.y);
        if (d < bl.r) [r, g, b] = bl.c;
      }
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      const jitter = opts.noise ? ((n % 1000) / 1000 - 0.5) * opts.noise : 0;
      const p = (y * w + x) * 4;
      px[p] = r + (opts.brighten ?? 0) + jitter;
      px[p + 1] = g + (opts.brighten ?? 0) + jitter;
      px[p + 2] = b + (opts.brighten ?? 0) + jitter;
      px[p + 3] = 255;
    }
  }
  return px;
}

describe("pHash dedupe (#2)", () => {
  const a = phashRgba(scene(400, 300, 1), 400, 300);
  it("is 64-bit hex and stable", () => {
    assert.ok(isPhash(a));
    assert.equal(phashRgba(scene(400, 300, 1), 400, 300), a);
  });
  it("matches the same picture after resize, brightening, noise and a small shift", () => {
    for (const [name, img, w, h] of [
      ["smaller", scene(200, 150, 1), 200, 150],
      ["brighter", scene(400, 300, 1, { brighten: 25 }), 400, 300],
      ["noisy", scene(400, 300, 1, { noise: 30 }), 400, 300],
      ["shifted", scene(400, 300, 1, { shiftX: 6 }), 400, 300],
    ] as const) {
      const d = hamming(a, phashRgba(img, w, h));
      assert.ok(d <= SAME_PICTURE_BITS, `${name}: ${d} bits`);
    }
  });
  it("keeps different pictures apart", () => {
    for (const seed of [2, 3, 4, 5, 6]) {
      const d = hamming(a, phashRgba(scene(400, 300, seed), 400, 300));
      assert.ok(d > SAME_PICTURE_BITS + 4, `seed ${seed}: ${d} bits`);
    }
  });
  it("area resize averages exactly", () => {
    assert.deepEqual([...resizeGray([0, 10, 20, 30], 2, 2, 1, 1)], [15]);
  });
  it("turns matches into a review verdict, never an ownership decision", () => {
    const idx = [
      { h: a, id: "e1", item: "i1", user: "u1" },
      { h: "ffffffffffffffff", id: "e2", item: "i9", user: "u9" },
    ];
    const m = findMatches(idx, a);
    assert.equal(m.length, 1);
    assert.equal(dedupeVerdict(m, { user: "u1", item: "i1" }).status, "same-item");
    assert.equal(dedupeVerdict(m, { user: "u1", item: "i2" }).status, "reused-own");
    assert.equal(dedupeVerdict(m, { user: "u2", item: "i5" }).status, "someone-else");
    assert.equal(dedupeVerdict([], { user: "u2", item: "i5" }).status, "new");
  });
});
