// NDU-FP (FPXR-13): which footstep surface a way kind maps to, and when steps may sound. Pure. PLAN.md §4.4.
export type Surface = "asphalt" | "laterite" | "concrete" | "grass" | "gravel" | "wet" | "wood";
const ROADS = new Set(["primary", "secondary", "tertiary", "residential", "service", "trunk", "unclassified", "living_street", "road"]);
const PATHS = new Set(["footway", "path", "pedestrian", "track", "sidewalk", "cycleway"]);
export function surfaceFor(kind: string, paved = false): Surface {
  if (kind === "steps") return "concrete";
  if (PATHS.has(kind)) return paved ? "concrete" : "laterite";
  if (ROADS.has(kind)) return "asphalt";
  return "grass";
}
export const footstepGate = (s: { sound: boolean; footsteps: boolean; active: boolean }) => s.sound && s.footsteps && s.active;
