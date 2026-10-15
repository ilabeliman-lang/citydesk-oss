import assert from "node:assert/strict";
import { test } from "node:test";
import { localMinutes, palette, sunAt, zoneFor } from "../realism/sun.ts";
import {
  cacheKey,
  CLEAR_FX,
  dropBudget,
  effectsFor,
  kindFromCode,
  overrideFx,
  parseOpenMeteo,
  rainSlant,
  soundLevels,
  tintPalette,
  type WeatherNow,
} from "./weather.ts";

const SAMPLE = {
  current: {
    temperature_2m: 22.5,
    relative_humidity_2m: 97,
    is_day: 0,
    precipitation: 0.3,
    weather_code: 55,
    cloud_cover: 83,
    wind_speed_10m: 9.2,
    wind_direction_10m: 138,
    visibility: 3440,
  },
  hourly: {
    time: [1791450000, 1791453600],
    temperature_2m: [23, 22.4],
    precipitation: [0.4, 0],
    precipitation_probability: [60, 20],
    weather_code: [61, 3],
    cloud_cover: [90, 70],
    wind_speed_10m: [10, 8],
  },
};

test("cache key rounds to a ~11 km cell (#348)", () => {
  assert.equal(cacheKey(21.3069, -157.8583), "21.3,-157.9");
  assert.equal(cacheKey(21.33, -157.86), "21.3,-157.9");
  assert.equal(cacheKey(4.8156, 7.0498), "4.8,7.0");
});

test("WMO codes map to kinds", () => {
  assert.equal(kindFromCode(0), "clear");
  assert.equal(kindFromCode(2), "partly");
  assert.equal(kindFromCode(45), "fog");
  assert.equal(kindFromCode(53), "drizzle");
  assert.equal(kindFromCode(63), "rain");
  assert.equal(kindFromCode(81), "rain");
  assert.equal(kindFromCode(96), "storm");
});

test("parses Open-Meteo and rejects junk (#322)", () => {
  const w = parseOpenMeteo(SAMPLE, "21.3,-157.9", 1791452000000);
  assert.ok(w);
  assert.equal(w.code, 55);
  assert.equal(w.hours.length, 2);
  assert.equal(w.isDay, false);
  assert.equal(parseOpenMeteo({ error: true }, "k"), null);
  assert.equal(parseOpenMeteo(null, "k"), null);
});

test("effects: drizzle gives light rain, wet ground and some haze from low visibility", () => {
  const w = parseOpenMeteo(SAMPLE, "k", 1791452000000) as WeatherNow;
  const fx = effectsFor(w);
  assert.equal(fx.kind, "drizzle");
  assert.ok(fx.rain >= 0.2 && fx.rain <= 0.4);
  assert.ok(fx.wet > 0.5);
  assert.ok(fx.fog > 0.3, `fog ${fx.fog}`);
  assert.deepEqual(effectsFor(null), CLEAR_FX);
});

test("effects: forecast hour preview reads that hour (#342)", () => {
  const w = parseOpenMeteo(SAMPLE, "k", 1791452000000) as WeatherNow;
  assert.equal(effectsFor(w, { previewMs: 1791453600 * 1000 }).kind, "cloudy");
});

test("Harmattan haze only in West Africa, Dec–Feb, dry air (#306)", () => {
  const dry = {
    ...(parseOpenMeteo(SAMPLE, "k") as WeatherNow),
    code: 1,
    humidity: 25,
    precip: 0,
    vis: 20000,
    hours: [],
  };
  assert.equal(effectsFor(dry, { zone: "Africa/Lagos", month: 1 }).kind, "haze");
  assert.equal(effectsFor(dry, { zone: "Africa/Lagos", month: 7 }).kind, "clear");
  assert.equal(effectsFor(dry, { zone: "Pacific/Honolulu", month: 1 }).kind, "clear");
});

test("clouds dim the sun and grey the sky (#304 #324); storms stay darker", () => {
  const pal = palette(sunAt(new Date("2026-06-21T22:00:00Z"), 21.31, -157.86)); // ~noon Honolulu
  const cloudy = tintPalette(pal, overrideFx("cloudy", null));
  const storm = tintPalette(pal, overrideFx("storm", null));
  assert.ok(cloudy.mapIntensity < pal.mapIntensity);
  assert.ok(cloudy.sunIntensity < pal.sunIntensity);
  assert.notEqual(cloudy.sky, pal.sky);
  assert.ok(storm.sunIntensity <= cloudy.sunIntensity);
  assert.equal(tintPalette(pal, overrideFx("clear", null)), pal);
});

test("particle budget by tier, off for C / reduced motion / saver (#302 #314 #338)", () => {
  const rain = overrideFx("storm", null);
  assert.equal(dropBudget("A", rain), 2000);
  assert.equal(dropBudget("B", rain), 600);
  assert.equal(dropBudget("C", rain), 0);
  assert.equal(dropBudget("A", rain, { reducedMotion: true }), 0);
  assert.equal(dropBudget("B", rain, { saver: true }), 0);
  assert.equal(dropBudget("A", CLEAR_FX), 0);
});

test("wind slants rain relative to the camera (#310)", () => {
  const fx = { ...overrideFx("rain", null), wind: 30, windDir: 270 }; // from the west, blowing east
  assert.ok(rainSlant(fx, 0) > 0); // facing north: drops drift right
  assert.ok(rainSlant(fx, 180) < 0); // facing south: drift left
});

test("soundscape follows time and weather", () => {
  const dayClear = soundLevels(CLEAR_FX, 40);
  const nightRain = soundLevels(overrideFx("rain", null), -20);
  assert.ok(dayClear.birds > 0.3 && dayClear.night === 0);
  assert.ok(nightRain.rain > 0.5 && nightRain.birds === 0);
  assert.ok(dayClear.city > nightRain.city);
});

test("ward clock uses the viewed place's zone, not the device's (#340 #312)", () => {
  const at = new Date("2026-10-08T11:30:00Z");
  assert.equal(zoneFor(21.31, -157.86), "Pacific/Honolulu");
  assert.equal(zoneFor(4.8156, 7.0498), "Africa/Lagos");
  assert.equal(localMinutes(at, "Pacific/Honolulu"), 90); // 1:30 AM HST
  assert.equal(localMinutes(at, "Africa/Lagos"), 12 * 60 + 30); // 12:30 PM WAT
});
