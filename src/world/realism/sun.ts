import { getMoonFraction, getMoonPosition, getPosition, getTimes } from "./suncalc.ts";

/**
 * NDU-UPG #5 #6 #8 #9 #28 #43: one sun for the whole city. Everything that is lit (MapLibre
 * fill-extrusions, the sky/fog and the three.js scan lights) reads the same `Sun`, so buildings and
 * scans shade from the same direction. Pure functions only (no DOM, no three.js) so they unit-test.
 */

export type Sun = {
  /** Compass bearing of the sun in degrees, clockwise from north (0..360). */
  azimuth: number;
  /** Degrees above the horizon (negative below). */
  altitude: number;
  /** Moon, used as the key light at night (#43). */
  moon: { azimuth: number; altitude: number; fraction: number };
  phase: "night" | "twilight" | "golden" | "day";
};

const deg = 180 / Math.PI;
/** SunCalc azimuth (from south, +west) to a compass bearing (from north, clockwise). */
export const compass = (azimuthRad: number) => (((azimuthRad * deg + 180) % 360) + 360) % 360;

export function sunAt(date: Date, lat: number, lng: number): Sun {
  const s = getPosition(date, lat, lng);
  const m = getMoonPosition(date, lat, lng);
  const altitude = s.altitude * deg;
  const phase = altitude < -6 ? "night" : altitude < 0 ? "twilight" : altitude < 10 ? "golden" : "day";
  return {
    azimuth: compass(s.azimuth),
    altitude,
    moon: { azimuth: compass(m.azimuth), altitude: m.altitude * deg, fraction: getMoonFraction(date) },
    phase,
  };
}

/** The light that actually casts: the sun by day, the moon (if up) or a soft sky dome at night. */
export function keyLight(sun: Sun): { azimuth: number; altitude: number } {
  if (sun.altitude > -4) return { azimuth: sun.azimuth, altitude: Math.max(sun.altitude, 2) };
  if (sun.moon.altitude > 5) return { azimuth: sun.moon.azimuth, altitude: sun.moon.altitude };
  return { azimuth: sun.azimuth, altitude: 55 }; // no moon: light from high above, faint
}

/** Unit vector pointing TOWARDS the key light, in east/north/up metres. */
export function sunVector(sun: Sun): { east: number; north: number; up: number } {
  const k = keyLight(sun);
  const az = k.azimuth / deg;
  const alt = k.altitude / deg;
  return { east: Math.sin(az) * Math.cos(alt), north: Math.cos(az) * Math.cos(alt), up: Math.sin(alt) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
type RGB = [number, number, number];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;

/** Lighting constants (#50: documented in LIGHTING.md — tune there, not in code paths). */
export const LIGHT = {
  noon: [255, 250, 240] as RGB,
  golden: [255, 214, 165] as RGB,
  dusk: [150, 160, 215] as RGB,
  moon: [150, 175, 230] as RGB,
  buildingDay: [222, 214, 200] as RGB,
  buildingGolden: [232, 214, 192] as RGB,
  buildingNight: [72, 78, 102] as RGB,
  skyDay: [150, 198, 238] as RGB,
  skyGolden: [246, 178, 120] as RGB,
  skyNight: [16, 22, 44] as RGB,
  horizonDay: [230, 238, 244] as RGB,
  horizonGolden: [255, 214, 170] as RGB,
  horizonNight: [44, 52, 86] as RGB,
} as const;

export type Palette = {
  /** MapLibre `light.color` / three.js DirectionalLight colour. */
  light: string;
  /** MapLibre `light.intensity` (0..1). */
  mapIntensity: number;
  /** three.js DirectionalLight intensity (physically-based units, three r155+). */
  sunIntensity: number;
  /** three.js HemisphereLight sky/ground colours + intensity (#9). */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Base extrusion colour, tinted by sun altitude (#8). */
  building: string;
  /** Sky + fog for MapLibre setSky (#28). */
  sky: string;
  horizon: string;
  fog: string;
  /** 0 by day .. 1 at full night: drives emissive windows (#16). */
  night: number;
  /** three.js toneMappingExposure. */
  exposure: number;
};

/** Colours and intensities for a sun position. Smooth across dawn/dusk so the scrubber never jumps. */
export function palette(sun: Sun): Palette {
  const a = sun.altitude;
  const dayT = clamp((a - 2) / 18, 0, 1); // 0 at 2°, 1 at 20°
  const goldT = clamp((a + 4) / 6, 0, 1); // 0 at -4°, 1 at 2°
  const night = 1 - clamp((a + 8) / 8, 0, 1); // 0 at 0°, 1 at -8°
  const moonUp = sun.moon.altitude > 5 ? sun.moon.fraction : 0;
  const light = a > -4 ? mixRgb(mixRgb(LIGHT.dusk, LIGHT.golden, goldT), LIGHT.noon, dayT) : LIGHT.moon;
  const building = mixRgb(mixRgb(LIGHT.buildingNight, LIGHT.buildingGolden, goldT), LIGHT.buildingDay, dayT);
  const sky = mixRgb(mixRgb(LIGHT.skyNight, LIGHT.skyGolden, goldT), LIGHT.skyDay, dayT);
  const horizon = mixRgb(mixRgb(LIGHT.horizonNight, LIGHT.horizonGolden, goldT), LIGHT.horizonDay, dayT);
  return {
    light: hex(light),
    mapIntensity: a > -4 ? mix(0.3, 0.5, goldT) : 0.18 + 0.15 * moonUp,
    sunIntensity: a > -4 ? mix(0.6, 2.4, Math.max(goldT * 0.5, dayT)) : 0.15 + 0.35 * moonUp,
    hemiSky: hex(mixRgb(LIGHT.skyNight, [255, 255, 255], Math.max(dayT, goldT * 0.6))),
    hemiGround: hex(mixRgb([20, 18, 24], [138, 127, 114], Math.max(dayT, goldT * 0.5))),
    hemiIntensity: mix(0.45, 1.6, Math.max(dayT, goldT * 0.5)),
    building: hex(building),
    sky: hex(sky),
    horizon: hex(horizon),
    fog: hex(mixRgb(horizon, sky, 0.25)),
    night,
    exposure: mix(1.25, 1.0, goldT),
  };
}

/** MapLibre `setLight` spec from the same sun (#6: anchor 'map', position [r, azimuth, polar]). */
export function mapLight(sun: Sun, pal = palette(sun)) {
  const k = keyLight(sun);
  const polar = clamp(90 - k.altitude, 0, 88);
  return { anchor: "map" as const, position: [1.15, Math.round(k.azimuth * 10) / 10, Math.round(polar * 10) / 10] as [number, number, number], color: pal.light, intensity: Math.round(pal.mapIntensity * 100) / 100 };
}

// ── ward time zones (the dial shows the viewed place's clock, not the phone's) ────────────────
const ZONES: { zone: string; lat: [number, number]; lng: [number, number] }[] = [
  { zone: "Pacific/Honolulu", lat: [18.5, 22.5], lng: [-160.8, -154.5] },
  { zone: "Africa/Lagos", lat: [4, 14], lng: [2.6, 14.7] },
  { zone: "Africa/Accra", lat: [4.5, 11.2], lng: [-3.3, 1.2] },
  { zone: "Europe/London", lat: [49.8, 59], lng: [-8.2, 1.8] },
];

/** IANA zone for a spot: known wards first, else the nearest whole-hour solar zone. */
export function zoneFor(lat: number, lng: number): string {
  for (const z of ZONES) if (lat >= z.lat[0] && lat <= z.lat[1] && lng >= z.lng[0] && lng <= z.lng[1]) return z.zone;
  const off = Math.round(lng / 15);
  return off === 0 ? "Etc/GMT" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}`; // Etc/ signs are inverted
}

/** Minutes east of UTC for `zone` at `date`. */
export function zoneOffset(date: Date, zone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
  } catch {
    return 0;
  }
}

/** Minutes after local midnight in `zone`. */
export function localMinutes(date: Date, zone: string): number {
  const m = Math.floor(date.getTime() / 60000) + zoneOffset(date, zone);
  return ((m % 1440) + 1440) % 1440;
}

/** The instant that is `minutes` after local midnight, on the same local day as `ref`, in `zone`. */
export function atLocalMinutes(ref: Date, minutes: number, zone: string): Date {
  const now = localMinutes(ref, zone);
  return new Date(ref.getTime() + (minutes - now) * 60000);
}

/** Sunrise / noon / sunset / night presets in local minutes for the dial (#7). */
export function presets(ref: Date, lat: number, lng: number, zone: string) {
  const t = getTimes(new Date(ref.getTime() + 12 * 3600_000 - zoneOffset(ref, zone) * 60000), lat, lng);
  const mins = (d: Date, fallback: number) => (Number.isFinite(d.getTime()) ? localMinutes(d, zone) : fallback);
  const sunrise = mins(t.sunrise, 360);
  const sunset = mins(t.sunset, 1080);
  return { sunrise: sunrise + 20, noon: mins(t.solarNoon, 720), golden: mins(t.goldenHour, sunset - 40), sunset, night: (sunset + 120) % 1440 };
}

export const clockLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
