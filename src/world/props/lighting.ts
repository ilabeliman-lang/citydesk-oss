import { hashSeed } from "./dimensions.ts";
import type { LampSchedule } from "./types.ts";

/**
 * NDU-UPG props: street-lamp switching + colour (PLAN §5.4). Pure, alias-free.
 * Photocells trip around sunset ±10 min, i.e. the sun near −1° altitude. Overcast and fog switch
 * lamps on earlier; each lamp gets a fixed ±0.6° stagger so a street doesn't flip at once.
 */

export const LAMP_ON_DEG = -1.0;
export const RAMP_DEG = 0.4;
export const DAWN_HYSTERESIS_DEG = 2.0;
export const STAGGER_DEG = 0.6;

export type SunLike = { altitude: number };
export type FxLike = { cloud: number; fog: number; rain?: number };

export function staggerDeg(osmId: number): number {
  return ((hashSeed(`lamp${osmId}`) / 4294967296) * 2 - 1) * STAGGER_DEG;
}

/** The altitude below which this lamp is fully on. */
export function lampThreshold(fx: FxLike, osmId: number, rising = false): number {
  return LAMP_ON_DEG + 2.5 * clamp01(fx.cloud) + 1.5 * clamp01(fx.fog) + staggerDeg(osmId) + (rising ? DAWN_HYSTERESIS_DEG : 0);
}

/** 0..1 on-factor (a 0.4° ramp so the TimeDial scrubs smoothly). `rising` = morning (dawn hysteresis). */
export function lampsOnFactor(sun: SunLike, fx: FxLike, osmId: number, schedule: LampSchedule = "dusk_dawn", rising = false): number {
  if (schedule === "always") return 1;
  if (schedule === "off") return 0;
  const th = lampThreshold(fx, osmId, rising);
  return clamp01((th + RAMP_DEG - sun.altitude) / RAMP_DEG);
}

/** Correlated colour temperature → linear-ish RGB 0..1 (Tanner Helland fit). */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return [c(r), c(g), c(b)];
}

export function poolRadius(heightM: number): number {
  return 0.9 * heightM;
}

/** Halo size multiplier for wet/foggy air (rain also stretches it vertically, see haloStretch). */
export function haloScale(fx: FxLike): number {
  return 1 + 2.5 * clamp01(fx.fog) + 0.8 * clamp01(fx.rain ?? 0);
}
export function haloStretch(fx: FxLike): number {
  return (fx.rain ?? 0) > 0.05 ? 1.4 : 1;
}

/** Pool fade-in as it actually gets dark (palette night 0..1). */
export function poolIntensity(on: number, night: number): number {
  const t = clamp01((night - 0.15) / 0.35);
  return on * t * t * (3 - 2 * t);
}

export type LightPoint = { i: number; x: number; y: number; on: number; id: number };
/** Indices of the n nearest lit lamps to (cx, cy), stable under ties (by id). */
export function nearestLights(points: LightPoint[], cx: number, cy: number, n: number): number[] {
  return points
    .filter((p) => p.on > 0.05)
    .map((p) => ({ p, d: (p.x - cx) ** 2 + (p.y - cy) ** 2 }))
    .sort((a, b) => a.d - b.d || a.p.id - b.p.id)
    .slice(0, n)
    .map((e) => e.p.i);
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v || 0));
}

/**
 * Euler [x, y] (order "YXZ") that turns a +Z-facing quad toward a MapLibre camera at this pitch/bearing
 * (scene: +X east, +Y up, +Z south). Pitch 0 = looking straight down, so the halo faces up.
 */
export function haloFacing(pitchDeg: number, bearingDeg: number): [number, number] {
  const r = Math.PI / 180;
  return [-(90 - pitchDeg) * r, -bearingDeg * r];
}
