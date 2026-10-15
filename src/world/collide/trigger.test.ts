import { test } from "node:test";
import assert from "node:assert/strict";
import { armAuto, newTrigger, startCooldown, tickTrigger, type TriggerInput } from "./trigger.ts";
import { gridAStar, needsDetour } from "./route.ts";
import { probeCamera } from "./camera.ts";
import { rect, ringsWorld } from "./testutil.ts";
import type { Door } from "./types.ts";

const door = (over: Partial<Door> = {}): Door => ({ id: "n:1", colliderKey: "osm:1", edge: 0, at: { x: 0, y: 0 }, normal: { x: 0, y: -1 }, approach: { x: 0, y: -1 }, widthM: 1, kind: "yes", synthetic: false, locked: false, doorType: "", name: "Shop", level: null, wheelchair: null, ...over });
const inp = (o: Partial<TriggerInput>): TriggerInput => ({ pos: { x: 0, y: -1 }, vel: { x: 0, y: 0 }, stickHeld: false, eHeld: false, typing: false, dt: 0.05, doors: [door()], ...o });

test("approach + E enters", () => {
  const t = newTrigger();
  const a = tickTrigger(t, inp({}));
  assert.equal(a.state, "prompting");
  assert.ok(a.promptChanged);
  assert.equal(tickTrigger(t, inp({ eHeld: true })).enter, true);
});

test("walking in for 0.35 s enters; walking past sideways does not", () => {
  const t = newTrigger();
  let entered = false;
  for (let i = 0; i < 8 && !entered; i += 1) entered = tickTrigger(t, inp({ pos: { x: 0, y: -0.31 }, vel: { x: 0, y: 2 }, stickHeld: true })).enter;
  assert.ok(entered);
  const s = newTrigger();
  let side = false;
  for (let i = 0; i < 20; i += 1) side = tickTrigger(s, inp({ pos: { x: 0, y: -0.31 }, vel: { x: 2, y: 0 }, stickHeld: true })).enter || side;
  assert.equal(side, false);
});

test("locked door peeks only; typing suppresses E; cooldown blocks re-entry", () => {
  const t = newTrigger();
  tickTrigger(t, inp({ doors: [door({ locked: true })] }));
  const o = tickTrigger(t, inp({ doors: [door({ locked: true })], eHeld: true }));
  assert.equal(o.enter, false);
  assert.equal(o.peek, true);
  const u = newTrigger();
  assert.equal(tickTrigger(u, inp({ eHeld: true, typing: true })).enter, false);
  const c = newTrigger();
  startCooldown(c, "n:1");
  let blocked = true;
  for (let i = 0; i < 20; i += 1) if (tickTrigger(c, inp({ eHeld: i % 2 === 0 })).enter) blocked = false; // 1.0 s
  assert.ok(blocked);
  let later = false;
  for (let i = 0; i < 30; i += 1) later = tickTrigger(c, inp({ eHeld: i % 2 === 0 })).enter || later;
  assert.ok(later);
});

test("auto-enter on arrival (tap-to-enter)", () => {
  const t = newTrigger();
  armAuto(t, "n:1");
  assert.equal(tickTrigger(t, inp({})).enter, true);
});

test("A* around a U-shaped obstacle; needsDetour", () => {
  const w = ringsWorld([rect(-10, 5, 10, 7), rect(-10, -5, -8, 7), rect(8, -5, 10, 7)]);
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 15 };
  assert.equal(needsDetour(w, a, b), true);
  assert.equal(needsDetour(w, { x: -20, y: 0 }, { x: -20, y: 15 }), false);
  const path = gridAStar(w, a, b) ?? assert.fail("no path");
  for (let i = 1; i < path.length; i += 1) assert.equal(needsDetour(w, path[i - 1], path[i]), false);
});

test("camera probe: 20 m tower occludes, 3 m kiosk does not", () => {
  const w = ringsWorld([rect(-3, -15, 3, -12), rect(-1, -6, 1, -5)], [{ h: 20 }, { h: 3 }]);
  const p = probeCamera(w, { x: 0, y: 0 }, 0, 16, 20);
  assert.deepEqual(p.occluders, [1]);
  assert.ok(p.boomScale < 1);
  const q = probeCamera(ringsWorld([rect(-1, -6, 1, -5)], [{ h: 3 }]), { x: 0, y: 0 }, 0, 16, 20);
  assert.deepEqual(q.occluders, []);
});
