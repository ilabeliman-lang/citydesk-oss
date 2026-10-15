/** Street collision in metres. Pure. No map. */

export type Disc = { x: number; y: number; r: number };

/** Slide toward `to`. A person or car in the way stops that axis. */
export function slideMeters(
  from: { x: number; y: number },
  to: { x: number; y: number },
  discs: Disc[],
  body = 0.4,
): { x: number; y: number } {
  const blocked = (x: number, y: number) => discs.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + body);
  if (!blocked(to.x, to.y)) return { x: to.x, y: to.y };
  if (!blocked(to.x, from.y)) return { x: to.x, y: from.y };
  if (!blocked(from.x, to.y)) return { x: from.x, y: to.y };
  return { x: from.x, y: from.y };
}

/** A building hit blocks the walk, unless it is a door or a passage. */
export function blocksBuilding(props: Record<string, unknown> | null | undefined): boolean {
  if (!props) return true;
  if (props.entrance || props.door || props["building:passage"]) return false;
  const tunnel = String(props.tunnel ?? "");
  return tunnel !== "yes" && tunnel !== "building_passage";
}
