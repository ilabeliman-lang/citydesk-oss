import { test } from "node:test";
import assert from "node:assert/strict";
import { magnetise, newResult, slideMove, tickStuck } from "./move.ts";
import { ejectPoint } from "./eject.ts";
import { DEFAULT_OPTS } from "./types.ts";
import { fixtureWorld, rect, ringsWorld, rng } from "./testutil.ts";

const O = DEFAULT_OPTS;
const run = (w: ReturnType<typeof ringsWorld>, p: { x: number; y: number }, d: { x: number; y: number }, frames: number) => {
  const r = newResult();
  const pos = { ...p };
  for (let i = 0; i < frames; i += 1) {
    slideMove(w, pos, d, O, r);
    pos.x = r.pos.x;
    pos.y = r.pos.y;
  }
  return pos;
};

test("head-on stop at the wall (gap = R ± 0.02)", () => {
  const w = ringsWorld([rect(0, -10, 10, 10)]);
  const p = run(w, { x: -5, y: 0 }, { x: 0.96, y: 0 }, 20);
  assert.ok(Math.abs(-p.x - O.radius) < 0.02, `x=${p.x}`);
});

test("45° slide keeps ≥ 85% of tangential speed", () => {
  const w = ringsWorld([rect(0, -100, 10, 100)]);
  const start = run(w, { x: -1, y: 0 }, { x: 0.5, y: 0 }, 5);
  const d = 0.5;
  const p = run(w, start, { x: d * Math.SQRT1_2, y: d * Math.SQRT1_2 }, 20);
  const tangential = (p.y - start.y) / 20;
  assert.ok(tangential >= 0.85 * d * Math.SQRT1_2, `tangential ${tangential}`);
});

test("concave corner: no oscillation", () => {
  const w = ringsWorld([rect(0, -10, 10, 10), rect(-10, 0, 0.01, 10)]);
  const r = newResult();
  const pos = { x: -3, y: -3 };
  const hist: { x: number; y: number }[] = [];
  for (let i = 0; i < 40; i += 1) {
    slideMove(w, pos, { x: 0.5, y: 0.5 }, O, r);
    pos.x = r.pos.x;
    pos.y = r.pos.y;
    hist.push({ ...pos });
  }
  for (let i = hist.length - 3; i < hist.length; i += 1) assert.ok(Math.hypot(hist[i].x - hist[i - 1].x, hist[i].y - hist[i - 1].y) < 1e-3);
  assert.equal(w.pointInBlocking(pos.x, pos.y), null);
});

test("convex corner wrap", () => {
  const w = ringsWorld([rect(0, 0, 10, 10)]);
  const p = run(w, { x: -2, y: 5 }, { x: 0.4, y: -0.25 }, 60);
  assert.ok(p.y < 0 && p.x > 0, `wrapped to ${p.x},${p.y}`);
});

test("5 cm wall at 0.96 m/step: no tunnelling", () => {
  const w = ringsWorld([rect(0, -20, 0.05, 20)]);
  const p = run(w, { x: -3, y: 0 }, { x: 0.96, y: 0 }, 30);
  assert.ok(p.x < 0, `x=${p.x}`);
});

test("fuzz M1: 10,000 walks x 200 frames on the fixture never end inside", () => {
  const w = fixtureWorld();
  const r = rng(1234);
  const res = newResult();
  let starts = 0;
  for (let walk = 0; walk < 10000; walk += 1) {
    const pos = { x: r() * 480 - 240, y: r() * 50 - 25 };
    if (!w.isFree(pos.x, pos.y)) continue;
    starts += 1;
    let a = r() * Math.PI * 2;
    for (let f = 0; f < 200; f += 1) {
      if (r() < 0.05) a = r() * Math.PI * 2;
      const dt = 0.008 + r() * 0.042;
      const sp = 16 + r() * 3.2;
      slideMove(w, pos, { x: Math.cos(a) * sp * dt, y: Math.sin(a) * sp * dt }, O, res);
      pos.x = res.pos.x;
      pos.y = res.pos.y;
      if (w.pointInBlocking(pos.x, pos.y)) assert.fail(`inside at walk ${walk} frame ${f}`);
    }
    if (walk >= 1999 && process.env.COLLIDE_FUZZ !== "full") break; // CI budget; COLLIDE_FUZZ=full runs all 10k
  }
  assert.ok(starts > 100);
});

test("determinism", () => {
  const w = fixtureWorld();
  const go = () => run(w, { x: -230, y: 2 }, { x: 0.7, y: 0.3 }, 300);
  assert.deepEqual(go(), go());
});

test("eject from inside a fixture building ends outside and free", () => {
  const w = fixtureWorld();
  const c = w.colliders.find((k) => k.blocking) ?? assert.fail("no collider");
  const cx = (c.bbox[0] + c.bbox[2]) / 2;
  const cy = (c.bbox[1] + c.bbox[3]) / 2;
  const at = w.pointInBlocking(cx, cy) ? { x: cx, y: cy } : { x: c.rings[0][0] + 0.5, y: c.rings[0][1] + 0.5 };
  const e = ejectPoint(w, at.x, at.y);
  assert.ok(e);
  assert.ok(w.isFree(e.x, e.y));
});

test("magnetise bends toward the path when aligned, not when crossing", () => {
  const m = magnetise(0.9, 0.3, { x: 1, y: 0 }, 1);
  assert.ok(Math.abs(m.north) < 0.3);
  assert.ok(Math.abs(Math.hypot(m.east, m.north) - Math.hypot(0.9, 0.3)) < 1e-9);
  assert.deepEqual(magnetise(0, 1, { x: 1, y: 0 }, 1), { east: 0, north: 1 });
  assert.deepEqual(magnetise(1, 0, { x: 1, y: 0 }, 5), { east: 1, north: 0 });
});

test("tickStuck fires after 1.5 s of no progress", () => {
  const s = { t: 0 };
  let fired = false;
  for (let i = 0; i < 40; i += 1) fired = tickStuck(s, 0.5, 0, 0.05) || fired;
  assert.ok(fired);
});
