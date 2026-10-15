import { bench, fanSpot, neighbor, shopDoor, stall, tap } from "./layout";
import type { Sim } from "./sim";

export const MISSIONS = [
  {
    id: "plate",
    title: "First plate",
    brief: "Morning is empty. Reach the stall on Aggrey and eat.",
    steps: ["Reach the food stall", "Buy a plate"],
  },
  {
    id: "shift",
    title: "Shop shift",
    brief: "The shop needs hands. Take the shift and stay at the door.",
    steps: ["Accept the shop shift", "Finish the shift at the door"],
  },
  {
    id: "current",
    title: "NEPA hour",
    brief: "Cut the current, bring it back, then spin the compound fan.",
    steps: ["Switch NEPA off", "Switch NEPA back on", "Spin the compound fan"],
  },
  {
    id: "rest",
    title: "Sit down",
    brief: "The bench is on the north sidewalk. Rest and let energy come back.",
    steps: ["Reach the bench", "Rest"],
  },
  {
    id: "wash",
    title: "Standpipe",
    brief: "Wash at the tap beside Aggrey.",
    steps: ["Reach the tap", "Wash"],
  },
  {
    id: "greet",
    title: "Neighbor",
    brief: "Someone is waiting on the south sidewalk. Greet them.",
    steps: ["Reach the neighbor", "Greet them"],
  },
  {
    id: "rent",
    title: "Saturday mark",
    brief: "Light High Road, then stay until rent is marked due.",
    steps: ["Turn the High Road lamps on", "See rent marked due"],
  },
] as const;

export type Seen = {
  stall: boolean;
  bench: boolean;
  tap: boolean;
  neighbor: boolean;
  nepaOff: boolean;
  nepaBack: boolean;
  fanSpun: boolean;
  lamps: boolean;
  rested: boolean;
  washed: boolean;
  greeted: boolean;
};

export function freshSeen(): Seen {
  return {
    stall: false,
    bench: false,
    tap: false,
    neighbor: false,
    nepaOff: false,
    nepaBack: false,
    fanSpun: false,
    lamps: false,
    rested: false,
    washed: false,
    greeted: false,
  };
}

export function stepCleared(s: Sim, missionIndex: number, step: number) {
  const ate = s.ledger.some((row) => row.label === "Food stall");
  const id = MISSIONS[missionIndex]?.id;
  if (id === "plate") return step === 0 ? s.seen.stall : ate;
  if (id === "shift") return step === 0 ? s.job !== "none" : s.job === "done";
  if (id === "current") {
    if (step === 0) return s.seen.nepaOff;
    if (step === 1) return s.seen.nepaBack;
    return s.seen.fanSpun;
  }
  if (id === "rest") return step === 0 ? s.seen.bench : s.seen.rested;
  if (id === "wash") return step === 0 ? s.seen.tap : s.seen.washed;
  if (id === "greet") return step === 0 ? s.seen.neighbor : s.seen.greeted;
  if (id === "rent") return step === 0 ? s.seen.lamps : s.gameMinutes >= 60;
  return false;
}

export function objectiveBlip(s: Sim): { x: number; z: number } | null {
  const mission = MISSIONS[s.missionIndex];
  if (!mission) return null;
  if (mission.id === "plate") return { x: stall.x, z: stall.z };
  if (mission.id === "shift") return s.missionStep === 0 ? null : { x: shopDoor.x, z: shopDoor.z };
  if (mission.id === "current") return { x: fanSpot.x, z: fanSpot.z };
  if (mission.id === "rest") return { x: bench.x, z: bench.z };
  if (mission.id === "wash") return { x: tap.x, z: tap.z };
  if (mission.id === "greet") return { x: neighbor.x, z: neighbor.z };
  return { x: 0, z: -28 };
}
