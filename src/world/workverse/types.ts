export type AgentState = "working" | "waiting" | "idle" | "paused";

export type BuildingArchetype =
  | "flagship_verse"
  | "corporate_office"
  | "retail_market"
  | "civic_assembly"
  | "residential";

export interface CouncilMember {
  id: string;
  name: string;
  module: string;
  duty: string;
}

export interface DeskPosition {
  id: string;
  memberId: string;
  name: string;
  x: number;
  y: number; // height (ground level = 0)
  z: number;
  rotation: number; // Y rotation in radians
  department: string;
}

export interface Waypoint {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  kind: "elevator" | "spawn" | "mission_control" | "break_room" | "studio" | "desk";
}

export interface WorkverseFloorLayout {
  floorId: number;
  floorName: string;
  width: number;
  depth: number;
  desks: DeskPosition[];
  waypoints: Waypoint[];
  spawnPoint: [number, number, number];
  elevatorPoint: [number, number, number];
}

export interface PlayerTransform {
  position: [number, number, number];
  rotation: number;
  moving: boolean;
}
