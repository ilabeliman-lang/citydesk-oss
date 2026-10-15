import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TIER_LOD, lodPlan, needsReplan, type LodItem } from "./lod.ts";
import type { PropKind } from "./types.ts";

const tris = (_a: string, b: string) => (b === "near" ? 100 : b === "mid" ? 24 : 8);
const cam = { x: 0, y: 0, bearing: 0, hfov: 60 };
const at = (kind: PropKind, x: number, y: number): LodItem => ({ kind, x, y, archetype: kind === "tree" ? "crown_round" : kind === "lamp" ? "lamp_bent" : "bench_back" });
const bandOf = (plan: ReturnType<typeof lodPlan>, i: number) => {
  for (const v of plan.byArchetype.values()) for (const b of ["near", "mid", "far"] as const) if (v[b].includes(i)) return b;
  return null;
};

describe("lodPlan", () => {
  it("bands by distance per tier (in front of the camera)", () => {
    const items = [at("tree", 0, 10), at("tree", 0, 100), at("tree", 0, 300), at("tree", 0, 700), at("bench", 0, 300)];
    const A = lodPlan(items, cam, "A", { step: 0 }, tris);
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => bandOf(A, i)), ["near", "mid", "far", null, null]);
    const B = lodPlan(items, cam, "B", { step: 0 }, tris);
    assert.deepEqual([0, 1, 2].map((i) => bandOf(B, i)), ["near", "mid", null]);
  });
  it("culls behind the camera cone but keeps the immediate surroundings", () => {
    const items = [at("tree", 0, -200), at("tree", 0, -20), at("tree", 200, 1)];
    const p = lodPlan(items, cam, "A", { step: 0 }, tris);
    assert.equal(bandOf(p, 0), null);
    assert.equal(bandOf(p, 1), "near");
    assert.equal(bandOf(p, 2), null);
  });
  it("never exceeds the tri budget or instance caps", () => {
    const items: LodItem[] = [];
    for (let i = 0; i < 3000; i++) items.push(at(i % 3 === 0 ? "lamp" : i % 3 === 1 ? "tree" : "bench", ((i % 60) - 30) * 3, Math.floor(i / 60) * 3));
    for (const tier of ["A", "B"] as const) {
      const p = lodPlan(items, cam, tier, { step: 0 }, tris);
      assert.ok(p.tris <= TIER_LOD[tier].maxTris, `${tier} ${p.tris}`);
      for (const g of ["trees", "lamps", "kit", "cars"] as const) assert.ok(p.counts[g] <= TIER_LOD[tier].caps[g]);
      assert.ok(p.dropped > 0);
    }
  });
  it("drops kit before lamps", () => {
    const items: LodItem[] = [];
    for (let i = 0; i < 400; i++) items.push(at("bench", (i % 20) - 10, 5 + Math.floor(i / 20)));
    for (let i = 0; i < 400; i++) items.push(at("lamp", (i % 20) - 10, 40 + Math.floor(i / 20)));
    const p = lodPlan(items, cam, "B", { step: 0 }, tris);
    assert.equal(p.counts.lamps, 200);
    assert.ok(p.counts.kit < 120);
  });
  it("ladder steps 3/4 shrink the radii", () => {
    const items = [at("tree", 0, 80)];
    assert.equal(bandOf(lodPlan(items, cam, "A", { step: 0 }, tris), 0), "near");
    assert.equal(bandOf(lodPlan(items, cam, "A", { step: 3 }, tris), 0), "mid"); // 90 × 0.7 = 63
    assert.equal(bandOf(lodPlan([at("tree", 0, 160)], cam, "A", { step: 4 }, tris), 0), "far"); // 220 × 0.5 = 110
  });
  it("needsReplan only on 8 m / 3°", () => {
    assert.ok(needsReplan(null, cam));
    assert.ok(!needsReplan(cam, { ...cam, x: 5, bearing: 2 }));
    assert.ok(needsReplan(cam, { ...cam, x: 9 }));
    assert.ok(needsReplan(cam, { ...cam, bearing: 359 - 3 }));
    assert.ok(!needsReplan({ ...cam, bearing: 359 }, { ...cam, bearing: 1 }));
  });
});
