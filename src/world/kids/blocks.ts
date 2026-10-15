/**
 * NDU-UPG kids: tiny block physics (drop, snap onto the stack, tumble). Pure and unit tested.
 * Units are metres; y is up. A block is a cube of side BLOCK.
 */
export const BLOCK = 0.2;
export const GRAVITY = 9.8;
export const MAX_BLOCKS = 10;
/** A dropped block within this distance of the stack column snaps onto it. */
export const SNAP = 0.09;

export type Body = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rot: number;
  resting: boolean;
};

export function newBody(x: number, y: number, z: number): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, resting: false };
}

/** Height (centre y) where the next block rests on a stack of n blocks. */
export const restY = (n: number) => BLOCK / 2 + n * BLOCK;

/** Snap a landing x/z toward the column centre when close enough, else keep it (it will lean). */
export function snapTo(value: number, centre: number): number {
  return Math.abs(value - centre) <= SNAP ? centre : value;
}

/**
 * Advance one body by dt seconds: gravity, floor bounce with damping, ground friction.
 * floorY is the centre height it rests at (restY for the stack, BLOCK/2 on the floor).
 */
export function step(b: Body, dt: number, floorY: number): Body {
  if (b.resting) return b;
  const n = { ...b };
  n.vy -= GRAVITY * dt;
  n.x += n.vx * dt;
  n.y += n.vy * dt;
  n.z += n.vz * dt;
  n.rot += n.spin * dt;
  if (n.y <= floorY) {
    n.y = floorY;
    if (Math.abs(n.vy) > 0.6) {
      n.vy = -n.vy * 0.35;
    } else {
      n.vy = 0;
    }
    const f = Math.exp(-6 * dt);
    n.vx *= f;
    n.vz *= f;
    n.spin *= f;
    if (n.vy === 0 && Math.hypot(n.vx, n.vz) < 0.03 && Math.abs(n.spin) < 0.05) {
      n.vx = 0;
      n.vz = 0;
      n.spin = 0;
      n.resting = true;
    }
  }
  // stay inside the room
  if (Math.abs(n.x) > 2.5) {
    n.x = Math.sign(n.x) * 2.5;
    n.vx = -n.vx * 0.5;
  }
  if (n.z < -2.1 || n.z > 2.3) {
    n.z = Math.max(-2.1, Math.min(2.3, n.z));
    n.vz = -n.vz * 0.5;
  }
  return n;
}

/** Give a block a tumble kick away from the stack, seeded so tests are stable. */
export function kick(b: Body, i: number, rand: () => number = Math.random): Body {
  const ang = rand() * Math.PI * 2;
  const speed = 0.6 + rand() * 0.9 + i * 0.05;
  return {
    ...b,
    vx: Math.cos(ang) * speed,
    vz: Math.sin(ang) * speed,
    vy: 1.2 + rand() * 1.2,
    spin: (rand() - 0.5) * 10,
    resting: false,
  };
}
