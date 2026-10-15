// NDU-UPG kids: pure logic tests (node --experimental-strip-types --test src/world/kids/kids.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCK, kick, newBody, restY, SNAP, snapTo, step } from "./blocks.ts";
import { floodFill } from "./coloring.ts";
import { checkAnswer, makeQuestion } from "./gate.ts";
import { cleanProgress, cleanSettings } from "./store.ts";
import { VERSES, verseFor } from "./verses.ts";

test("parent gate asks a real multiplication and checks it", () => {
  for (let i = 0; i < 200; i += 1) {
    const q = makeQuestion();
    assert.ok(q.a >= 3 && q.a <= 9 && q.b >= 3 && q.b <= 9);
    assert.equal(q.answer, q.a * q.b);
    assert.ok(q.answer >= 20);
    assert.ok(checkAnswer(q, String(q.answer)));
    assert.ok(!checkAnswer(q, String(q.answer + 1)));
  }
  assert.ok(!checkAnswer({ a: 3, b: 7, answer: 21 }, "21x"));
  assert.ok(!checkAnswer({ a: 3, b: 7, answer: 21 }, ""));
});

test("blocks snap onto the column and settle on the stack", () => {
  assert.equal(snapTo(1 + SNAP * 0.9, 1), 1);
  assert.equal(snapTo(1 + SNAP * 1.5, 1), 1 + SNAP * 1.5);
  let b = newBody(0, restY(3) + 1, 0);
  for (let i = 0; i < 400 && !b.resting; i += 1) b = step(b, 1 / 60, restY(3));
  assert.ok(b.resting);
  assert.ok(Math.abs(b.y - restY(3)) < 1e-9);
  assert.equal(restY(0), BLOCK / 2);
});

test("a tumble kick flies, then comes to rest on the floor inside the room", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let b = kick(newBody(0, restY(5), 0), 5, rand);
  assert.ok(b.vy > 0 && !b.resting);
  for (let i = 0; i < 2000 && !b.resting; i += 1) b = step(b, 1 / 60, BLOCK / 2);
  assert.ok(b.resting);
  assert.ok(Math.abs(b.x) <= 2.5 && b.z >= -2.1 && b.z <= 2.3);
});

test("flood fill stays inside the outline", () => {
  const w = 20;
  const h = 20;
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  // dark square outline from (5,5) to (14,14)
  for (let i = 5; i <= 14; i += 1)
    for (const [x, y] of [
      [i, 5],
      [i, 14],
      [5, i],
      [14, i],
    ]) {
      const k = (y * w + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = 20;
    }
  const n = floodFill(d, w, h, 10, 10, [255, 0, 0]);
  assert.equal(n, 8 * 8);
  assert.deepEqual([...d.slice((10 * w + 10) * 4, (10 * w + 10) * 4 + 3)], [255, 0, 0]);
  assert.deepEqual([...d.slice((2 * w + 2) * 4, (2 * w + 2) * 4 + 3)], [255, 255, 255]);
  assert.equal(floodFill(d, w, h, 5, 5, [0, 0, 255]), 0, "tapping the outline does nothing");
  assert.equal(floodFill(d, w, h, 10, 10, [255, 0, 0]), 0, "same colour is a no-op");
});

test("stored progress is clamped and junk is dropped", () => {
  const p = cleanProgress({
    stars: -4,
    meals: 2.7,
    bestTower: 999,
    fills: {
      home: [
        { x: 5, y: 6, c: "#ff0000" },
        { x: 1, y: 1, c: "javascript:" },
      ],
      "bad key": [],
    },
    extra: "x",
  });
  assert.equal(p.stars, 0);
  assert.equal(p.meals, 2);
  assert.equal(p.bestTower, 50);
  assert.deepEqual(p.fills, { home: [{ x: 5, y: 6, c: "#ff0000" }] });
  assert.deepEqual(cleanProgress("nope"), cleanProgress(null));
  assert.deepEqual(cleanSettings({ verse: false, breakMin: 99 }), { verse: false, breakMin: 0 });
  assert.deepEqual(cleanSettings(null), { verse: true, breakMin: 0 });
});

test("one bedtime verse per day", () => {
  const a = verseFor(new Date(2026, 9, 8, 19));
  assert.equal(a, verseFor(new Date(2026, 9, 8, 21)));
  assert.ok(VERSES.includes(a));
  assert.notEqual(a, verseFor(new Date(2026, 9, 9, 19)));
});

// NDU-UPG u-109: the kids "filter" is the parent gate — no content categories
// exist in src/world/kids/ (reported as a gap in the task note). These tests
// pin the gate's blocking behaviour: wrong answers, junk input, and the
// settings opt-out (verse off) are all enforced.

test("parent gate blocks everything but the exact answer", () => {
  const q = makeQuestion(() => 0.5);
  // exact answer passes
  assert.ok(checkAnswer(q, String(q.answer)));
  // every wrong number in range is blocked
  for (let wrong = 0; wrong <= 200; wrong += 1) {
    if (wrong !== q.answer) assert.ok(!checkAnswer(q, String(wrong)), `wrong=${wrong}`);
  }
  // non-numeric / empty / oversized / signed / decimal / padded input is blocked
  for (const junk of ["", "abc", "2 1", "+21", "-21", "21.0", " 21", "21 ", "0x15", "21e0", "٢١", "1234"]) {
    assert.ok(!checkAnswer(q, junk), `junk=${JSON.stringify(junk)}`);
  }
  // a different question's answer does not open this one
  const other = makeQuestion(() => 0.9);
  if (other.answer !== q.answer) assert.ok(!checkAnswer(q, String(other.answer)));
});

test("settings cleaning keeps the parent opt-out and clamps break minutes", () => {
  // verse off is the only content opt-out the module has; it must survive cleaning
  assert.deepEqual(cleanSettings({ verse: false, breakMin: 15 }), { verse: false, breakMin: 15 });
  assert.deepEqual(cleanSettings({ verse: false, breakMin: 30 }), { verse: false, breakMin: 30 });
  // absent verse = on (default), junk breakMin falls back to 0
  assert.deepEqual(cleanSettings({}), { verse: true, breakMin: 0 });
  assert.deepEqual(cleanSettings({ breakMin: 99 }), { verse: true, breakMin: 0 });
  assert.deepEqual(cleanSettings({ breakMin: "15" }), { verse: true, breakMin: 0 });
  assert.deepEqual(cleanSettings(null), { verse: true, breakMin: 0 });
  assert.deepEqual(cleanSettings("garbage"), { verse: true, breakMin: 0 });
});

test("verse rotation is deterministic and stays inside the verse list", () => {
  for (let d = 0; d < 400; d += 1) {
    const v = verseFor(new Date(Date.UTC(2026, 0, 1 + d)));
    assert.ok(VERSES.includes(v));
    assert.equal(verseFor(new Date(Date.UTC(2026, 0, 1 + d))), v); // same day, same verse
  }
});
