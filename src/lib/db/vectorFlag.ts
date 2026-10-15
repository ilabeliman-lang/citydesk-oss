/** Vector search is off unless the flag string is exactly "on". No extension is created. */

export function vectorEnabled(flag: string): boolean {
  return flag === "on";
}
