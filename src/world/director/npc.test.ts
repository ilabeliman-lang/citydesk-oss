import assert from "node:assert/strict";
import { test } from "node:test";
import { cityBeat } from "./npc.ts";

test("7 to 9 is commute", () => {
  assert.equal(cityBeat(7), "commute");
  assert.equal(cityBeat(8), "commute");
  assert.equal(cityBeat(9), "commute");
});

test("10 to 16 is errands", () => {
  for (let hour = 10; hour <= 16; hour++) {
    assert.equal(cityBeat(hour), "errands", String(hour));
  }
});

test("17 to 19 is commute", () => {
  assert.equal(cityBeat(17), "commute");
  assert.equal(cityBeat(18), "commute");
  assert.equal(cityBeat(19), "commute");
});

test("other hours 0..23 are quiet", () => {
  for (const hour of [0, 1, 2, 3, 4, 5, 6, 20, 21, 22, 23]) {
    assert.equal(cityBeat(hour), "quiet", String(hour));
  }
});

test("hour outside 0..23 is rejected", () => {
  assert.throws(() => cityBeat(-1), RangeError);
  assert.throws(() => cityBeat(24), RangeError);
  assert.throws(() => cityBeat(8.5), RangeError);
});

test("beat at hour 8 and hour 22", () => {
  const at8 = cityBeat(8);
  const at22 = cityBeat(22);
  assert.equal(at8, "commute");
  assert.equal(at22, "quiet");
  console.log(`hour 8 ${at8}`);
  console.log(`hour 22 ${at22}`);
});

import { beatAt, BEAT_PACE } from "./npc.ts";
import { test as t2 } from "node:test";
import assert2 from "node:assert/strict";
t2("beatAt wraps minutes and pace favours commuters", () => {
  assert2.equal(beatAt(8 * 60), "commute");
  assert2.equal(beatAt(12 * 60 + 1440), "errands");
  assert2.equal(beatAt(-60), "quiet");
  assert2.ok(BEAT_PACE.commute > BEAT_PACE.errands && BEAT_PACE.errands > BEAT_PACE.quiet);
});
