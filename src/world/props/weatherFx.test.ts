import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CALM_FX, propFx } from "./weatherFx.ts";

describe("propFx", () => {
  it("wind from 90° (east) blows west: vx < 0", () => {
    const p = propFx({ ...CALM_FX, wind: 36, windDir: 90 }, false);
    assert.ok(p.wind[0] < -0.99 && Math.abs(p.wind[1]) < 1e-9);
    assert.ok(Math.abs(p.wind[2] - 10 / 15) < 1e-9);
  });
  it("wind from north blows south: vz > 0", () => {
    assert.ok(propFx({ ...CALM_FX, wind: 20, windDir: 0 }, false).wind[1] > 0.99);
  });
  it("strength clamps at 15 m/s", () => {
    assert.equal(propFx({ ...CALM_FX, wind: 200 }, false).wind[2], 1);
  });
  it("reduced motion: no sway", () => {
    const p = propFx({ ...CALM_FX, wind: 50 }, true);
    assert.equal(p.swayOn, false);
    assert.deepEqual(p.wind, [0, 0, 0]);
  });
  it("wet, fog halo and far cut", () => {
    const p = propFx({ ...CALM_FX, wet: 2, fog: 1, rain: 0.5 }, false);
    assert.equal(p.wet, 1);
    assert.ok(p.halo > 3);
    assert.equal(p.haloY, 1.4);
    assert.equal(p.farScale, 0.5);
  });
  it("null fx falls back to calm", () => {
    const p = propFx(null, false);
    assert.equal(p.wet, 0);
    assert.equal(p.farScale, 1);
  });
});
