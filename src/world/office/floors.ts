/** Office floors are 0..count-1. Up and down stop at the ends. They do not wrap. */

export function nextFloor(current: number, dir: "up" | "down", count: number): number {
  const last = count - 1;
  const next = dir === "up" ? current + 1 : current - 1;
  if (next < 0) return 0;
  if (next > last) return last;
  return next;
}
