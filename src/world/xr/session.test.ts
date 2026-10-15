// NDU-UPG u-108: XR mock session tests — enter/exit lifecycle without a headset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enterXr, exitXr, type XrSessionLike, type XrSystemLike } from "./session.ts";

function mockSession(): XrSessionLike & { ended: number } {
  const s = { ended: 0, async end() { s.ended += 1; } };
  return s;
}
function mockSystem(opts: { supported?: boolean; throws?: boolean } = {}): XrSystemLike {
  return {
    isSessionSupported: async () => opts.supported ?? true,
    requestSession: async () => {
      if (opts.throws) throw new Error("NotAllowedError");
      return mockSession();
    },
  };
}

test("enter: supported system returns the session", async () => {
  const r = await enterXr(mockSystem({ supported: true }));
  assert.equal(r.ok, true);
  assert.ok(r.ok && typeof r.session.end === "function");
});

test("enter: unsupported mode yields 'unsupported', never a session", async () => {
  const r = await enterXr(mockSystem({ supported: false }));
  assert.deepEqual(r, { ok: false, reason: "unsupported" });
});

test("enter: a refused request yields 'refused', never throws", async () => {
  const r = await enterXr(mockSystem({ throws: true }));
  assert.deepEqual(r, { ok: false, reason: "refused" });
});

test("enter: no XR system yields 'no-system'", async () => {
  assert.deepEqual(await enterXr(null), { ok: false, reason: "no-system" });
  assert.deepEqual(await enterXr(undefined), { ok: false, reason: "no-system" });
  assert.deepEqual(await enterXr({}), { ok: false, reason: "no-system" });
});

test("exit: ends the session exactly once and is idempotent", async () => {
  const r = await enterXr(mockSystem());
  assert.ok(r.ok);
  const s = r.ok ? (r.session as XrSessionLike & { ended: number }) : null;
  await exitXr(s);
  assert.equal(s?.ended, 1);
  await exitXr(s); // second exit must not double-end or throw
  assert.equal(s?.ended, 1);
});

test("exit: null / already-ended / broken sessions are safe no-ops", async () => {
  await exitXr(null);
  await exitXr(undefined);
  await exitXr({ end: async () => { throw new Error("already ended"); } }); // must not throw
  await exitXr({} as XrSessionLike); // no end method
});

test("enter→exit round trip cleans up", async () => {
  const sys = mockSystem();
  const r = await enterXr(sys);
  assert.ok(r.ok);
  await exitXr(r.ok ? r.session : null);
  // a fresh enter after exit works (no leaked state)
  const r2 = await enterXr(sys);
  assert.equal(r2.ok, true);
});
