/**
 * NDU-UPG 901: on-device plate bands. No model, no network.
 * Run: node --experimental-strip-types --test src/world/ingest/plates.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plateBoxes } from "./plates.ts";

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

function overlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

describe("plate boxes", () => {
  it("returns nothing for a flat image", () => {
    const w = 160;
    const h = 100;
    assert.deepEqual(plateBoxes(w, h, canvas(w, h, [30, 30, 30])), []);
  });

  it("returns nothing when width or height is tiny", () => {
    assert.deepEqual(plateBoxes(8, 8, canvas(8, 8, [0, 0, 0])), []);
    assert.deepEqual(plateBoxes(80, 12, canvas(80, 12, [20, 20, 20])), []);
  });

  it("finds one box overlapping a bright wide rectangle on a dark canvas", () => {
    const w = 200;
    const h = 120;
    const rgba = canvas(w, h, [12, 12, 14]);
    const plate = { x: 40, y: 48, w: 110, h: 18 };
    fillRect(rgba, w, plate.x, plate.y, plate.w, plate.h, [240, 240, 230]);
    const boxes = plateBoxes(w, h, rgba);
    assert.equal(boxes.length, 1);
    assert.ok(overlapArea(boxes[0], plate) > 0);
  });

  it("ignores a tall square bright region", () => {
    const w = 200;
    const h = 160;
    const rgba = canvas(w, h, [10, 10, 12]);
    fillRect(rgba, w, 70, 30, 60, 100, [250, 250, 250]);
    assert.deepEqual(plateBoxes(w, h, rgba), []);
  });
});
