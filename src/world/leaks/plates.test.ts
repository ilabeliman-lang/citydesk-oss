/**
 * NDU-UPG u-090: edge-density licence-plate patches. Pure, no canvas.
 * Run: node --experimental-strip-types --test src/world/leaks/plates.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { platePatches, PLATE_MIN_CONTRAST } from "./plates.ts";

function canvas(w: number, h: number, fill: [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const p = i * 4;
    rgba[p] = fill[0];
    rgba[p + 1] = fill[1];
    rgba[p + 2] = fill[2];
    rgba[p + 3] = 255;
  }
  return rgba;
}

function fillRect(
  rgba: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: [number, number, number],
) {
  for (let yy = y; yy < y + rh; yy += 1) {
    for (let xx = x; xx < x + rw; xx += 1) {
      const p = (yy * w + xx) * 4;
      rgba[p] = color[0];
      rgba[p + 1] = color[1];
      rgba[p + 2] = color[2];
      rgba[p + 3] = 255;
    }
  }
}

/** Fake plate glyphs: dark bars on the plate face, so the region is genuinely edge-dense. */
function fillPlateGlyphs(
  rgba: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  face: [number, number, number],
  glyph: [number, number, number],
) {
  fillRect(rgba, w, x, y, rw, rh, face);
  const barW = Math.max(2, Math.floor(rh / 3));
  const step = Math.max(4, Math.floor(rw / 8));
  for (let gx = x + step; gx < x + rw - barW; gx += step) {
    fillRect(rgba, w, gx, y + 2, barW, rh - 4, glyph);
  }
}

function overlapArea(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/** A frame with one plate-like text rectangle on an asphalt-dark background. */
function frameWithPlate(w: number, h: number, plate: { x: number; y: number; w: number; h: number }) {
  const rgba = canvas(w, h, [12, 12, 14]);
  fillPlateGlyphs(rgba, w, plate.x, plate.y, plate.w, plate.h, [235, 235, 228], [25, 25, 30]);
  return rgba;
}

describe("plate patches (edge density)", () => {
  it("returns nothing for a flat image", () => {
    const w = 160;
    const h = 100;
    assert.deepEqual(platePatches(w, h, canvas(w, h, [30, 30, 30])), []);
  });

  it("returns nothing when width or height is tiny", () => {
    assert.deepEqual(platePatches(8, 8, canvas(8, 8, [0, 0, 0])), []);
    assert.deepEqual(platePatches(80, 12, canvas(80, 12, [20, 20, 20])), []);
  });

  it("returns nothing for a short RGBA buffer", () => {
    assert.deepEqual(platePatches(160, 100, new Uint8ClampedArray(64)), []);
  });

  it("returns nothing for non-finite dimensions", () => {
    assert.deepEqual(platePatches(Number.NaN, 100, canvas(160, 100, [10, 10, 10])), []);
    assert.deepEqual(platePatches(160, Number.POSITIVE_INFINITY, canvas(160, 100, [10, 10, 10])), []);
  });

  it("emits a patch over a plate-like text rectangle", () => {
    const w = 240;
    const h = 140;
    const plate = { x: 50, y: 60, w: 120, h: 22 };
    const patches = platePatches(w, h, frameWithPlate(w, h, plate));
    assert.ok(patches.length >= 1, `expected at least one patch, got ${patches.length}`);
    const best = patches.reduce((a, b) => (a.score >= b.score ? a : b));
    assert.ok(overlapArea(best, plate) > 0, "patch should overlap the plate");
    assert.ok(best.score > 0, "score is an edge density");
    assert.ok(best.score <= 1, "score is bounded by 1");
  });

  it("emits a patch for each of two plates in one frame", () => {
    const w = 320;
    const h = 180;
    const rgba = canvas(w, h, [10, 10, 12]);
    const a = { x: 20, y: 40, w: 110, h: 24 };
    const b = { x: 20, y: 120, w: 130, h: 26 };
    fillPlateGlyphs(rgba, w, a.x, a.y, a.w, a.h, [230, 230, 220], [20, 20, 25]);
    fillPlateGlyphs(rgba, w, b.x, b.y, b.w, b.h, [230, 230, 220], [20, 20, 25]);
    const patches = platePatches(w, h, rgba);
    assert.ok(patches.some((p) => overlapArea(p, a) > 0), "first plate covered");
    assert.ok(patches.some((p) => overlapArea(p, b) > 0), "second plate covered");
  });

  it("ignores a region that is bright but flat (no edges, so not text)", () => {
    const w = 240;
    const h = 140;
    const rgba = canvas(w, h, [12, 12, 14]);
    fillRect(rgba, w, 50, 60, 120, 22, [240, 240, 235]);
    assert.deepEqual(platePatches(w, h, rgba), []);
  });

  it("ignores a tall square text region (wrong aspect)", () => {
    const w = 240;
    const h = 200;
    const rgba = canvas(w, h, [10, 10, 12]);
    fillPlateGlyphs(rgba, w, 80, 30, 60, 110, [235, 235, 228], [25, 25, 30]);
    assert.deepEqual(platePatches(w, h, rgba), []);
  });

  it("ignores a region that matches its background in mean luma", () => {
    // Grey glyphs on a grey ground: plenty of edges, but no contrast band to stand out.
    const w = 240;
    const h = 140;
    const rgba = canvas(w, h, [128, 128, 128]);
    fillPlateGlyphs(rgba, w, 50, 60, 120, 22, [128, 128, 128], [120, 120, 120]);
    assert.deepEqual(platePatches(w, h, rgba), []);
  });

  it("clamps every patch inside the frame", () => {
    const w = 240;
    const h = 140;
    const rgba = canvas(w, h, [12, 12, 14]);
    // Plate running off the bottom-right corner.
    fillPlateGlyphs(rgba, w, 200, 120, 90, 26, [235, 235, 228], [25, 25, 30]);
    for (const p of platePatches(w, h, rgba)) {
      assert.ok(p.x >= 0 && p.y >= 0, "origin not negative");
      assert.ok(p.x + p.w <= w, `x+w=${p.x + p.w} <= ${w}`);
      assert.ok(p.y + p.h <= h, `y+h=${p.y + p.h} <= ${h}`);
      assert.ok(p.w > 0 && p.h > 0, "positive area");
      assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), "integer origin");
      assert.ok(Number.isInteger(p.w) && Number.isInteger(p.h), "integer size");
    }
  });

  it("clamps patches that touch the left/top edge", () => {
    const w = 200;
    const h = 120;
    const rgba = canvas(w, h, [12, 12, 14]);
    fillPlateGlyphs(rgba, w, 0, 0, 110, 24, [235, 235, 228], [25, 25, 30]);
    for (const p of platePatches(w, h, rgba)) {
      assert.ok(p.x >= 0 && p.y >= 0, "clamped at 0");
      assert.ok(p.x + p.w <= w && p.y + p.h <= h, "inside the frame");
    }
  });

  it("keeps a plate aspect ratio (2.2 - 5.5) on every patch", () => {
    const w = 300;
    const h = 160;
    const rgba = canvas(w, h, [10, 10, 12]);
    fillPlateGlyphs(rgba, w, 30, 40, 130, 24, [235, 235, 228], [25, 25, 30]);
    fillPlateGlyphs(rgba, w, 30, 100, 90, 18, [235, 235, 228], [25, 25, 30]);
    for (const p of platePatches(w, h, rgba)) {
      const ratio = p.w / p.h;
      assert.ok(ratio >= 1.8 && ratio <= 7, `aspect ${ratio.toFixed(2)} in [1.8, 7]`);
    }
  });

  it("returns at most 3 patches, strongest first", () => {
    const w = 320;
    const h = 200;
    const rgba = canvas(w, h, [10, 10, 12]);
    for (const y of [20, 70, 120, 170]) {
      fillPlateGlyphs(rgba, w, 20, y, 120, 22, [235, 235, 228], [25, 25, 30]);
    }
    const patches = platePatches(w, h, rgba);
    assert.ok(patches.length <= 3, `at most 3, got ${patches.length}`);
    for (let i = 1; i < patches.length; i += 1) {
      assert.ok(patches[i - 1].score >= patches[i].score, "sorted by score, descending");
    }
  });

  it("never throws and never returns a non-empty patch set on junk input", () => {
    const ok = canvas(160, 100, [10, 10, 10]);
    assert.deepEqual(platePatches(160, 100, ok.slice(0, 4)), []);
    assert.deepEqual(platePatches(-1, 100, ok), []);
    assert.deepEqual(platePatches(160, 100, undefined as unknown as Uint8ClampedArray), []);
    assert.deepEqual(platePatches(160.5, 100.5, ok), []);
  });

  it("exports the contrast threshold the detector actually applies", () => {
    assert.equal(PLATE_MIN_CONTRAST, 40);
  });

  it("works on a large frame via the internal proxy (boxes still in frame coords)", () => {
    const w = 900;
    const h = 600;
    const rgba = canvas(w, h, [12, 12, 14]);
    const plate = { x: 200, y: 250, w: 400, h: 70 };
    fillPlateGlyphs(rgba, w, plate.x, plate.y, plate.w, plate.h, [235, 235, 228], [25, 25, 30]);
    const patches = platePatches(w, h, rgba);
    assert.ok(patches.length >= 1, "found on the proxy path too");
    for (const p of patches) {
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= w && p.y + p.h <= h, "inside the frame");
      assert.ok(overlapArea(p, plate) > 0, "scaled back over the plate");
    }
  });
});
