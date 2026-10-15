import type { WalkerAgent, Vector2D } from "./types.ts";

/**
 * Pedestrian steering / Social Force Model.
 * Computes steering forces for separation, cohesion, and alignment.
 */

export type SocialForceWeights = {
  separation: number;
  alignment: number;
  cohesion: number;
  personalSpaceM: number;
  neighborRadiusM: number;
};

export const DEFAULT_FORCE_WEIGHTS: SocialForceWeights = {
  separation: 2.5,
  alignment: 0.8,
  cohesion: 0.5,
  personalSpaceM: 1.2,
  neighborRadiusM: 6.0,
};

export function distance2D(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalize2D(v: Vector2D): Vector2D {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * Computes social steering force vector for a walker among neighbors.
 */
export function computeSteeringForces(
  agent: WalkerAgent,
  neighbors: WalkerAgent[],
  weights: SocialForceWeights = DEFAULT_FORCE_WEIGHTS
): Vector2D {
  let sepX = 0;
  let sepY = 0;
  let alignX = 0;
  let alignY = 0;
  let cohX = 0;
  let cohY = 0;
  let count = 0;

  // Convert lat/lng to meter-approximate local coords
  const agentX = agent.pos.lng * 111139 * Math.cos((agent.pos.lat * Math.PI) / 180);
  const agentY = agent.pos.lat * 111139;

  for (const n of neighbors) {
    if (n.id === agent.id) continue;

    const nX = n.pos.lng * 111139 * Math.cos((n.pos.lat * Math.PI) / 180);
    const nY = n.pos.lat * 111139;

    // Vector pointing away from neighbor towards agent: agent - neighbor
    const dx = agentX - nX;
    const dy = agentY - nY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < weights.neighborRadiusM && dist > 0.01) {
      count++;

      // 1. Separation (push away from neighbor if within personal space)
      if (dist < weights.personalSpaceM) {
        const factor = (weights.personalSpaceM - dist) / dist;
        sepX += (dx / dist) * factor;
        sepY += (dy / dist) * factor;
      }

      // 2. Alignment (match velocity of nearby walkers)
      alignX += n.velocity.x;
      alignY += n.velocity.y;

      // 3. Cohesion (drift towards centroid of group)
      cohX += nX;
      cohY += nY;
    }
  }

  if (count === 0) {
    return { x: 0, y: 0 };
  }

  alignX /= count;
  alignY /= count;
  cohX = (cohX / count) - agentX;
  cohY = (cohY / count) - agentY;

  const totalX =
    sepX * weights.separation +
    alignX * weights.alignment +
    cohX * weights.cohesion;
  const totalY =
    sepY * weights.separation +
    alignY * weights.alignment +
    cohY * weights.cohesion;

  return { x: totalX, y: totalY };
}
