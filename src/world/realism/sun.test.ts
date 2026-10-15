import { test } from "node:test";
import assert from "node:assert/strict";
import { getTimes } from "./suncalc.ts";
import { atLocalMinutes, compass, localMinutes, mapLight, palette, sunAt, sunVector, zoneFor, zoneOffset } from "./sun.ts";

// NDU-UPG #39: Honolulu Chinatown, reference values from upstream SunCalc 1.9.0 (mourner/suncalc).
const LAT = 21.312;
const LNG = -157.862;
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

const REF: [string, number, number][] = [
  // ISO instant, SunCalc azimuth (deg from south, +west), altitude (deg)
  ["2026-06-21T22:30:00Z", -159.1468, 87.7207], // 12:30 HST, near-zenith summer noon
  ["2026-12-21T02:00:00Z", 51.8491, 21.974], // 4:00 PM HST winter afternoon
  ["2026-03-20T17:00:00Z", -87.9884, 4.7625], // 7:00 AM HST equinox sunrise
];

test("sun position matches SunCalc reference for Honolulu at 3 timestamps", () => {
  for (const [iso, az, alt] of REF) {
    const sun = sunAt(new Date(iso), LAT, LNG);
    near(sun.altitude, alt, 0.01, `${iso} altitude`);
    near(sun.azimuth, compass((az * Math.PI) / 180), 0.01, `${iso} azimuth`);
  }
});

test("compass bearing: SunCalc 0 (south) → 180, -90 (east) → 90", () => {
  near(compass(0), 180, 1e-9, "south");
  near(compass(-Math.PI / 2), 90, 1e-9, "east");
  near(compass(Math.PI / 2), 270, 1e-9, "west");
});

test("sunrise/sunset/noon match SunCalc for 2026-10-08 Honolulu", () => {
  const t = getTimes(new Date("2026-10-08T22:00:00Z"), LAT, LNG);
  near(t.sunrise.getTime(), Date.parse("2026-10-08T16:25:53.116Z"), 1000, "sunrise");
  near(t.sunset.getTime(), Date.parse("2026-10-09T04:14:19.365Z"), 1000, "sunset");
  near(t.solarNoon.getTime(), Date.parse("2026-10-08T22:20:06.240Z"), 1000, "noon");
});

test("map light and three.js vector come from the same sun (#6)", () => {
  const sun = sunAt(new Date("2026-12-21T02:00:00Z"), LAT, LNG);
  const light = mapLight(sun);
  assert.equal(light.anchor, "map");
  near(light.position[1], sun.azimuth, 0.1, "azimuth");
  near(light.position[2], 90 - sun.altitude, 0.1, "polar");
  const v = sunVector(sun);
  near(Math.hypot(v.east, v.north, v.up), 1, 1e-9, "unit");
  assert.ok(v.east < 0 && v.north < 0 && v.up > 0, "4 PM winter sun is south-west and up");
});

test("night uses a dim cool key light and full window glow", () => {
  const sun = sunAt(new Date("2026-10-08T10:00:00Z"), LAT, LNG); // midnight HST
  const pal = palette(sun);
  assert.ok(sun.altitude < -20);
  assert.equal(pal.night, 1);
  assert.ok(pal.mapIntensity < 0.4);
});

test("ward time zones and local-minute conversion", () => {
  assert.equal(zoneFor(21.31, -157.86), "Pacific/Honolulu");
  assert.equal(zoneFor(4.8156, 7.0498), "Africa/Lagos");
  assert.equal(zoneFor(-33.9, 151.2), "Etc/GMT-10");
  const at = new Date("2026-10-08T10:15:00Z");
  assert.equal(zoneOffset(at, "Pacific/Honolulu"), -600);
  assert.equal(zoneOffset(at, "Africa/Lagos"), 60);
  assert.equal(localMinutes(at, "Pacific/Honolulu"), 15); // 00:15 HST
  const noon = atLocalMinutes(at, 720, "Pacific/Honolulu");
  assert.equal(noon.toISOString(), "2026-10-08T22:00:00.000Z");
});
