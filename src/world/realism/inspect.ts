/** One line for a building that has no name. Tags already on the feature. No network. */

export function inspectLine(tags: Record<string, unknown> | null | undefined): string {
  if (!tags) return "";
  const bits: string[] = [];
  const levels = tags["building:levels"];
  if (typeof levels === "string" && levels.trim()) bits.push(`${levels.trim()} floors`);
  const material = tags["building:material"];
  if (typeof material === "string" && material.trim()) bits.push(material.trim());
  const hours = tags.opening_hours;
  if (typeof hours === "string" && hours.trim()) bits.push(hours.trim());
  return bits.join(" · ");
}
