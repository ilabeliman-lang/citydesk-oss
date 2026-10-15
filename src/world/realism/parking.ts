/** How full a mapped lot looks, from the same clock as the sun dial. 0..0.72. */

export function lotFullness(minutes: number): number {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  const rush = Math.exp(-((h - 8.5) ** 2) / 8) + Math.exp(-((h - 17.5) ** 2) / 8);
  return Math.min(0.72, 0.18 + rush * 0.45);
}
