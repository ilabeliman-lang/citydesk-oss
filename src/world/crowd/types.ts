export type WalkerArchetype = "shopper" | "worker" | "vendor" | "student" | "elder";

export type WalkerMood = "idle" | "walking" | "chatting" | "waiting" | "waving";

export type Vector2D = { x: number; y: number };

export const ARCHETYPE_SPEEDS_MPS: Record<WalkerArchetype, number> = {
  student: 1.5, // brisk walk
  worker: 1.4,
  shopper: 1.1,
  vendor: 0.9,
  elder: 0.8,   // gentle stroll
};

export const TIER_CROWD_CAPS = {
  A: 72,
  B: 28,
  C: 0,
} as const;

export type CrowdTier = keyof typeof TIER_CROWD_CAPS;

export type WalkerAgent = {
  id: string;
  name: string;
  pos: { lat: number; lng: number };
  velocity: Vector2D;
  headingDeg: number;
  mood: WalkerMood;
  archetype: WalkerArchetype;
  speedMps: number;
  stamina: number; // 0 to 100
  targetPos?: { lat: number; lng: number };
  waveTimerSeconds?: number;
};
