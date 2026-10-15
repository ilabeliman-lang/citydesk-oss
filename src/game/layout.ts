export type Box = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
  tone: 0 | 1;
};

export const WORLD = { minX: -45, maxX: 45, minZ: -35, maxZ: 35 };
export const PLAYER_R = 0.45;
export const WALK = 3;

export const buildings: Box[] = [
  { id: "ne-a", minX: 12, maxX: 26, minZ: -22, maxZ: -10, h: 7, tone: 0 },
  { id: "ne-b", minX: 30, maxX: 43, minZ: -21, maxZ: -9, h: 11, tone: 1 },
  { id: "nw-a", minX: -28, maxX: -12, minZ: -22, maxZ: -10, h: 8, tone: 0 },
  { id: "nw-b", minX: -43, maxX: -32, minZ: -20, maxZ: -9, h: 6, tone: 1 },
  { id: "se-a", minX: 12, maxX: 30, minZ: 12, maxZ: 28, h: 6, tone: 0 },
  { id: "se-b", minX: 33, maxX: 43, minZ: 14, maxZ: 30, h: 9, tone: 1 },
  { id: "shop", minX: -30, maxX: -12, minZ: 12, maxZ: 28, h: 6, tone: 0 },
  { id: "sw-b", minX: -43, maxX: -34, minZ: 14, maxZ: 30, h: 10, tone: 1 },
  { id: "bus", minX: 4, maxX: 13, minZ: -1.3, maxZ: 1.3, h: 2.5, tone: 1 },
];

export const stall = { x: 22, z: 8, r: 2.3 };
export const shopDoor = { x: -21, z: 9.2, r: 2.4 };
export const fanSpot = { x: -18, z: -8, r: 2.2 };
export const bench = { x: 16, z: -8, r: 2.2 };
export const tap = { x: 8, z: 8, r: 2.2 };
export const neighbor = { x: -8, z: 8, r: 2.2 };

export const lamps = [
  { x: -30, z: -28 },
  { x: -10, z: -28 },
  { x: 10, z: -28 },
  { x: 30, z: -28 },
];

export const signs = [
  { name: "Aggrey Road", x: 34, z: 0 },
  { name: "Bonny Street", x: 0, z: 22 },
  { name: "High Road", x: -34, z: -28 },
];
