import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLampGeometry,
  createPoleGeometry,
  createStandpipeGeometry,
  createStallGeometry,
  createBenchGeometry,
  createBusStopGeometry,
  createPalmGeometry,
} from "./proceduralKit.ts";

/**
 * NDU-UPG props: geometry tests for all procedural street furniture.
 * Verifies each generator produces valid BufferGeometry with non-zero
 * vertices, correct attributes (position, normal, color), and stays
 * within the declared tri budgets from propsCatalogue.ts.
 */

const GENERATORS = [
  { name: "lamp", fn: createLampGeometry, maxTris: 300 },
  { name: "pole", fn: createPoleGeometry, maxTris: 300 },
  { name: "standpipe", fn: createStandpipeGeometry, maxTris: 300 },
  { name: "stall", fn: createStallGeometry, maxTris: 300 },
  { name: "bench", fn: createBenchGeometry, maxTris: 300 },
  { name: "busStop", fn: createBusStopGeometry, maxTris: 300 },
  { name: "palm", fn: createPalmGeometry, maxTris: 300 },
] as const;

describe("proceduralKit", () => {
  for (const { name, fn, maxTris } of GENERATORS) {
    describe(name, () => {
      it("produces geometry with non-zero vertex count", () => {
        const g = fn();
        const pos = g.getAttribute("position");
        assert.ok(pos, `${name} should have a position attribute`);
        assert.ok(pos.count > 0, `${name} position count should be > 0, got ${pos.count}`);
      });

      it("has position, normal and color attributes", () => {
        const g = fn();
        assert.ok(g.getAttribute("position"), `${name} must have position`);
        assert.ok(g.getAttribute("normal"), `${name} must have normal`);
        assert.ok(g.getAttribute("color"), `${name} must have color`);
      });

      it("position and normal have itemSize 3", () => {
        const g = fn();
        assert.equal(g.getAttribute("position").itemSize, 3, `${name} position.itemSize`);
        assert.equal(g.getAttribute("normal").itemSize, 3, `${name} normal.itemSize`);
        assert.equal(g.getAttribute("color").itemSize, 3, `${name} color.itemSize`);
      });

      it(`stays within ${maxTris} tris budget`, () => {
        const g = fn();
        const verts = g.getAttribute("position").count;
        // Non-indexed geometry: tris = verts / 3
        const idx = g.getIndex();
        const tris = idx ? idx.count / 3 : verts / 3;
        assert.ok(tris <= maxTris, `${name} has ${tris} tris, budget is ${maxTris}`);
      });

      it("has consistent attribute counts", () => {
        const g = fn();
        const pc = g.getAttribute("position").count;
        const nc = g.getAttribute("normal").count;
        const cc = g.getAttribute("color").count;
        assert.equal(pc, nc, `${name} position/normal count mismatch: ${pc} vs ${nc}`);
        assert.equal(pc, cc, `${name} position/color count mismatch: ${pc} vs ${cc}`);
      });

      it("color values are in [0,1]", () => {
        const g = fn();
        const ca = g.getAttribute("color");
        const arr = ca.array as Float32Array;
        for (let i = 0; i < arr.length; i++) {
          assert.ok(arr[i] >= 0 && arr[i] <= 1, `${name} color[${i}] = ${arr[i]} out of range`);
        }
      });

      it("has a valid bounding sphere", () => {
        const g = fn();
        g.computeBoundingSphere();
        const bs = g.boundingSphere;
        assert.ok(bs, `${name} should have boundingSphere after compute`);
        assert.ok(bs!.radius > 0, `${name} bounding sphere radius should be > 0`);
        assert.ok(isFinite(bs!.radius), `${name} bounding sphere radius should be finite`);
      });
    });
  }
});

// ───── NDU-UPG realism 03: archetype registry ─────
import * as THREE from "three";
import { ARCHETYPES } from "./proceduralKit.ts";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count / 3 : g.getAttribute("position").count / 3);

describe("ARCHETYPES", () => {
  const ids = Object.keys(ARCHETYPES);
  it("has every archetype the parser can emit", () => {
    for (const id of ["lamp_bent", "lamp_post_top", "lamp_wall", "lamp_double", "pole_wood", "pole_concrete", "bench_back", "bench_flat", "bin_post", "bin_standing", "container", "stop_pole", "shelter", "signal_post", "signal_mast", "sign_octagon", "sign_triangle", "sign_round", "sign_rect", "hydrant_pillar", "hydrant_plate", "hydrant_wall", "postbox_pillar", "bollard", "cabinet", "standpipe", "stall", "trunk", "crown_round", "crown_ovoid", "crown_conical", "crown_umbrella", "crown_palm", "crown_columnar"])
      assert.ok(ARCHETYPES[id], `missing ${id}`);
  });
  for (const id of ids) {
    const a = ARCHETYPES[id];
    it(`${id}: non-indexed, aMask, within budget, low LOD ≤ 30%, nominal height ±5%`, () => {
      const g = a.build();
      const lo = a.buildLow();
      for (const x of [g, lo]) {
        assert.equal(x.index, null, "merged geometry must be non-indexed");
        assert.equal(x.getAttribute("position").count % 3, 0);
        assert.ok(x.getAttribute("aMask"), "aMask present");
        assert.ok(x.getAttribute("color") && x.getAttribute("normal"));
      }
      assert.ok(tris(g) <= a.maxTris, `${tris(g)} > ${a.maxTris}`);
      assert.ok(a.maxTris <= (id.startsWith("crown_") ? 320 : 160));
      assert.ok(tris(lo) <= tris(g) * 0.3 + 1e-9, `low ${tris(lo)} vs ${tris(g)}`);
      g.computeBoundingBox();
      const h = (g.boundingBox as THREE.Box3).max.y;
      assert.ok(Math.abs(h - a.dims[2]) <= a.dims[2] * 0.05, `height ${h.toFixed(3)} vs ${a.dims[2]}`);
    });
  }
  it("lamp lenses carry aMask = 1 and the rest 0", () => {
    const m = ARCHETYPES.lamp_bent.build().getAttribute("aMask").array as Float32Array;
    const ones = m.filter((v) => v === 1).length;
    assert.ok(ones > 0 && ones < m.length);
  });
  it("indexed merge is render-correct: tris = Σ part index counts / 3", () => {
    // createBenchGeometry = 4 boxes; an indexed BoxGeometry has 36 indices → 12 tris each
    assert.equal(createBenchGeometry().getAttribute("position").count / 3, 48);
  });
});
