// NDU-UPG u-114: gate unit tests. The gates are pure state resolvers
// (resolveSignInGateState for the auth gate, ageAllowed for the age gate);
// the React wrappers in src/lib/auth/gates.tsx and src/game/AgeGate.tsx are
// thin renders over these states, so the behaviour under test lives here.
// House pattern: plain node --test, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageAllowed } from "./age.ts";
import { resolveSignInGateState } from "../../lib/auth/sign-in-gate.ts";

// ── age gate ────────────────────────────────────────────────────────────────

test("age gate: 18+ passes, under-18 and missing are blocked", () => {
  assert.equal(ageAllowed(18), true);
  assert.equal(ageAllowed(99), true);
  assert.equal(ageAllowed(17), false);
  assert.equal(ageAllowed(0), false);
  assert.equal(ageAllowed(null), false);
  assert.equal(ageAllowed(17.9), false);
  assert.equal(ageAllowed(18.0), true);
  // junk that could arrive from storage or a query param
  assert.equal(ageAllowed(Number.NaN), false);
  assert.equal(ageAllowed(Number.POSITIVE_INFINITY), true); // >= 18 is all the gate checks
});

test("age gate: the boundary is exactly 18", () => {
  assert.equal(ageAllowed(17.999999), false);
  assert.equal(ageAllowed(18.000001), true);
});

// ── sign-in gate state resolver ─────────────────────────────────────────────

test("sign-in gate: pending state wins over everything (no signed-out flash)", () => {
  // While the session resolves, the state is "pending" even with no user —
  // gates render nothing in this state so a hard reload doesn't flash signed-out.
  assert.equal(resolveSignInGateState({ isPending: true, hasUser: false }), "pending");
  assert.equal(resolveSignInGateState({ isPending: true, hasUser: true }), "pending");
});

test("sign-in gate: resolved states reflect the user", () => {
  assert.equal(resolveSignInGateState({ isPending: false, hasUser: true }), "signed_in");
  assert.equal(resolveSignInGateState({ isPending: false, hasUser: false }), "signed_out");
});

test("sign-in gate: state is one of the three the components switch on", () => {
  const states = new Set(
    [
      { isPending: true, hasUser: true },
      { isPending: true, hasUser: false },
      { isPending: false, hasUser: true },
      { isPending: false, hasUser: false },
    ].map((i) => resolveSignInGateState(i)),
  );
  assert.deepEqual([...states].sort(), ["pending", "signed_in", "signed_out"]);
});
