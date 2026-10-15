import { computeWindVector } from "../atmosphere/weatherEngine.ts";
import { haloScale, haloStretch } from "./lighting.ts";

/**
 * NDU-UPG props: weather → prop uniforms (PLAN §5.6). Pure, alias-free.
 * wind = [vx (east), vz (south), strength 0..1]; wet 0..1; halo scale; far-band cut; sway on/off.
 */

export type FxIn = { rain: number; cloud: number; fog: number; wet: number; wind: number; windDir: number; storm?: boolean };
export type PropFx = { wind: [number, number, number]; wet: number; halo: number; haloY: number; farScale: number; swayOn: boolean };

export const CALM_FX: FxIn = { rain: 0, cloud: 0.1, fog: 0, wet: 0, wind: 8, windDir: 70 };

export function propFx(fx: FxIn | null | undefined, reducedMotion: boolean): PropFx {
  const f = fx ?? CALM_FX;
  const mps = Math.max(0, f.wind || 0) / 3.6;
  const w = computeWindVector(f.windDir || 0, mps);
  const strength = Math.min(1, mps / 15);
  const unit = mps > 0 ? 1 / mps : 0;
  const swayOn = !reducedMotion && strength > 0.02;
  return {
    wind: swayOn ? [w.vx * unit, w.vz * unit, strength] : [0, 0, 0],
    wet: Math.min(1, Math.max(0, f.wet || 0)),
    halo: haloScale(f),
    haloY: haloStretch(f),
    farScale: 1 - 0.5 * Math.min(1, Math.max(0, f.fog || 0)),
    swayOn,
  };
}
