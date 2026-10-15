/**
 * NDU/CityDesk Atmosphere & Sky Dynamics (#101–#150)
 * Pure celestial dome color calculation, phase management, and hemisphere ambient lighting.
 * Pure math & standard Node/browser built-ins; zero external packages.
 */

export type CelestialPhase =
  | 'night'
  | 'dawn'
  | 'golden_hour'
  | 'noon'
  | 'dusk'
  | 'twilight';

export interface SkyColorStop {
  offset: number; // 0.0 (zenith) to 1.0 (nadir/ground)
  color: string;  // Hex color e.g. #2465b8
}

export interface HemisphereAmbientLight {
  skyColor: string;
  groundColor: string;
  intensity: number;
}

export interface CelestialSky {
  phase: CelestialPhase;
  sunAltitude: number; // clamped -90° to +90°
  sunAzimuth: number;  // normalized 0° to 360°
  zenithColor: string;
  horizonColor: string;
  hazeColor: string;   // ground / fog haze color
  ambientLight: HemisphereAmbientLight;
  colorStops: SkyColorStop[];
  cssGradient: string;
}

export interface SkyGradientOptions {
  altitude: number;
  azimuth?: number;
  phase?: CelestialPhase;
}

type RGB = [number, number, number];

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * clamp(t, 0, 1);

export function hexToRgb(hex: string): RGB {
  const sanitized = hex.replace(/^#/, '');
  const parsed = parseInt(sanitized, 16);
  if (Number.isNaN(parsed) || sanitized.length !== 6) {
    return [0, 0, 0];
  }
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const cr = clamp(Math.round(r), 0, 255);
  const cg = clamp(Math.round(g), 0, 255);
  const cb = clamp(Math.round(b), 0, 255);
  return `#${((1 << 24) + (cr << 16) + (cg << 8) + cb).toString(16).slice(1)}`;
}

export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  const factor = clamp(t, 0, 1);
  return [
    lerp(a[0], b[0], factor),
    lerp(a[1], b[1], factor),
    lerp(a[2], b[2], factor),
  ];
}

export function lerpHex(hexA: string, hexB: string, t: number): string {
  return rgbToHex(lerpRgb(hexToRgb(hexA), hexToRgb(hexB), t));
}

export interface CelestialPalette {
  zenith: RGB;
  horizon: RGB;
  haze: RGB;
  ambientSky: RGB;
  ambientGround: RGB;
  ambientIntensity: number;
}

export const CELESTIAL_PALETTES: Record<CelestialPhase, CelestialPalette> = {
  night: {
    zenith: [10, 14, 26],          // #0a0e1a deep space navy
    horizon: [21, 28, 48],         // #151c30 dark navy horizon
    haze: [8, 12, 20],             // #080c14 nocturnal ground haze
    ambientSky: [20, 28, 48],      // #141c30
    ambientGround: [8, 11, 18],    // #080b12
    ambientIntensity: 0.12,
  },
  twilight: {
    zenith: [24, 34, 68],          // #182244 deep indigo
    horizon: [59, 56, 88],         // #3b3858 indigo/violet horizon glow
    haze: [30, 30, 47],            // #1e1e2f
    ambientSky: [44, 53, 88],      // #2c3558
    ambientGround: [20, 22, 34],   // #141622
    ambientIntensity: 0.3,
  },
  dawn: {
    zenith: [58, 89, 138],         // #3a598a soft morning blue
    horizon: [252, 161, 102],      // #fca166 warm peach / sunrise salmon
    haze: [209, 138, 110],         // #d18a6e warm dawn haze
    ambientSky: [108, 133, 181],   // #6c85b5
    ambientGround: [61, 52, 45],   // #3d342d
    ambientIntensity: 0.55,
  },
  golden_hour: {
    zenith: [89, 137, 196],        // #5989c4 rich azure
    horizon: [255, 171, 74],       // #ffab4a golden amber glow
    haze: [224, 153, 83],          // #e09953 golden haze
    ambientSky: [140, 170, 212],   // #8caad4
    ambientGround: [99, 79, 56],   // #634f38
    ambientIntensity: 0.85,
  },
  noon: {
    zenith: [36, 101, 184],        // #2465b8 cerulean sky zenith
    horizon: [161, 203, 245],      // #a1cbf5 bright scattered horizon
    haze: [184, 215, 247],         // #b8d7f7 light sky haze
    ambientSky: [230, 240, 250],   // #e6f0fa
    ambientGround: [138, 130, 117],// #8a8275
    ambientIntensity: 1.35,
  },
  dusk: {
    zenith: [45, 61, 107],         // #2d3d6b dusk violet
    horizon: [232, 93, 67],        // #e85d43 vibrant sunset crimson
    haze: [184, 81, 69],           // #b85145 reddish dusk haze
    ambientSky: [92, 77, 107],     // #5c4d6b
    ambientGround: [45, 32, 38],   // #2d2026
    ambientIntensity: 0.5,
  },
};

/**
 * Determine celestial phase from sun altitude (-90° to +90°) and azimuth (0° to 360°).
 * Azimuth in [0, 180) represents the morning half-plane (dawn), while [180, 360) is evening (dusk).
 */
export function getCelestialPhase(altitude: number, azimuth: number = 90): CelestialPhase {
  const az = (((azimuth % 360) + 360) % 360);
  const isMorning = az >= 0 && az < 180;

  if (altitude < -12) {
    return 'night';
  }
  if (altitude < -4) {
    return 'twilight';
  }
  if (altitude < 6) {
    return isMorning ? 'dawn' : 'dusk';
  }
  if (altitude < 25) {
    return 'golden_hour';
  }
  return 'noon';
}

/**
 * Interpolate celestial palette continuous with sun altitude and azimuth.
 */
function interpolateCelestialPalette(
  altitude: number,
  azimuth: number,
  phase: CelestialPhase
): CelestialPalette {
  const az = (((azimuth % 360) + 360) % 360);
  const isMorning = az >= 0 && az < 180;

  if (phase === 'night') {
    return CELESTIAL_PALETTES.night;
  }

  // Altitude keyframes:
  // -90 to -12: night
  // -12 to -4: twilight (lerp night -> twilight)
  // -4 to +6: dawn/dusk (lerp twilight -> dawn/dusk)
  // +6 to +25: golden_hour (lerp dawn/dusk -> golden_hour -> noon)
  // +25 to +90: noon
  if (altitude <= -12) {
    return CELESTIAL_PALETTES.night;
  }

  if (altitude < -4) {
    const t = (altitude - (-12)) / 8; // 0 at -12°, 1 at -4°
    return blendPalettes(CELESTIAL_PALETTES.night, CELESTIAL_PALETTES.twilight, t);
  }

  const sunHorizonTarget = isMorning ? CELESTIAL_PALETTES.dawn : CELESTIAL_PALETTES.dusk;

  if (altitude < 6) {
    const t = (altitude - (-4)) / 10; // 0 at -4°, 1 at 6°
    return blendPalettes(CELESTIAL_PALETTES.twilight, sunHorizonTarget, t);
  }

  if (altitude < 25) {
    const t = (altitude - 6) / 19; // 0 at 6°, 1 at 25°
    const midPalette = blendPalettes(sunHorizonTarget, CELESTIAL_PALETTES.golden_hour, 0.6);
    return blendPalettes(midPalette, CELESTIAL_PALETTES.noon, t);
  }

  // High sun (noon)
  return CELESTIAL_PALETTES.noon;
}

function blendPalettes(a: CelestialPalette, b: CelestialPalette, t: number): CelestialPalette {
  const factor = clamp(t, 0, 1);
  return {
    zenith: lerpRgb(a.zenith, b.zenith, factor),
    horizon: lerpRgb(a.horizon, b.horizon, factor),
    haze: lerpRgb(a.haze, b.haze, factor),
    ambientSky: lerpRgb(a.ambientSky, b.ambientSky, factor),
    ambientGround: lerpRgb(a.ambientGround, b.ambientGround, factor),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, factor),
  };
}

/**
 * Compute celestial sky dome stops, zenith/horizon/haze colors, and hemisphere lighting.
 */
export function computeSkyGradient(
  optionsOrAltitude: number | SkyGradientOptions,
  maybeAzimuth: number = 90
): CelestialSky {
  let altitude: number;
  let azimuth: number;
  let overridePhase: CelestialPhase | undefined;

  if (typeof optionsOrAltitude === 'number') {
    altitude = clamp(optionsOrAltitude, -90, 90);
    azimuth = (((maybeAzimuth % 360) + 360) % 360);
  } else {
    altitude = clamp(optionsOrAltitude.altitude, -90, 90);
    azimuth = ((( (optionsOrAltitude.azimuth ?? 90) % 360) + 360) % 360);
    overridePhase = optionsOrAltitude.phase;
  }

  const phase = overridePhase ?? getCelestialPhase(altitude, azimuth);

  // If phase is explicitly passed, use exact preset palette; otherwise smoothly interpolate
  const palette = overridePhase
    ? CELESTIAL_PALETTES[overridePhase]
    : interpolateCelestialPalette(altitude, azimuth, phase);

  const zenithColor = rgbToHex(palette.zenith);
  const horizonColor = rgbToHex(palette.horizon);
  const hazeColor = rgbToHex(palette.haze);
  const midColor = rgbToHex(lerpRgb(palette.zenith, palette.horizon, 0.5));

  const ambientLight: HemisphereAmbientLight = {
    skyColor: rgbToHex(palette.ambientSky),
    groundColor: rgbToHex(palette.ambientGround),
    intensity: Math.round(palette.ambientIntensity * 100) / 100,
  };

  const colorStops: SkyColorStop[] = [
    { offset: 0.0, color: zenithColor },
    { offset: 0.45, color: midColor },
    { offset: 0.8, color: horizonColor },
    { offset: 1.0, color: hazeColor },
  ];

  const cssGradient = `linear-gradient(180deg, ${zenithColor} 0%, ${midColor} 45%, ${horizonColor} 80%, ${hazeColor} 100%)`;

  return {
    phase,
    sunAltitude: altitude,
    sunAzimuth: azimuth,
    zenithColor,
    horizonColor,
    hazeColor,
    ambientLight,
    colorStops,
    cssGradient,
  };
}
