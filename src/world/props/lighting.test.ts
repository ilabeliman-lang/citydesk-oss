import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sunAt } from "../realism/sun.ts";
import { STAGGER_DEG, haloScale, kelvinToRgb, lampThreshold, lampsOnFactor, nearestLights, poolIntensity, poolRadius, staggerDeg } from "./lighting.ts";

const CLEAR = { cloud: 0, fog: 0 };
const WARDS: [string, number, number, string][] = [
  ["Port Harcourt", 4.8156, 7.0498, "2026-10-10T16:00:00Z"],
  ["Lagos", 6.4541, 3.3947, "2026-10-10T16:00:00Z"],
  ["Accra", 5.6037, -0.187, "2026-10-10T16:30:00Z"],
  ["Honolulu", 21.3069, -157.8583, "2026-10-11T03:30:00Z"],
  ["London", 51.5226, -0.1265, "2026-10-10T16:00:00Z"],
];

/** First minute (scanning forward) at which the lamp is fully on. */
function switchOn(lat: number, lng: number, startIso: string, id: number, fx = CLEAR) {
  const t0 = Date.parse(startIso);
  for (let m = 0; m < 240; m++) {
    const s = sunAt(new Date(t0 + m * 60_000), lat, lng);
    if (lampsOnFactor(s, fx, id) >= 1) return { m, alt: s.altitude };
  }
  return null;
}

describe("lampsOnFactor on real dusks", () => {
  for (const [name, lat, lng, iso] of WARDS) {
    it(`${name}: switches on within ±2 min of the altitude threshold`, () => {
      const id = 12345;
      const on = switchOn(lat, lng, iso, id);
      assert.ok(on, "turns on during dusk");
      const th = lampThreshold(CLEAR, id);
      // the sun sinks ≥ ~0.1°/min at these latitudes; ±2 min ≈ the ramp + one step
      assert.ok(on!.alt <= th + 0.01 && on!.alt > th - 0.75, `${name} alt ${on!.alt.toFixed(2)} vs ${th.toFixed(2)}`);
    });
  }
  it("overcast switches on earlier", () => {
    const a = switchOn(4.8156, 7.0498, WARDS[0][3], 7)!;
    const b = switchOn(4.8156, 7.0498, WARDS[0][3], 7, { cloud: 1, fog: 0 })!;
    assert.ok(b.m < a.m);
  });
  it("stagger is bounded and deterministic, and staggers a street", () => {
    const set = new Set<number>();
    for (let id = 1; id < 500; id++) {
      const s = staggerDeg(id);
      assert.ok(Math.abs(s) <= STAGGER_DEG);
      assert.equal(s, staggerDeg(id));
      set.add(Math.round(s * 10));
    }
    assert.ok(set.size > 8);
  });
  it("dawn hysteresis keeps lamps on 2° longer", () => {
    const sun = { altitude: 0.5 };
    assert.equal(lampsOnFactor(sun, CLEAR, 1, "dusk_dawn", false), 0);
    assert.ok(lampsOnFactor(sun, CLEAR, 1, "dusk_dawn", true) > 0);
  });
  it("schedules always/off", () => {
    assert.equal(lampsOnFactor({ altitude: 60 }, CLEAR, 1, "always"), 1);
    assert.equal(lampsOnFactor({ altitude: -30 }, CLEAR, 1, "off"), 0);
    assert.equal(lampsOnFactor({ altitude: -30 }, CLEAR, 1), 1);
  });
});

describe("lamp colour + pools", () => {
  it("kelvin → rgb is monotonic in blue", () => {
    let prev = -1;
    for (const k of [1800, 2000, 2700, 3000, 4000, 4500, 6500]) {
      const [r, , b] = kelvinToRgb(k);
      assert.ok(b >= prev);
      assert.ok(r > 0.9 || k > 6600);
      prev = b;
    }
  });
  it("pools and halos", () => {
    assert.equal(poolRadius(10), 9);
    assert.equal(poolIntensity(1, 0), 0);
    assert.equal(poolIntensity(1, 1), 1);
    assert.ok(haloScale({ cloud: 0, fog: 1 }) > haloScale(CLEAR));
  });
  it("nearest 4 is stable under small moves", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ i, id: i, x: (i % 6) * 25, y: Math.floor(i / 6) * 25, on: 1 }));
    const a = nearestLights(pts, 30, 30, 4);
    const b = nearestLights(pts, 31, 30.5, 4);
    assert.deepEqual(new Set(a), new Set(b));
    assert.equal(a.length, 4);
    assert.deepEqual(nearestLights(pts.map((p) => ({ ...p, on: 0 })), 0, 0, 4), []);
  });
});
