import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coverCrop,
  decodeFaces,
  faceInput,
  gateDecision,
  nms,
  nsfwInput,
  nsfwVerdict,
  padBox,
  pixelate,
  softmax,
  NSFW_MODEL,
  FACE_MODEL,
} from "./vision.ts";

describe("on-device NSFW + face pre/post-processing (#1)", () => {
  it("builds the NSFW tensor as (x/255-0.5)/0.5 in CHW", () => {
    const px = new Uint8ClampedArray(384 * 384 * 4).fill(255);
    px[0] = 0;
    const t = nsfwInput(px);
    assert.equal(t.length, 3 * 384 * 384);
    assert.equal(t[0], -1);
    assert.equal(t[1], 1);
    assert.equal(t[384 * 384], 1);
  });
  it("builds the face tensor as (x-127)/128", () => {
    const t = faceInput(new Uint8ClampedArray(320 * 240 * 4).fill(127));
    assert.equal(t.length, 3 * 320 * 240);
    assert.ok(t.every((v) => v === 0));
  });
  it("only blocks clear NSFW; borderline passes with a note", () => {
    assert.ok(Math.abs(softmax([0, 0])[0] - 0.5) < 1e-9);
    assert.equal(nsfwVerdict([4, -2]).verdict, "block");
    assert.equal(nsfwVerdict([0.3, 0]).verdict, "borderline");
    assert.equal(nsfwVerdict([-3, 3]).verdict, "ok");
    assert.equal(gateDecision(nsfwVerdict([4, -2]), { nsfwGate: true }).allow, false);
    assert.equal(gateDecision(nsfwVerdict([4, -2]), { nsfwGate: false }).allow, true);
    const b = gateDecision(nsfwVerdict([0.3, 0]), { nsfwGate: true });
    assert.equal(b.allow, true);
    assert.ok(b.note);
    // model couldn't load (old phone, offline): fail open with a note, never strand the user
    const f = gateDecision(null, { nsfwGate: true, modelFailed: true });
    assert.equal(f.allow, true);
    assert.match(f.note ?? "", /couldn't run/);
  });
  it("decodes UltraFace boxes, drops low scores and merges overlaps", () => {
    const scores = [0.9, 0.1, 0.05, 0.95, 0.1, 0.9, 0.2, 0.8];
    const boxes = [0, 0, 1, 1, 0.1, 0.1, 0.3, 0.4, 0.11, 0.1, 0.31, 0.41, 0.6, 0.6, 0.7, 0.75];
    const faces = decodeFaces(scores, boxes, 1000, 500);
    assert.equal(faces.length, 2);
    assert.equal(Math.round(faces[0].x), 100);
    assert.equal(Math.round(faces[0].h), 150);
    assert.equal(
      nms([
        { x: 0, y: 0, w: 10, h: 10, score: 1 },
        { x: 1, y: 1, w: 10, h: 10, score: 0.5 },
      ]).length,
      1,
    );
  });
  it("pads and clamps a face box", () => {
    assert.deepEqual(padBox({ x: 5, y: 5, w: 10, h: 10, score: 1 }, 18, 100, 0.5), {
      x: 0,
      y: 0,
      w: 18,
      h: 20,
      score: 1,
    });
  });
  it("pixelates only inside the box, irreversibly", () => {
    const w = 16;
    const h = 16;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) px[i * 4] = (i * 37) % 256;
    const before = px.slice();
    pixelate(px, w, h, { x: 0, y: 0, w: 8, h: 8, score: 1 }, 2);
    const cell = new Set<number>();
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) cell.add(px[(y * w + x) * 4]);
    assert.equal(cell.size, 1);
    for (let y = 8; y < h; y += 1)
      for (let x = 0; x < w; x += 1) assert.equal(px[(y * w + x) * 4], before[(y * w + x) * 4]);
  });
  it("centre-crops without distortion", () => {
    assert.deepEqual(coverCrop(800, 400, 384, 384), { sx: 200, sy: 0, sw: 400, sh: 400 });
  });
  it("pins models by licence and hash", () => {
    assert.equal(NSFW_MODEL.licence, "Apache-2.0");
    assert.equal(FACE_MODEL.licence, "MIT");
    assert.match(NSFW_MODEL.url, /resolve\/[0-9a-f]{40}\//);
    assert.match(NSFW_MODEL.sha256, /^[0-9a-f]{64}$/);
  });
});
