import assert from "node:assert/strict";
import { shredPlan } from "./shred.ts";

const plan = shredPlan("rec-13");
assert.equal(plan.recordId, "rec-13");
assert.equal(plan.action, "forget-key");
assert.equal(plan.keepsCiphertext, true);
assert.deepEqual(Object.keys(plan).sort(), ["action", "keepsCiphertext", "recordId"]);

for (const name of ["key", "dek", "kek", "secret", "seed", "privateKey", "storage_key", "dek_wrapped"]) {
  assert.equal(Object.hasOwn(plan, name), false, name);
}

assert.throws(() => shredPlan(""), /empty record id/);
assert.throws(() => shredPlan("   "), /empty record id/);
assert.throws(() => shredPlan("\n\t"), /empty record id/);

const kept = shredPlan("  item-9  ");
assert.equal(kept.recordId, "  item-9  ");
assert.equal(kept.action, "forget-key");
assert.equal(kept.keepsCiphertext, true);

console.log(plan.action);
