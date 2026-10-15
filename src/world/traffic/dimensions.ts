/**
 * Plan size of a traffic vehicle, in metres. Pure — no simulation, no I/O.
 * A vehicle fits a lane only when its width is strictly inside the lane width.
 */

export type VehicleKind = "car" | "bus";

export type VehicleSize = {
  width: number;
  length: number;
};

const SIZES: Record<VehicleKind, VehicleSize> = {
  car: { width: 1.8, length: 4.2 },
  bus: { width: 2.5, length: 12 },
};

export function sizeOf(kind: VehicleKind): VehicleSize {
  const size = SIZES[kind];
  return { width: size.width, length: size.length };
}

export function fitsLane(kind: VehicleKind, laneWidth: number): boolean {
  return sizeOf(kind).width < laneWidth;
}
