/** Fallback wall colour when OSM has a material and no building:colour. Hex only. */

const TINT: Record<string, string> = {
  brick: "#8d4b3a",
  concrete: "#b7b1a8",
  cement_block: "#c4bdb4",
  concrete_blocks: "#c4bdb4",
  wood: "#a67c52",
  glass: "#8ea4b0",
  stone: "#9a9286",
  metal: "#8d9398",
  plaster: "#e4d8c8",
  mud: "#8a6a45",
  laterite: "#a24b32",
};

export function materialColour(material: string | null | undefined): string {
  const key = (material ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return TINT[key] ?? "";
}
