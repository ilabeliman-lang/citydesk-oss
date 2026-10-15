import {
  type VehicleType,
  type VehicleState,
  type Tier,
  TIER_VEHICLE_CAPS,
  VEHICLE_DEFAULT_SPEEDS_MPS,
  LIVERY_PALETTES,
} from "./types.ts";
import { calculateIdmAcceleration, stepVehiclePhysics } from "./idm.ts";
import { shouldHold, type SignalPhase } from "./yield.ts";

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Ensures reproducible traffic generation for QA snapshots.
 */
export function createPrng(seed: number) {
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TrafficSimConfig = {
  seed?: number;
  tier?: Tier;
  centerLat?: number;
  centerLng?: number;
};

export class TrafficSimulator {
  private vehicles: Map<string, VehicleState> = new Map();
  private prng: () => number;
  private tier: Tier;

  constructor(config: TrafficSimConfig = {}) {
    this.prng = createPrng(config.seed ?? 12345);
    this.tier = config.tier ?? "A";
  }

  getVehicleCount(): number {
    return this.vehicles.size;
  }

  getVehicles(): VehicleState[] {
    return Array.from(this.vehicles.values());
  }

  getCap(): number {
    return TIER_VEHICLE_CAPS[this.tier];
  }

  spawnVehicle(
    type: VehicleType,
    pos: { lat: number; lng: number },
    headingDeg: number,
    customId?: string
  ): VehicleState | null {
    if (this.vehicles.size >= this.getCap()) {
      return null;
    }

    const id = customId ?? `veh_${Math.floor(this.prng() * 1000000)}`;
    const colors = LIVERY_PALETTES[type];
    const colorHex = colors[Math.floor(this.prng() * colors.length)];
    const speed = VEHICLE_DEFAULT_SPEEDS_MPS[type];

    const state: VehicleState = {
      id,
      type,
      pos: { ...pos },
      headingDeg,
      speedMps: speed * 0.8,
      targetSpeedMps: speed,
      colorHex,
    };

    this.vehicles.set(id, state);
    return state;
  }

  removeVehicle(id: string): boolean {
    return this.vehicles.delete(id);
  }

  clear(): void {
    this.vehicles.clear();
  }

  /**
   * Step traffic state forward by dtSeconds using IDM following logic.
   * When a signal phase is supplied, vehicles hold for red/amber and yield
   * on green if the avatar is in the same lane.
   */
  step(
    dtSeconds: number,
    scene: { avatarLane?: number | null; phase?: SignalPhase } = {},
  ): void {
    const list = Array.from(this.vehicles.values());

    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (scene.phase !== undefined) {
        const avatarLane = scene.avatarLane ?? null;
        if (shouldHold(avatarLane, scene.phase, v.laneIndex ?? null)) {
          v.speedMps = 0;
          continue;
        }
      }
      // Find leading vehicle (simplified along same general direction)
      let minGap: number | null = null;
      let vLead: number | null = null;

      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const other = list[j];
        // Approximate distance in meters
        const dLat = (other.pos.lat - v.pos.lat) * 111139;
        const dLng = (other.pos.lng - v.pos.lng) * 111139 * Math.cos((v.pos.lat * Math.PI) / 180);
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);

        if (dist < 40) {
          // Check if ahead in heading cone (+/- 45 deg)
          const angleToOther = (Math.atan2(dLng, dLat) * 180) / Math.PI;
          const diff = Math.abs(((angleToOther - v.headingDeg + 180) % 360) - 180);
          if (diff < 45 && dist > 0.5) {
            if (minGap === null || dist < minGap) {
              minGap = dist;
              vLead = other.speedMps;
            }
          }
        }
      }

      const accel = calculateIdmAcceleration(v.speedMps, vLead, minGap, {
        desiredSpeedMps: v.targetSpeedMps,
      });

      const { v: newSpeed, distanceM } = stepVehiclePhysics(v.speedMps, accel, dtSeconds);
      v.speedMps = newSpeed;

      // Move along heading
      const rad = (v.headingDeg * Math.PI) / 180;
      const dLatM = Math.cos(rad) * distanceM;
      const dLngM = Math.sin(rad) * distanceM;

      v.pos.lat += dLatM / 111139;
      v.pos.lng += dLngM / (111139 * Math.cos((v.pos.lat * Math.PI) / 180));
    }
  }
}
