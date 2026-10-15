import { COUNCIL } from "@/studio/council";
import type { DeskPosition, Waypoint, WorkverseFloorLayout } from "./types";

export function getWorkverseLayout(floorId: number = 0): WorkverseFloorLayout {
  if (floorId === 1) {
    const desks: DeskPosition[] = [
      // West Studio Bench
      {
        id: "ide-agentic",
        memberId: "ide-agentic",
        name: "Agentic IDE",
        x: -4,
        y: 0,
        z: -2.5,
        rotation: 0,
        department: "Coding",
      },
      {
        id: "ide-vite",
        memberId: "ide-vite",
        name: "Vite Server",
        x: -4,
        y: 0,
        z: 0.5,
        rotation: 0,
        department: "Server",
      },
      {
        id: "ide-db",
        memberId: "ide-db",
        name: "Database Engine",
        x: -4,
        y: 0,
        z: 3.5,
        rotation: 0,
        department: "Database",
      },

      // East Studio Bench
      {
        id: "ide-sim",
        memberId: "ide-sim",
        name: "Sim Core",
        x: 4,
        y: 0,
        z: -2.5,
        rotation: Math.PI,
        department: "Simulation",
      },
      {
        id: "ide-map",
        memberId: "ide-map",
        name: "Map Streamer",
        x: 4,
        y: 0,
        z: 0.5,
        rotation: Math.PI,
        department: "Map",
      },
      {
        id: "ide-audio",
        memberId: "ide-audio",
        name: "Audio Core",
        x: 4,
        y: 0,
        z: 3.5,
        rotation: Math.PI,
        department: "Audio",
      },
    ];

    const waypoints: Waypoint[] = [
      {
        id: "wp-elevator",
        label: "Elevator",
        x: -7.5,
        y: 0,
        z: 5.5,
        kind: "elevator",
      },
      {
        id: "wp-spawn",
        label: "Spawn point",
        x: 0,
        y: 0,
        z: -0.5,
        kind: "spawn",
      },
      {
        id: "wp-mission-control",
        label: "Mission Control",
        x: 0,
        y: 0,
        z: -6.5,
        kind: "mission_control",
      },
      {
        id: "wp-breakroom",
        label: "Break room",
        x: 5.5,
        y: 0,
        z: 5.5,
        kind: "break_room",
      },
    ];

    return {
      floorId: 1,
      floorName: "Coding Floor & Mission Control",
      width: 22,
      depth: 17,
      desks,
      waypoints,
      spawnPoint: [0, 0, 1.5],
      elevatorPoint: [-7.5, 0, 5.5],
    };
  }

  // 8 council desks placed in two collaborative studio benches
  const desks: DeskPosition[] = [
    // West Studio Bench
    {
      id: "desk-pane",
      memberId: "pane",
      name: "Pane",
      x: -4,
      y: 0,
      z: -3.5,
      rotation: 0,
      department: "Office",
    },
    {
      id: "desk-warden",
      memberId: "warden",
      name: "Warden",
      x: -4,
      y: 0,
      z: -1.5,
      rotation: 0,
      department: "Saturday list",
    },
    {
      id: "desk-street",
      memberId: "street",
      name: "Streetwright",
      x: -4,
      y: 0,
      z: 1.0,
      rotation: 0,
      department: "Block",
    },
    {
      id: "desk-body",
      memberId: "body",
      name: "Body",
      x: -4,
      y: 0,
      z: 3.0,
      rotation: 0,
      department: "Citizen",
    },

    // East Studio Bench
    {
      id: "desk-ledger",
      memberId: "ledger",
      name: "Ledger",
      x: 4,
      y: 0,
      z: -3.5,
      rotation: Math.PI,
      department: "Vouchers",
    },
    {
      id: "desk-signal",
      memberId: "signal",
      name: "Signal",
      x: 4,
      y: 0,
      z: -1.5,
      rotation: Math.PI,
      department: "Chime",
    },
    {
      id: "desk-gate",
      memberId: "gate",
      name: "Gate",
      x: 4,
      y: 0,
      z: 1.0,
      rotation: Math.PI,
      department: "Age",
    },
    {
      id: "desk-navigator",
      memberId: "navigator",
      name: "Navigator",
      x: 4,
      y: 0,
      z: 3.0,
      rotation: Math.PI,
      department: "Walk",
    },
  ];

  const waypoints: Waypoint[] = [
    {
      id: "wp-elevator",
      label: "Elevator",
      x: -7.5,
      y: 0,
      z: 5.5,
      kind: "elevator",
    },
    {
      id: "wp-spawn",
      label: "Spawn point",
      x: 0,
      y: 0,
      z: -0.5,
      kind: "spawn",
    },
    {
      id: "wp-mission-control",
      label: "Mission Control",
      x: 0,
      y: 0,
      z: -6.5,
      kind: "mission_control",
    },
    {
      id: "wp-breakroom",
      label: "Break room",
      x: 5.5,
      y: 0,
      z: 5.5,
      kind: "break_room",
    },
  ];

  return {
    floorId: 0,
    floorName: "Council Office",
    width: 22,
    depth: 17,
    desks,
    waypoints,
    spawnPoint: [0, 0, 1.5],
    elevatorPoint: [-7.5, 0, 5.5],
  };
}
