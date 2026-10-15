import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapBootInitial, mapBootShouldLoad, reduceMapBoot } from "./mapBoot.ts";

describe("map boot retry", () => {
  it("starts loading on the first attempt with no view", () => {
    const state = mapBootInitial<string>();
    assert.deepEqual(state, { phase: "loading", attempt: 1, view: null });
    assert.equal(mapBootShouldLoad(state), true);
  });

  it("a resolved import opens the map and stops loading", () => {
    const ready = reduceMapBoot(mapBootInitial<string>(), {
      type: "resolved",
      attempt: 1,
      view: "WorldMap",
    });
    assert.deepEqual(ready, { phase: "ready", attempt: 1, view: "WorldMap" });
    assert.equal(mapBootShouldLoad(ready), false);
  });

  it("a rejected import ends the spinner so the gate can offer a retry", () => {
    const failed = reduceMapBoot(mapBootInitial<string>(), { type: "rejected", attempt: 1 });
    assert.deepEqual(failed, { phase: "failed", attempt: 1, view: null });
    assert.equal(mapBootShouldLoad(failed), false);
  });

  it("retry is the only way back to loading, and it bumps the attempt", () => {
    const failed = reduceMapBoot(mapBootInitial<string>(), { type: "rejected", attempt: 1 });
    const again = reduceMapBoot(failed, { type: "retry" });
    assert.deepEqual(again, { phase: "loading", attempt: 2, view: null });
    assert.equal(mapBootShouldLoad(again), true);
    const opened = reduceMapBoot(again, { type: "resolved", attempt: 2, view: "WorldMap" });
    assert.deepEqual(opened, { phase: "ready", attempt: 2, view: "WorldMap" });
  });

  it("ignores retry unless the gate has failed, and ignores a second open", () => {
    const loading = mapBootInitial<string>();
    assert.equal(reduceMapBoot(loading, { type: "retry" }), loading);
    const ready = reduceMapBoot(loading, { type: "resolved", attempt: 1, view: "WorldMap" });
    assert.equal(reduceMapBoot(ready, { type: "retry" }), ready);
    assert.equal(reduceMapBoot(ready, { type: "resolved", attempt: 1, view: "other" }), ready);
    assert.equal(reduceMapBoot(ready, { type: "rejected", attempt: 1 }), ready);
  });

  it("drops a late result from an older attempt", () => {
    const second = reduceMapBoot(
      reduceMapBoot(mapBootInitial<string>(), { type: "rejected", attempt: 1 }),
      { type: "retry" },
    );
    assert.equal(reduceMapBoot(second, { type: "resolved", attempt: 1, view: "stale" }), second);
    assert.equal(reduceMapBoot(second, { type: "rejected", attempt: 1 }), second);
    const failedAgain = reduceMapBoot(second, { type: "rejected", attempt: 2 });
    assert.deepEqual(failedAgain, { phase: "failed", attempt: 2, view: null });
    const third = reduceMapBoot(failedAgain, { type: "retry" });
    assert.equal(third.attempt, 3);
    assert.equal(third.phase, "loading");
    assert.equal(mapBootShouldLoad(third), true);
  });

  it("does not treat an empty view as an open map", () => {
    const loading = mapBootInitial<string | null>();
    assert.equal(reduceMapBoot(loading, { type: "resolved", attempt: 1, view: null }), loading);
  });
});
