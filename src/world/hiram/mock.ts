/**
 * Designer note from a brief. Trims only. No network.
 */
export function hiramNote(brief: string): { role: "designer"; note: string } {
  brief = brief.trim();
  if (brief.length === 0) {
    throw new Error("empty brief");
  }
  return { role: "designer", note: brief };
}
