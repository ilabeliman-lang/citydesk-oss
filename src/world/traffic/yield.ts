/**
 * Pure yield rule for city traffic.
 * A vehicle holds for a red or amber signal, and also on green when the
 * avatar occupies the same lane. No I/O.
 */

export type SignalPhase = "red" | "amber" | "green";

/**
 * Whether a vehicle should hold.
 *
 * @param avatarLane Lane the avatar occupies, or null when the avatar is off the roadway.
 * @param phase Signal phase facing the vehicle.
 * @param vehicleLane This vehicle's lane. Omit it (or pass null) when the lane is unknown;
 *   green then does not yield, because there is no lane to compare.
 * @returns true when the vehicle must hold: speed zero, no advance this step.
 */
export function shouldHold(
  avatarLane: number | null,
  phase: SignalPhase,
  vehicleLane: number | null = null,
): boolean {
  if (phase === "red" || phase === "amber") return true;
  if (avatarLane == null || vehicleLane == null) return false;
  if (!Number.isFinite(avatarLane) || !Number.isFinite(vehicleLane)) return false;
  return avatarLane === vehicleLane;
}
