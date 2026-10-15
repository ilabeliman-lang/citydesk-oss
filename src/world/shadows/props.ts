/** Ground shadows for people and vehicles. Positions are scan-frame offsets, not three.js objects. */

import { groundShadow, type GroundShadow, type LightVector } from "./cast.ts";

const FEET = {
  person: { width: 0.5, depth: 0.4, height: 1.75 },
  vehicle: { width: 1.8, depth: 4, height: 1.5 },
} as const;

export type PropKind = "person" | "vehicle";

/** `groundShadow` plus scan-frame offsets: x = east, y = 0, z = -north. */
export type PropShadow = GroundShadow & {
  x: number;
  y: number;
  z: number;
};

export function propShadow(kind: PropKind, light: LightVector): PropShadow {
  const shadow = groundShadow(FEET[kind], light);
  return {
    east: shadow.east,
    north: shadow.north,
    rx: shadow.rx,
    ry: shadow.ry,
    opacity: shadow.opacity,
    x: shadow.east,
    y: 0,
    z: -shadow.north,
  };
}
