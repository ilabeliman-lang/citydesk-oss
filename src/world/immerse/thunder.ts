/** Farther thunder sits further to one side. Near thunder stays almost centred. Pure. */
export function thunderPan(distanceKm: number): number {
  const d = Math.abs(distanceKm);
  if (!Number.isFinite(d)) return 0;
  const side = Math.floor(d) % 2 === 0 ? -1 : 1;
  return side * Math.min(0.7, d / 10);
}
