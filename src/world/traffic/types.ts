import { sizeOf } from "./dimensions.ts";

export type VehicleType = "keke" | "danfo" | "bus" | "car" | "okada";

export type VehicleDimensions = {
  lengthM: number;
  widthM: number;
  heightM: number;
};

const carPlan = sizeOf("car");
const busPlan = sizeOf("bus");

export const VEHICLE_DIMENSIONS: Record<VehicleType, VehicleDimensions> = {
  okada: { lengthM: 2.1, widthM: 0.8, heightM: 1.2 },
  keke: { lengthM: 2.6, widthM: 1.3, heightM: 1.7 },
  car: { lengthM: carPlan.length, widthM: carPlan.width, heightM: 1.5 },
  danfo: { lengthM: 5.2, widthM: 2.0, heightM: 2.2 },
  bus: { lengthM: busPlan.length, widthM: busPlan.width, heightM: 3.2 },
};

export const VEHICLE_DEFAULT_SPEEDS_MPS: Record<VehicleType, number> = {
  okada: 10.0, // ~36 km/h
  keke: 8.3,   // ~30 km/h
  car: 11.1,   // ~40 km/h
  danfo: 9.7,  // ~35 km/h
  bus: 8.3,    // ~30 km/h
};

export const TIER_VEHICLE_CAPS = {
  A: 40,
  B: 20,
  C: 0,
} as const;

export type Tier = keyof typeof TIER_VEHICLE_CAPS;

export const LIVERY_PALETTES: Record<VehicleType, string[]> = {
  keke: ["#27ae60", "#2ecc71", "#f1c40f"], // Green/yellow Keke livery
  danfo: ["#f39c12", "#f1c40f"],           // Classic Yellow/black stripe Danfo
  bus: ["#f1c40f", "#2980b9", "#e74c3c"],   // Honolulu TheBus yellow / standard city transit
  car: ["#34495e", "#7f8c8d", "#bdc3c7", "#e74c3c", "#2980b9"],
  okada: ["#c0392b", "#2c3e50", "#27ae60"],
};

export type VehicleState = {
  id: string;
  type: VehicleType;
  pos: { lat: number; lng: number };
  headingDeg: number;
  speedMps: number;
  targetSpeedMps: number;
  colorHex: string;
  roadId?: string;
  laneIndex?: number;
};
