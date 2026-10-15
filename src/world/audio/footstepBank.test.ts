import { test } from "node:test";
import assert from "node:assert/strict";
import { createNodePool } from "./pool.ts";
import { FootstepBank, bankFor, pickVariant, sampleKey, VARIANTS } from "./footstepBank.ts";
import type { Surface } from "./footsteps.ts";

/* ------------------------------------------------------------------ pool --- */

test("pool: acquire hands out a node", () => {
  const pool = createNodePool<{ id: number }>(4);
  let made = 0;
  const node = pool.acquire(() => ({ id: ++made }));
  assert.equal(typeof node, "object");
  assert.equal(pool.created, 1);
  assert.equal(pool.idle, 0);
});

test("pool: reuses idle nodes instead of building new ones", () => {
  const pool = createNodePool<{ id: number }>(4);
  let made = 0;
  const a = pool.acquire(() => ({ id: ++made }));
  pool.release(a);
  const b = pool.acquire(() => ({ id: ++made }));
  assert.equal(a, b, "a released node comes back out");
  assert.equal(pool.created, 1, "no new node was built");
});

test("pool: idle list is capped and never grows unbounded", () => {
  const cap = 3;
  const pool = createNodePool<{ id: number }>(cap);
  let made = 0;
  const nodes = Array.from({ length: 40 }, () => pool.acquire(() => ({ id: ++made })));
  assert.equal(pool.created, 40);
  for (const n of nodes) pool.release(n);
  assert.equal(pool.idle, cap, "only `cap` nodes are retained");
  for (let i = 0; i < 50; i++) pool.release({ id: 900 + i });
  assert.equal(pool.idle, cap, "extra releases are dropped, not stored");
  const again = pool.acquire(() => ({ id: ++made }));
  assert.equal(pool.idle, cap - 1);
  assert.ok(nodes.includes(again), "the retained node is reused");
});

test("pool: a released node is reusable again later in the session", () => {
  const pool = createNodePool<{ id: number }>(2);
  let made = 0;
  const first = pool.acquire(() => ({ id: ++made }));
  pool.release(first);
  const reused = pool.acquire(() => ({ id: ++made }));
  assert.equal(reused, first, "the first idle node comes back");
  // Keep two in flight, finish them, then take from the pool again.
  const b = pool.acquire(() => ({ id: ++made }));
  const c = pool.acquire(() => ({ id: ++made }));
  pool.release(b);
  pool.release(c);
  assert.equal(pool.idle, 2, "both finished nodes are retained");
  const later = pool.acquire(() => ({ id: ++made }));
  assert.ok(later === b || later === c, "a finished node is taken again");
  assert.equal(pool.created, 3, "still only three nodes ever built");
});

/* ------------------------------------------------------------- pure voice --- */

test("bank: a step always maps to the same pre-rendered variant", () => {
  const surfaces: Surface[] = ["asphalt", "stone", "grass", "wood"];
  for (const s of surfaces) {
    const a = pickVariant(s, 0);
    assert.equal(a, pickVariant(s, 0), `${s}: step 0 is stable`);
    assert.ok(a >= 0 && a < VARIANTS, `${s}: variant in range`);
    assert.equal(sampleKey(s, a), `${s}#${a}`);
  }
});

test("bank: left and right feet land on different variants", () => {
  for (const s of ["asphalt", "stone", "grass", "wood"] as Surface[]) {
    assert.notEqual(pickVariant(s, 0), pickVariant(s, 1), `${s}: feet alternate`);
  }
});

/* -------------------------------------------------------------- fake ctx --- */

interface Counters {
  buffers: number;
  sources: number;
  gains: number;
  panners: number;
}

/** Minimal stand-in for the Web Audio nodes the bank touches. */
function fakeCtx(counters: Counters): AudioContext {
  const fake = (extra: object) => {
    const n: Record<string, unknown> = { ...extra };
    n.connect = () => n;
    n.disconnect = () => {};
    return n as unknown as AudioNode;
  };
  const ctx = {
    sampleRate: 48000,
    destination: fake({}),
    createBuffer: (ch: number, frames: number, rate: number) => {
      counters.buffers += 1;
      return {
        numberOfChannels: ch,
        length: frames,
        sampleRate: rate,
        duration: frames / rate,
        getChannelData: () => new Float32Array(frames),
      };
    },
    createGain: () => {
      counters.gains += 1;
      return fake({ gain: { value: 0 } });
    },
    createStereoPanner: () => {
      counters.panners += 1;
      return fake({ pan: { value: 0 } });
    },
    createBufferSource: () => {
      counters.sources += 1;
      const src = fake({ buffer: null, onended: null, start: () => {}, stop: () => {} });
      // Expose a way for tests to fire the end event the real API would.
      (src as unknown as { fireEnd: () => void }).fireEnd = () => {
        const cb = (src as unknown as { onended: (() => void) | null }).onended;
        if (cb) cb();
      };
      return src as unknown as AudioBufferSourceNode;
    },
  };
  return ctx as unknown as AudioContext;
}

/** Fire the end event of a source the way the real Web Audio API would. */
function endSource(src: AudioBufferSourceNode): void {
  (src as unknown as { fireEnd: () => void }).fireEnd();
}

/** ~170 steps at a natural cadence, alternating feet across two surfaces. */
const WALK: Array<{ surface: Surface; step: number }> = Array.from({ length: 170 }, (_, i) => ({
  surface: i % 7 === 0 ? "grass" : "asphalt",
  step: i,
}));

test("bank: a 60 s walk renders each sample once and builds at most one voice per cap", () => {
  const c: Counters = { buffers: 0, sources: 0, gains: 0, panners: 0 };
  const bank = new FootstepBank(fakeCtx(c), { maxIdle: 8, maxSamples: 12 });

  const sources: AudioBufferSourceNode[] = [];
  for (const { surface, step } of WALK) {
    const src = bank.play(surface, step, (step % 2 ? 1 : -1) * 0.12);
    assert.ok(src, "every step plays");
    sources.push(src!);
    // Each step's ~100 ms of audio finishes before the next one starts, so the
    // chain node is returned to the pool between steps.
    endSource(src!);
  }

  assert.equal(c.buffers, bank.cachedSamples, "no sample is rendered twice");
  assert.ok(c.buffers <= 2 * VARIANTS, `samples stay bounded (${c.buffers})`);
  assert.ok(bank.cachedSamples <= 12);
  assert.ok(bank.createdVoices <= 2, `voices are reused, not rebuilt (${bank.createdVoices})`);
  assert.equal(c.gains, bank.createdVoices, "gains come only from the pool");
  assert.ok(bank.idleVoices <= 8, "idle voices stay capped");
  assert.equal(c.sources, WALK.length, "each step gets its one-shot source node");
});

test("bank: overlapping steps share the capped pool without growing it", () => {
  const c: Counters = { buffers: 0, sources: 0, gains: 0, panners: 0 };
  const bank = new FootstepBank(fakeCtx(c), { maxIdle: 4 });

  // Steps overlap: at most `overlap` are ringing at once, and each new step
  // retires the oldest, exactly as a walk cadence would.
  const overlap = 5;
  const ringing: AudioBufferSourceNode[] = [];
  for (let i = 0; i < 170; i++) {
    const src = bank.play("asphalt", i, 0);
    assert.ok(src);
    ringing.push(src!);
    if (ringing.length > overlap) endSource(ringing.shift()!);
  }
  for (const src of ringing) endSource(src);

  assert.ok(bank.createdVoices <= 6, `voices bounded by concurrency (${bank.createdVoices})`);
  assert.ok(bank.idleVoices <= 4, "idle list capped at maxIdle");
});

test("bank: a second identical walk re-renders nothing and builds no new voices", () => {
  const c: Counters = { buffers: 0, sources: 0, gains: 0, panners: 0 };
  const bank = new FootstepBank(fakeCtx(c), { maxIdle: 8 });

  const walkOnce = () => {
    for (const { surface, step } of WALK) {
      const src = bank.play(surface, step, 0);
      if (src) endSource(src);
    }
  };
  walkOnce();
  const buffersAfterFirst = c.buffers;
  const gainsAfterFirst = c.gains;
  walkOnce();
  assert.equal(c.buffers, buffersAfterFirst, "samples are cached across walks");
  assert.equal(c.gains, gainsAfterFirst, "voices are reused across walks");
});

test("bank: endVoice returns a chain node for reuse", () => {
  const c: Counters = { buffers: 0, sources: 0, gains: 0, panners: 0 };
  const bank = new FootstepBank(fakeCtx(c), { maxIdle: 4 });
  bank.play("stone", 0, 0.2);
  assert.equal(bank.idleVoices, 0, "a playing voice is not idle");

  const voice = { gain: { value: 0 } as unknown as GainNode, panner: null };
  bank.endVoice(voice);
  assert.equal(bank.idleVoices, 1, "a released voice is held for reuse");
  for (let i = 0; i < 10; i++) bank.endVoice(voice);
  assert.equal(bank.idleVoices, 4, "idle voices stay capped at maxIdle");
});

test("bank: no context means no audio work at all", () => {
  const bank = new FootstepBank(null);
  assert.equal(bank.sample("asphalt", 0), null);
  assert.equal(bank.play("asphalt", 0, 0), null);
  assert.equal(bank.cachedSamples, 0);
  assert.equal(bank.createdVoices, 0);
  bank.dispose();
});

test("bank: DOM guard keeps node free of audio devices", () => {
  assert.equal(bankFor(null), null, "no window in node -> no bank");
});

test("bank: dispose clears every cached sample", () => {
  const c: Counters = { buffers: 0, sources: 0, gains: 0, panners: 0 };
  const bank = new FootstepBank(fakeCtx(c));
  bank.play("wood", 0, 0);
  bank.play("wood", 1, 0);
  assert.ok(bank.cachedSamples > 0);
  bank.dispose();
  assert.equal(bank.cachedSamples, 0);
});

console.log("footstep bank ok");
