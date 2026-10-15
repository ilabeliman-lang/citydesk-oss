/** NDU-UPG #51 #93: ids of the realism building layers (tiny, dependency-free so CityBuildings can import it eagerly). */
export const REAL_BUILDINGS = "ndu-real-buildings";
export const REAL_ROOFS = "ndu-real-roofs";

/** Building layers a tap should hit: the style's own plus the real-height layer once it exists. */
export function tappableBuildingLayers(map: unknown): string[] {
  const m = map as { getLayer?: (id: string) => unknown };
  return ["building-3d", "building", REAL_BUILDINGS].filter((id) => {
    try {
      return Boolean(m.getLayer?.(id));
    } catch {
      return false;
    }
  });
}
