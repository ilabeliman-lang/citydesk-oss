/**
 * Id of the nearer door in plan metres.
 * An empty door list is null. Equal distance keeps the earlier door.
 */
export function nearestDoor(
  point: { x: number; y: number },
  doors: { id: string; x: number; y: number }[],
): string | null {
  let bestId: string | null = null;
  let best = Infinity;
  for (const door of doors) {
    const dx = door.x - point.x;
    const dy = door.y - point.y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bestId = door.id;
    }
  }
  return bestId;
}
