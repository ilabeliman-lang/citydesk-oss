import { cruise, posePoint, type Net, type Pose } from "@/world/paths";

export const RIDE_COST = 5;

export type Stop = { lat: number; lng: number };
export type RideVehicle = "keke" | "bus";

const SEAT_CAP: Record<RideVehicle, number> = { keke: 3, bus: 12 };
const seats: Record<RideVehicle, number> = { keke: 3, bus: 12 };

type Slip = { stop: Stop };
const pending: Record<RideVehicle, Slip | null> = { keke: null, bus: null };
const order: RideVehicle[] = [];

export function aheadPoint(net: Net, pose: Pose, meters: number): Stop {
  return posePoint(net, cruise(net, pose, meters));
}

export function askRide(stop: Stop) {
  const vehicle: RideVehicle | null = pending.keke ? (pending.bus ? null : "bus") : "keke";
  if (!vehicle) return;
  pending[vehicle] = { stop };
  order.push(vehicle);
}

export function takeRide(): Stop | null {
  while (order.length) {
    const vehicle = order.shift();
    if (!vehicle) break;
    const slip = pending[vehicle];
    if (!slip) continue;
    pending[vehicle] = null;
    return slip.stop;
  }
  return null;
}

export function cancelRide(vehicle?: RideVehicle): boolean {
  const list: RideVehicle[] = vehicle ? [vehicle] : ["keke", "bus"];
  let cleared = false;
  for (const item of list) {
    if (!pending[item]) continue;
    pending[item] = null;
    const at = order.indexOf(item);
    if (at >= 0) order.splice(at, 1);
    releaseSeat(item);
    cleared = true;
  }
  return cleared;
}

export function seatsLeft(vehicle: RideVehicle) {
  return seats[vehicle];
}

export function releaseSeat(vehicle: RideVehicle) {
  seats[vehicle] = Math.min(SEAT_CAP[vehicle], seats[vehicle] + 1);
}

export function boardRide(vehicle: RideVehicle, stop: Stop): boolean {
  if (pending[vehicle]) return false;
  if (seats[vehicle] < 1) return false;
  seats[vehicle] -= 1;
  pending[vehicle] = { stop };
  order.push(vehicle);
  return true;
}

function stopsAlong(net: Net, pose: Pose, count: number, gap: number): Stop[] {
  const out: Stop[] = [];
  let cursor = pose;
  for (let i = 0; i < count; i += 1) {
    cursor = cruise(net, cursor, gap);
    out.push(posePoint(net, cursor));
  }
  return out;
}

export function kekeStops(net: Net, pose: Pose) {
  return stopsAlong(net, pose, 4, 80);
}

export function busStops(net: Net, pose: Pose) {
  return stopsAlong(net, pose, 3, 220);
}

export function timetable(vehicle: RideVehicle) {
  if (vehicle === "keke") return [1, 2, 3, 4].map((stop) => `Stop ${stop} · ${stop * 80} m`);
  return [1, 2, 3].map((stop) => `Stop ${stop} · ${stop * 220} m`);
}

export function yieldTo(a: RideVehicle, b: RideVehicle): RideVehicle | "either" {
  if (a === b) return "either";
  return "keke";
}
