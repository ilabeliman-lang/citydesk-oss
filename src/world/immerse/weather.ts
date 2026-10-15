import type { Palette, Sun } from "../realism/sun.ts";

/**
 * NDU-UPG immerse #301 #303 #304 #306 #310 #311 #322 #324 #343 #348: the weather model, pure
 * functions only (no DOM, no fetch) so node --test can check them. Live data comes from Open-Meteo
 * (free, keyless, CC BY 4.0) through the cached server function in weatherFn.ts.
 * Keep this file free of path aliases: node --experimental-strip-types runs its tests.
 */

export type Kind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "storm" | "haze";

export type Hour = {
  /** Unix seconds (UTC). */
  t: number;
  temp: number;
  code: number;
  cloud: number;
  precip: number;
  pop: number;
  wind: number;
};

export type WeatherNow = {
  key: string;
  /** When the server fetched it (ms). */
  at: number;
  temp: number;
  humidity: number;
  code: number;
  /** 0..100 % */
  cloud: number;
  /** mm in the last 15 min interval */
  precip: number;
  /** km/h at 10 m */
  wind: number;
  /** degrees the wind blows FROM */
  windDir: number;
  /** metres */
  vis: number;
  isDay: boolean;
  hours: Hour[];
};

/** What the renderer and the soundscape actually use (0..1 unless noted). */
export type Fx = {
  kind: Kind;
  rain: number;
  cloud: number;
  fog: number;
  wet: number;
  /** km/h */
  wind: number;
  windDir: number;
  storm: boolean;
  /** Warm dusty fog (Harmattan / vog) instead of grey. */
  haze: boolean;
  /** It rained in the last hour and has stopped: rainbow possible (#150). */
  afterRain: boolean;
};

export const CLEAR_FX: Fx = {
  kind: "clear",
  rain: 0,
  cloud: 0.1,
  fog: 0,
  wet: 0,
  wind: 8,
  windDir: 70,
  storm: false,
  haze: false,
  afterRain: false,
};

export const OVERRIDES: Kind[] = ["clear", "cloudy", "rain", "storm", "fog", "haze"];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** #348: one cache entry per ~11 km cell (0.1°), so a whole ward shares one upstream call. */
export function cacheKey(lat: number, lng: number): string {
  const r = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  return `${r(lat)},${r(lng)}`;
}

/** WMO weather interpretation codes (Open-Meteo `weather_code`). */
export function kindFromCode(code: number): Kind {
  if (code <= 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 95) return "storm";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 71 && code <= 86) return "rain"; // snow codes: tropical wards treat as rain
  return "cloudy";
}

export const KIND_LABEL: Record<Kind, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  storm: "Thunderstorm",
  haze: "Haze",
};

export function openMeteoUrl(lat: number, lng: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lng.toFixed(2),
    current:
      "temperature_2m,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility",
    hourly:
      "temperature_2m,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m",
    past_hours: "3",
    forecast_hours: "24",
    timeformat: "unixtime",
    timezone: "GMT",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

type OMBody = {
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown[]>;
};

/** Parse an Open-Meteo forecast body; null when it is not usable (#322: caller falls back to clear). */
export function parseOpenMeteo(body: unknown, key: string, at = Date.now()): WeatherNow | null {
  const b = body as OMBody | null;
  const c = b?.current;
  if (!c || typeof c.weather_code !== "number") return null;
  const h = b?.hourly ?? {};
  const times = (h.time ?? []) as number[];
  const col = (name: string, i: number) => num((h[name] ?? [])[i]);
  const hours: Hour[] = times.slice(0, 30).map((t, i) => ({
    t: num(t),
    temp: col("temperature_2m", i),
    code: col("weather_code", i),
    cloud: col("cloud_cover", i),
    precip: col("precipitation", i),
    pop: col("precipitation_probability", i),
    wind: col("wind_speed_10m", i),
  }));
  return {
    key,
    at,
    temp: num(c.temperature_2m, 27),
    humidity: num(c.relative_humidity_2m, 70),
    code: num(c.weather_code),
    cloud: num(c.cloud_cover),
    precip: num(c.precipitation),
    wind: num(c.wind_speed_10m, 8),
    windDir: num(c.wind_direction_10m, 70),
    vis: num(c.visibility, 20000),
    isDay: num(c.is_day, 1) === 1,
    hours,
  };
}

/** The hour row nearest `atMs`, if the feed has one within 90 minutes. */
export function hourAt(w: WeatherNow, atMs: number): Hour | null {
  let best: Hour | null = null;
  for (const h of w.hours)
    if (!best || Math.abs(h.t * 1000 - atMs) < Math.abs(best.t * 1000 - atMs)) best = h;
  return best && Math.abs(best.t * 1000 - atMs) <= 90 * 60_000 ? best : null;
}

/** Live weather → effects. `zone`/`month` enable the Harmattan preset (#306); `previewMs` reads a forecast hour (#342). */
export function effectsFor(
  w: WeatherNow | null,
  opts: { zone?: string; month?: number; previewMs?: number | null } = {},
): Fx {
  if (!w) return CLEAR_FX;
  const hour = opts.previewMs != null ? hourAt(w, opts.previewMs) : null;
  const code = hour ? hour.code : w.code;
  const precipHr = hour ? hour.precip : w.precip * 4; // current is a 15-min amount
  const cloud = clamp((hour ? hour.cloud : w.cloud) / 100);
  const wind = hour ? hour.wind : w.wind;
  let kind = kindFromCode(code);
  const storm = kind === "storm";
  let rain = 0;
  if (kind === "drizzle") rain = clamp(0.2 + precipHr / 4, 0.2, 0.4);
  else if (kind === "rain") rain = clamp(0.35 + precipHr / 8, 0.35, 1);
  else if (storm) rain = clamp(0.7 + precipHr / 20, 0.7, 1);
  else if (precipHr >= 0.2) rain = clamp(precipHr / 6, 0.15, 0.6); // showers the code missed
  // #343: visibility first, humidity adds a little haze
  const vis = hour ? 20000 : w.vis;
  let fog = vis < 1000 ? 0.9 : vis < 6000 ? ((6000 - vis) / 5000) * 0.6 : 0;
  if (kind === "fog") fog = Math.max(fog, 0.8);
  if (w.humidity > 90) fog += 0.12;
  if (rain > 0) fog += rain * 0.15;
  let haze = false;
  const month = opts.month ?? new Date().getUTCMonth() + 1;
  if (
    opts.zone?.startsWith("Africa/") &&
    (month === 12 || month <= 2) &&
    w.humidity < 45 &&
    rain === 0
  ) {
    haze = true;
    kind = "haze";
    fog = Math.max(fog, 0.45);
  }
  const past = w.hours.filter((x) => x.t * 1000 <= w.at && x.t * 1000 > w.at - 2 * 3600_000);
  const rainedRecently = past.some((x) => x.precip >= 0.2);
  const wet = rain > 0 ? clamp(0.5 + rain / 2) : rainedRecently ? 0.45 : 0;
  return {
    kind,
    rain,
    cloud: storm ? Math.max(cloud, 0.9) : cloud,
    fog: clamp(fog),
    wet,
    wind,
    windDir: w.windDir,
    storm,
    haze,
    afterRain: rain === 0 && rainedRecently && cloud < 0.75,
  };
}

/** #311: a demo/screenshot preset, keeping live wind when known. */
export function overrideFx(kind: Kind, live: WeatherNow | null): Fx {
  const wind = live?.wind ?? 12;
  const windDir = live?.windDir ?? 70;
  const base = { ...CLEAR_FX, kind, wind, windDir };
  switch (kind) {
    case "clear":
      return { ...base, cloud: 0.05 };
    case "partly":
      return { ...base, cloud: 0.45 };
    case "cloudy":
      return { ...base, cloud: 0.85, fog: 0.08 };
    case "fog":
      return { ...base, cloud: 0.7, fog: 0.85, wet: 0.2 };
    case "drizzle":
      return { ...base, cloud: 0.8, rain: 0.3, fog: 0.15, wet: 0.6 };
    case "rain":
      return { ...base, cloud: 0.9, rain: 0.7, fog: 0.2, wet: 0.9, wind: Math.max(wind, 15) };
    case "storm":
      return {
        ...base,
        cloud: 1,
        rain: 1,
        fog: 0.25,
        wet: 1,
        storm: true,
        wind: Math.max(wind, 35),
      };
    case "haze":
      return { ...base, cloud: 0.3, fog: 0.5, haze: true };
  }
}

// ── palette tint (#304 #324 #303): applied on top of realism's sun palette ─────────────────────
type RGB = [number, number, number];
const rgb = (h: string): RGB => {
  const n = parseInt(h.replace("#", "").slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
};
const toHex = (c: RGB) =>
  `#${c
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mixC = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Same brightness, no colour (overcast), scaled. */
const grey = (c: RGB, scale: number): RGB => {
  const l = lum(c) * scale;
  return [l, l, l * 1.04];
};
export const HAZE_RGB: RGB = [214, 182, 136];
const STORM_RGB: RGB = [86, 82, 112];

export function tintPalette(pal: Palette, fx: Fx, _sun?: Sun): Palette {
  const k = clamp(fx.cloud * 0.7 + fx.rain * 0.25 + (fx.storm ? 0.15 : 0), 0, 0.92);
  const f = clamp(fx.fog);
  if (k < 0.05 && f < 0.02 && fx.wet < 0.02) return pal;
  const tintSky = (h: string, dim: number) => {
    let c = rgb(h);
    c = mixC(c, grey(c, 1 - dim * k), k);
    if (fx.storm) c = mixC(c, mixC(STORM_RGB, c, 0.5), 0.5);
    if (f > 0) c = mixC(c, fx.haze ? mixC(HAZE_RGB, c, 0.4) : grey(c, 1.05), f * 0.8);
    return toHex(c);
  };
  let building = rgb(pal.building);
  if (fx.wet > 0) {
    // #303 wet look: darker, slightly more saturated walls
    const l = lum(building);
    building = mixC(
      building,
      [
        building[0] + (building[0] - l) * 0.25,
        building[1] + (building[1] - l) * 0.25,
        building[2] + (building[2] - l) * 0.25,
      ],
      fx.wet,
    );
    building = mixC(building, [0, 0, 0], 0.1 * fx.wet);
  }
  building = mixC(building, grey(building, 0.95), k * 0.35);
  const light = mixC(rgb(pal.light), grey(rgb(pal.light), 1), k * 0.8);
  return {
    ...pal,
    light: toHex(light),
    mapIntensity: Math.round(pal.mapIntensity * (1 - 0.35 * k) * 100) / 100,
    sunIntensity: pal.sunIntensity * (1 - 0.6 * k), // #304 softer shadows under cloud
    hemiIntensity: pal.hemiIntensity * (1 + 0.1 * k),
    building: toHex(building),
    sky: tintSky(pal.sky, 0.25),
    horizon: tintSky(pal.horizon, 0.15),
    fog: tintSky(pal.fog, 0.1),
  };
}

/** Rain streak slant in screen space: wind blowing FROM `windDir`, camera facing `bearing`. */
export function rainSlant(fx: Fx, bearing: number): number {
  const to = ((fx.windDir + 180 - bearing) * Math.PI) / 180;
  return clamp((Math.sin(to) * fx.wind) / 60, -0.6, 0.6);
}

/** Particle budget (#302 #314 #338): Tier A 2000, B 600, C / reduced motion / battery saver / data saver off. */
export function dropBudget(
  tier: "A" | "B" | "C",
  fx: Fx,
  opts: { reducedMotion?: boolean; saver?: boolean } = {},
): number {
  if (tier === "C" || opts.reducedMotion || opts.saver || fx.rain <= 0) return 0;
  return Math.round((tier === "A" ? 2000 : 600) * clamp(fx.rain, 0.15, 1));
}

/** Ambient soundscape levels (0..1) for weather + sun (#315 #341 and the city/wind/birds/night beds). */
export function soundLevels(fx: Fx, sunAltitude: number) {
  const day = clamp((sunAltitude + 6) / 16);
  const night = 1 - clamp((sunAltitude + 10) / 10);
  const dawn = sunAltitude > -4 && sunAltitude < 14 ? 1 - Math.abs(sunAltitude - 5) / 9 : 0;
  return {
    city: clamp(0.12 + 0.28 * day) * (1 - fx.rain * 0.4),
    rain: clamp(fx.rain * 0.9),
    wind: clamp((fx.wind - 6) / 40) * 0.8,
    birds: clamp((day * 0.5 + dawn * 0.6) * (1 - fx.rain * 1.5) * (1 - fx.fog * 0.5)),
    night: clamp(night * (1 - fx.rain * 1.2)),
  };
}
