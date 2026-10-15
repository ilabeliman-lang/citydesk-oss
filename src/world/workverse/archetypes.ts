import { BuildingArchetype, WorkverseFloorLayout } from "./types";
import { getWorkverseLayout } from "./layout";

export function detectBuildingArchetype(feature: any, placeName?: string): BuildingArchetype {
  const name = (placeName || feature?.properties?.name || "").toLowerCase();
  if (name.includes("zealous pane") || name.includes("jarvis verse")) {
    return "flagship_verse";
  }
  
  const tags = feature?.properties || {};
  const amenity = tags.amenity?.toLowerCase();
  const shop = tags.shop?.toLowerCase();
  const office = tags.office?.toLowerCase();
  const building = tags.building?.toLowerCase();

  if (amenity === "bank" || office) {
    return "corporate_office";
  }
  if (shop || amenity === "kiosk" || amenity === "supermarket") {
    return "retail_market";
  }
  if (amenity === "place_of_worship" || amenity === "civic" || amenity === "townhall" || building === "civic") {
    return "civic_assembly";
  }
  if (building === "residential" || building === "apartments" || building === "house" || building === "yes") {
    return "residential";
  }
  
  return "residential";
}

export function getArchetypeLayout(archetype: BuildingArchetype, floorAreaM2: number = 200, floorId: number = 0): WorkverseFloorLayout {
  if (archetype === "flagship_verse") return getWorkverseLayout(floorId);
  const width = Math.max(8, Math.min(40, Math.sqrt(floorAreaM2) * 1.5));
  const depth = Math.max(8, Math.min(30, Math.sqrt(floorAreaM2) / 1.5));
  return {
    floorId,
    floorName: floorId === 0 ? "Street floor" : `Floor ${floorId + 1}`,
    width,
    depth,
    desks: [],
    waypoints: [{ id: "wp-door", label: "Street door", x: 0, y: 0, z: depth / 2 - 1, kind: "spawn" }],
    spawnPoint: [0, 0, 0],
    elevatorPoint: [-width / 2 + 1.2, 0, 0],
  };
}
