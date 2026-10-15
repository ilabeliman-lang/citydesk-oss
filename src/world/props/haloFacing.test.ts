import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { haloFacing } from "./lighting.ts";

// Night-glow regression: the halo quad's normal must point back at the camera for any pitch/bearing.
describe("haloFacing", () => {
  for (const [pitch, bearing] of [[0, 0], [60, 0], [60, 90], [45, -135], [75, 200], [30, 359]]) {
    it(`faces the camera at pitch ${pitch} bearing ${bearing}`, () => {
      const [rx, ry] = haloFacing(pitch, bearing);
      const n = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(rx, ry, 0, "YXZ"));
      const p = (pitch * Math.PI) / 180;
      const b = (bearing * Math.PI) / 180;
      const toCam = new THREE.Vector3(-Math.sin(b) * Math.sin(p), Math.cos(p), Math.cos(b) * Math.sin(p));
      assert.ok(n.dot(toCam) > 0.999, `dot ${n.dot(toCam)}`);
    });
  }
});
