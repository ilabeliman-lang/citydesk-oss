/** How bright a street lamp pool is. Daylight is 0. */
export function lampHalo(night: number): number {
  if (!Number.isFinite(night) || night < 0.45) return 0;
  return Math.min(0.85, (night - 0.45) * 1.6);
}
