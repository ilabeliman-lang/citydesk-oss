/** Room name from hint tokens. No image model. */

export function roomLabel(hints: string[]): "bedroom" | "kitchen" | "room" {
  if (hints.includes("bed")) return "bedroom";
  if (hints.includes("cook")) return "kitchen";
  return "room";
}
