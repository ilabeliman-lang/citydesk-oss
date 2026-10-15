import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebGlLifecycleManager, verifyLayerOrder, RENDER_ORDER_CONTRACT } from "./lifecycle.ts";
import { PALETTE_COLORS, getPaletteMaterial, clearMaterialCache } from "./materials.ts";

describe("Rendering Pipeline & Materials (Category 1)", () => {
  describe("WebGlLifecycleManager (#30)", () => {
    it("starts in healthy state with 0 failures", () => {
      const mgr = new WebGlLifecycleManager();
      assert.equal(mgr.getState(), "healthy");
      assert.equal(mgr.getFailures(), 0);
    });

    it("transitions to restoring on first context lost", () => {
      const mgr = new WebGlLifecycleManager();
      mgr.handleContextLost();
      assert.equal(mgr.getState(), "restoring");
      assert.equal(mgr.getFailures(), 1);
    });

    it("recovers to healthy on context restored after 1 failure", () => {
      const mgr = new WebGlLifecycleManager();
      mgr.handleContextLost();
      mgr.handleContextRestored();
      assert.equal(mgr.getState(), "healthy");
    });

    it("permanently degrades to degraded_2d after 2 failures", () => {
      const mgr = new WebGlLifecycleManager();
      mgr.handleContextLost(); // failure 1 -> restoring
      mgr.handleContextRestored();
      mgr.handleContextLost(); // failure 2 -> degraded_2d
      assert.equal(mgr.getState(), "degraded_2d");
      assert.equal(mgr.getFailures(), 2);

      // Subsequent restore attempt does not un-degrade
      mgr.handleContextRestored();
      assert.equal(mgr.getState(), "degraded_2d");
    });
  });

  describe("Render Order Contract (#34)", () => {
    it("verifies compliant ascending layer order", () => {
      const sample = ["basemap-fills", "roads", "3d-buildings", "poi-labels"];
      assert.equal(verifyLayerOrder(sample), true);
    });

    it("rejects inverted layer orders (e.g. 3d buildings rendered over html markers)", () => {
      const inverted = ["html-markers", "roads", "basemap-fills"];
      assert.equal(verifyLayerOrder(inverted), false);
    });

    it("full contract sequence passes verification", () => {
      assert.equal(verifyLayerOrder([...RENDER_ORDER_CONTRACT]), true);
    });
  });

  describe("Material Library Cache (#23)", () => {
    it("returns identical cached instances for identical keys", () => {
      clearMaterialCache();
      const m1 = getPaletteMaterial("danfoYellow");
      const m2 = getPaletteMaterial("danfoYellow");
      assert.equal(m1, m2);
      assert.equal(m1.color.getHex(), PALETTE_COLORS.danfoYellow);
    });

    it("creates distinct materials for different palette colors", () => {
      const mTeal = getPaletteMaterial("lagoonTeal");
      const mLaterite = getPaletteMaterial("laterite");
      assert.notEqual(mTeal, mLaterite);
      assert.equal(mTeal.color.getHex(), PALETTE_COLORS.lagoonTeal);
      assert.equal(mLaterite.color.getHex(), PALETTE_COLORS.laterite);
    });
  });
});

// ───── NDU-UPG realism 03: prop materials ─────
import * as THREE from "three";
import { clearPropMaterials, getPropMaterial, propUniforms, radialTexture } from "./materials.ts";

describe("getPropMaterial", () => {
  it("caches one instance per kind", () => {
    clearPropMaterials();
    assert.equal(getPropMaterial("opaque"), getPropMaterial("opaque"));
    assert.notEqual(getPropMaterial("opaque"), getPropMaterial("crown"));
  });
  it("sets the right flags", () => {
    const o = getPropMaterial("opaque") as THREE.MeshStandardMaterial;
    assert.ok(o.vertexColors);
    assert.equal(o.roughness, 0.8);
    for (const k of ["glow", "pool"] as const) {
      const m = getPropMaterial(k) as THREE.MeshBasicMaterial;
      assert.equal(m.blending, THREE.AdditiveBlending);
      assert.equal(m.depthWrite, false);
      assert.ok(m.transparent);
    }
    assert.ok((getPropMaterial("pool") as THREE.MeshBasicMaterial).polygonOffset);
    assert.ok(getPropMaterial("shadow") instanceof THREE.ShadowMaterial);
  });
  it("shares uniforms across programs (onBeforeCompile wires them)", () => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>" };
    (getPropMaterial("crown") as THREE.MeshStandardMaterial).onBeforeCompile(shader as never, null as never);
    assert.equal(shader.uniforms.uWind, propUniforms.uWind);
    assert.match(shader.vertexShader, /uWind/);
    assert.match(shader.fragmentShader, /uWet/);
  });
  it("radial texture fades to transparent at the rim", () => {
    const t = radialTexture();
    const d = t.image.data as Uint8Array;
    assert.ok(d[(32 * 64 + 32) * 4 + 3] > 200);
    assert.equal(d[3], 0);
  });
});
