export interface NavPoint {
  x: number;
  z: number;
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Bounding boxes of furniture and walls to prevent walking through
export const OFFICE_OBSTACLES: ObstacleBox[] = [
  // West Bench (desks + screens)
  { minX: -5.2, maxX: -2.8, minZ: -4.5, maxZ: 4.0 },
  // East Bench (desks + screens)
  { minX: 2.8, maxX: 5.2, minZ: -4.5, maxZ: 4.0 },
  // Mission Control Wall, with a door in the middle so the walk can leave
  { minX: -6.0, maxX: -1.2, minZ: -8.0, maxZ: -6.8 },
  { minX: 1.2, maxX: 6.0, minZ: -8.0, maxZ: -6.8 },
  // Break Room Bar & Sofas
  { minX: 3.5, maxX: 8.0, minZ: 4.2, maxZ: 7.2 },
  // Outer perimeter safety rails (bounds: [-10.5, 10.5], [-8, 8])
];

// NDU-UPG collide: per-archetype walk bounds (CD-COL-12). Defaults keep the flagship office behaviour.
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export const OFFICE_BOUNDS: Bounds = { minX: -10.0, maxX: 10.0, minZ: -7.5, maxZ: 7.5 };

export function boundsFor(layout: { width: number; depth: number }, flagship: boolean): Bounds {
  if (flagship) return OFFICE_BOUNDS;
  return { minX: -layout.width / 2, maxX: layout.width / 2, minZ: -layout.depth / 2, maxZ: layout.depth / 2 };
}

export function isWalkable(x: number, z: number, padding = 0.4, bounds: Bounds = OFFICE_BOUNDS, obstacles: ObstacleBox[] = OFFICE_OBSTACLES): boolean {
  // Check bounds
  if (x < bounds.minX + padding || x > bounds.maxX - padding) return false;
  if (z < bounds.minZ + padding || z > bounds.maxZ - padding) return false;

  // Check obstacles
  for (const obs of obstacles) {
    if (
      x >= obs.minX - padding &&
      x <= obs.maxX + padding &&
      z >= obs.minZ - padding &&
      z <= obs.maxZ + padding
    ) {
      return false;
    }
  }

  return true;
}

export function clampToWalkable(
  currX: number,
  currZ: number,
  nextX: number,
  nextZ: number,
  padding = 0.35,
  bounds: Bounds = OFFICE_BOUNDS,
  obstacles: ObstacleBox[] = OFFICE_OBSTACLES,
): [number, number] {
  // Attempt both axes
  if (isWalkable(nextX, nextZ, padding, bounds, obstacles)) {
    return [nextX, nextZ];
  }

  // Slide along X only
  if (isWalkable(nextX, currZ, padding, bounds, obstacles)) {
    return [nextX, currZ];
  }

  // Slide along Z only
  if (isWalkable(currX, nextZ, padding, bounds, obstacles)) {
    return [currX, nextZ];
  }

  // Blocked
  return [currX, currZ];
}
