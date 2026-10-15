/** A ground shadow from a footprint and a light vector. No map and no three.js. */

export type LightVector = { east: number; north: number; up: number };

export type Footprint = { width: number; depth: number; height: number };

export type GroundShadow = {
  east: number;
  north: number;
  rx: number;
  ry: number;
  opacity: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The blob sits opposite the light. A high sun makes a short, light shadow.
 * `up` of 0 is treated as a low sun so the length stays finite.
 */
export function groundShadow(foot: Footprint, light: LightVector): GroundShadow {
  const width = Math.max(0.2, foot.width);
  const depth = Math.max(0.2, foot.depth);
  const height = Math.max(0, foot.height);
  const horiz = Math.hypot(light.east, light.north) || 1;
  const up = Math.max(light.up, 0.15);
  const length = clamp((height * horiz) / up, 0.2, Math.max(width, height) * 3);
  const east = (-light.east / horiz) * length * 0.5;
  const north = (-light.north / horiz) * length * 0.5;
  const stretch = clamp(length / Math.max(width, 0.2), 1, 4);
  return {
    east,
    north,
    rx: width * 0.45,
    ry: depth * 0.45 * stretch,
    opacity: clamp(0.42 - up * 0.18, 0.12, 0.42),
  };
}
