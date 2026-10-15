/** Scan-frame pose for the contact disc. x east, y up, -z north. The mesh stays where it is. */

import { groundShadow } from "./cast.ts";

export function scanShadow(
  dims: { width: number; depth: number; height: number },
  light: { east: number; north: number; up: number },
) {
  const blob = groundShadow(dims, light);
  return {
    x: blob.east,
    y: 0.02,
    z: -blob.north,
    rx: blob.rx,
    ry: blob.ry,
    opacity: blob.opacity,
  };
}
