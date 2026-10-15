/**
 * Environment and Vehicle Interaction subsystem for CityDesk life simulation.
 * Manages hailing, ticketing, ride progress, fares, and street prop interactions.
 */

export type RidePhase = "idle" | "hailing" | "boarding" | "riding" | "alighting";

export type VehicleRideKind = "keke" | "danfo" | "car" | "bus";

export type RideTicket = {
  vehicleId: number;
  kind: "keke" | "danfo" | "car" | "bus";
  fare: number;
  startTime: number;
  distanceM: number;
};

export type PropKind = "bench" | "standpipe" | "stall";

export type PropInteractionResult = {
  kind: PropKind;
  deltaNeeds: Record<string, number>;
  message: string;
  cost: number;
};

export const MAX_HAIL_SPEED_MPS = 8;
export const MAX_HAIL_DISTANCE_M = 20;

export const STALL_VOUCHER_COST = 10;

export const FARE_BASE: Record<string, number> = {
  keke: 5,
  danfo: 5,
  bus: 8,
  car: 15,
};

export const FARE_PER_KM: Record<string, number> = {
  keke: 2,
  danfo: 2,
  bus: 1,
  car: 4,
};

/**
 * Checks whether an agent can hail a moving vehicle based on its speed and distance.
 */
export function canHail(vehicleSpeed: number, distanceM: number): boolean {
  if (!Number.isFinite(vehicleSpeed) || !Number.isFinite(distanceM)) return false;
  if (vehicleSpeed < 0 || distanceM < 0) return false;
  return vehicleSpeed <= MAX_HAIL_SPEED_MPS && distanceM <= MAX_HAIL_DISTANCE_M;
}

/**
 * Calculates the ride fare in vouchers based on vehicle kind and distance in metres.
 */
export function calculateFare(kind: string, distanceM: number): number {
  const base = FARE_BASE[kind] ?? 5;
  const rate = FARE_PER_KM[kind] ?? 2;
  const validDist = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  const km = validDist / 1000;
  return Math.round(base + km * rate);
}

/**
 * Issues a new ride ticket for boarding a vehicle.
 */
export function createTicket(
  vehicleId: number,
  kind: "keke" | "danfo" | "car" | "bus",
  fare?: number,
): RideTicket {
  return {
    vehicleId,
    kind,
    fare: fare !== undefined ? fare : calculateFare(kind, 0),
    startTime: Date.now(),
    distanceM: 0,
  };
}

/**
 * Steps the ride progress forward by dtSec seconds at speedMps m/s, accumulating distance.
 */
export function stepRideProgress(ticket: RideTicket, dtSec: number, speedMps: number): RideTicket {
  const validDt = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0;
  const validSpeed = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  const deltaDistance = validDt * validSpeed;
  return {
    ...ticket,
    distanceM: ticket.distanceM + deltaDistance,
  };
}

/**
 * Interacts with an environmental street prop (bench, standpipe, stall), updating agent needs.
 * - bench: restores energy +25, comfort +20, free
 * - standpipe: restores hygiene +40, free
 * - stall: costs 10 vouchers, restores hunger +40, health +10 (requires at least 10 vouchers)
 */
export function interactProp(kind: PropKind, vouchersAvailable: number): PropInteractionResult {
  switch (kind) {
    case "bench":
      return {
        kind: "bench",
        deltaNeeds: { energy: 25, comfort: 20 },
        message: "You rest on the bench. Restored energy and comfort.",
        cost: 0,
      };
    case "standpipe":
      return {
        kind: "standpipe",
        deltaNeeds: { hygiene: 40 },
        message: "The standpipe runs. You wash and restore hygiene.",
        cost: 0,
      };
    case "stall": {
      const cost = STALL_VOUCHER_COST;
      if (Number.isFinite(vouchersAvailable) && vouchersAvailable >= cost) {
        return {
          kind: "stall",
          deltaNeeds: { hunger: 40, health: 10 },
          message: "Bought food and refreshments from the stall. Restored hunger and health.",
          cost,
        };
      }
      return {
        kind: "stall",
        deltaNeeds: {},
        message: "Insufficient vouchers to purchase from the stall.",
        cost: 0,
      };
    }
  }
}
