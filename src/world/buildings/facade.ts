/** Facade fill for a named building material. Pure colour — no mesh, no map. */

const FALLBACK = "#1a1714";

const FACADE: Record<string, string> = {
  concrete: "#c8c2b8",
  brick: "#8a4b32",
  glass: "#9bb0b8",
  metal: "#6e7270",
};

/** Known materials return their hex. Anything else stays the night fallback. */
export function facadeColour(material: string): string {
  return FACADE[material] ?? FALLBACK;
}
