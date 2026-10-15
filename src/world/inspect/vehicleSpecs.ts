// NDU-UPG inspect (#04): catalogue specs for the simulated vehicles (life/models.ts boxes).
// Keke length is 2.62 m (the drawn model incl. the front cab; a Bajaj RE is ~2.6 m), not the plan's 2.10.
// Dims are width × height × length in metres. Mass is a catalogue prior (confidence 0.5).
import type { VehicleKind } from "./types.ts";

export type VehicleSpec = { label: string; dimsM: [number, number, number]; massKg: number; seats: number; material: "steel"; hailable: boolean };

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  car: { label: "Car", dimsM: [1.8, 1.48, 4.3], massKg: 1300, seats: 5, material: "steel", hailable: false },
  keke: { label: "Keke (tricycle)", dimsM: [1.36, 1.81, 2.62], massKg: 350, seats: 4, material: "steel", hailable: true },
  danfo: { label: "Danfo (minibus)", dimsM: [1.99, 2.15, 4.82], massKg: 2100, seats: 14, material: "steel", hailable: true },
  bus: { label: "Bus", dimsM: [2.58, 3.13, 12.02], massKg: 11000, seats: 40, material: "steel", hailable: true },
};
