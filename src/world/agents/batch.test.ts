import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planBatch } from "./batch.ts";
import { planChunks } from "./chunks.ts";

describe("planBatch", () => {
  it("gives a video to exactly one of two idle GPUs", () => {
    const bytes = 2 * 1024 * 1024;
    const plan = planBatch({ kind: "video", bytes }, [
      { id: "gpu-a", kind: "gpu", maxChunkBytes: 8 * 1024 * 1024, idle: true },
      { id: "gpu-b", kind: "gpu", maxChunkBytes: 8 * 1024 * 1024, idle: true },
    ]);
    assert.equal(plan.assignments.length, 1);
    assert.equal(plan.assignments[0].bytes, bytes);
    assert.equal(plan.unassigned, 0);
    assert.ok(plan.assignments[0].unitId === "gpu-a" || plan.assignments[0].unitId === "gpu-b");
  });

  it("leaves a video unassigned when only a CPU is offered", () => {
    const bytes = 1024 * 1024;
    const plan = planBatch({ kind: "video", bytes }, [
      { id: "cpu", kind: "cpu", maxChunkBytes: 1024 * 1024, idle: true },
    ]);
    assert.deepEqual(plan.assignments, []);
    assert.equal(plan.unassigned, bytes);
    assert.match(plan.reason, /video waits for one GPU/);
  });

  it("skips a busy GPU", () => {
    const bytes = 1024 * 1024;
    const plan = planBatch({ kind: "video", bytes }, [
      { id: "busy", kind: "gpu", maxChunkBytes: 8 * 1024 * 1024, idle: false },
      { id: "idle", kind: "gpu", maxChunkBytes: 8 * 1024 * 1024, idle: true },
    ]);
    assert.equal(plan.assignments.length, 1);
    assert.equal(plan.assignments[0].unitId, "idle");
    assert.equal(plan.assignments[0].bytes, bytes);
    assert.equal(plan.unassigned, 0);
  });

  it("does not split a video that no single GPU can hold", () => {
    const bytes = 12 * 1024 * 1024;
    const plan = planBatch({ kind: "video", bytes }, [
      { id: "gpu-a", kind: "gpu", maxChunkBytes: 8 * 1024 * 1024, idle: true },
      { id: "gpu-b", kind: "gpu", maxChunkBytes: 8 * 1024 * 1024, idle: true },
    ]);
    assert.deepEqual(plan.assignments, []);
    assert.equal(plan.unassigned, bytes);
    assert.match(plan.reason, /video waits for one GPU/);
  });

  it("delegates a tile to planChunks", () => {
    const job = { kind: "tile" as const, bytes: 80 * 1024 };
    const units = [
      { id: "phone", kind: "phone" as const, maxChunkBytes: 64 * 1024, idle: true },
      { id: "cpu", kind: "cpu" as const, maxChunkBytes: 1024 * 1024, idle: true },
    ];
    assert.deepEqual(planBatch(job, units), planChunks(job, units));
  });
});
