/**
 * upg-u-069: presence heartbeat debounce — at most one heartbeat per user
 * per 2 seconds. Leading edge sends now; later states coalesce and the final
 * state flushes on the trailing edge within the window.
 *
 * Run: node --experimental-strip-types --test src/world/net/presenceHeartbeat.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import { HEARTBEAT_WINDOW_MS, PresenceHeartbeat } from "./presenceHeartbeat.ts";

/** Gate with a mocked clock; `tick` advances clock and timers in lockstep. */
function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: string[] = [];
  let clock = 0;
  const gate = new PresenceHeartbeat<string, string>({
    windowMs: HEARTBEAT_WINDOW_MS,
    now: () => clock,
    send: async (payload) => {
      sent.push(payload);
      return payload;
    },
  });
  return {
    gate,
    sent,
    tick(ms: number) {
      clock += ms;
      t.mock.timers.tick(ms);
    },
  };
}

describe("presence heartbeat", () => {
  it("sends the leading edge immediately", async (t) => {
    const { gate, sent } = harness(t);
    const done = await gate.push("u1", "a");
    assert.deepEqual(sent, ["a"]);
    assert.equal(done, "a");
  });

  it("coalesces a burst into one send and flushes the final state", async (t) => {
    const { gate, sent, tick } = harness(t);
    const first = gate.push("u1", "a"); // t=0: leading edge
    assert.deepEqual(sent, ["a"]);
    const second = gate.push("u1", "b"); // t=0: coalesced, flush set for t=2000
    tick(100); // t=100
    const third = gate.push("u1", "c"); // t=100: latest state wins
    tick(400); // t=500
    assert.deepEqual(sent, ["a"]); // still just the leading edge
    tick(1500); // t=2000: window ends, trailing flush fires
    assert.deepEqual(sent, ["a", "c"]); // trailing flush = final state
    assert.equal(await second, "c");
    assert.equal(await third, "c");
    await first;
  });

  it("keeps a separate window per user", async (t) => {
    const { gate, sent } = harness(t);
    await gate.push("u1", "a");
    await gate.push("u2", "b");
    assert.deepEqual(sent, ["a", "b"]);
  });

  it("never sends more than one heartbeat per 2 seconds", async (t) => {
    const { gate, sent, tick } = harness(t);
    for (let ms = 0; ms < 10_000; ms += 100) {
      void gate.push("u1", `s${ms}`);
      tick(100);
    }
    // 100 pushes over 10s → sends at 0, 2000, 4000, 6000, 8000, 10000.
    assert.equal(sent.length, 6);
    assert.equal(sent[0], "s0");
    assert.equal(sent[sent.length - 1], "s9900"); // final state lands
  });

  it("rejects every coalesced caller when the trailing send fails", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let clock = 0;
    const gate = new PresenceHeartbeat<string, string>({
      now: () => clock,
      send: () => {
        throw new Error("offline");
      },
    });
    await assert.rejects(gate.push("u1", "a"), /offline/);
    const p1 = gate.push("u1", "b");
    const p2 = gate.push("u1", "c");
    clock += 2000;
    t.mock.timers.tick(2000);
    await assert.rejects(p1, /offline/);
    await assert.rejects(p2, /offline/);
  });
});
