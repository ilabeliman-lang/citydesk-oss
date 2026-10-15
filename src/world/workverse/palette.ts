/**
 * Merged palette tokens for CityDesk Workverse:
 * Combines Jarvis Verse modern office (terrazzo, walnut, brass, dark starry void, neon)
 * with CityDesk African / Lagos architectural palette (sandcrete, warm gold/terracotta, slate, dark timber).
 */

export const WORKVERSE_PALETTE = {
  void: "#06080e",
  voidSky: "#0a0d18",
  slabFloor: "#1a1816",
  terrazzo: "#22201d",
  terrazzoLight: "#332e27",
  sandcreteWall: "#2c2621",
  acousticFelt: "#191c24",
  walnutSlat: "#2a1b14",
  warmBrass: "#d4a359",
  brassGlow: "#f0c14a",
  goldAccent: "#e8843a",
  neonCyan: "#22d3ee",
  neonMint: "#34d399",
  neonAmber: "#fbbf24",
  glassFrame: "#11141a",
  glassRailing: "rgba(34, 211, 238, 0.15)",
  deskTop: "#2a241f",
  deskLegs: "#0d0e12",
  meshChair: "#181a20",
  stateWorking: "#22c55e",
  stateWaiting: "#f59e0b",
  stateIdle: "#64748b",
  statePaused: "#94a3b8",
  codingVoidSky: "#0c0a1a",
  badgeBg: "rgba(15, 23, 42, 0.85)",
  badgeBorder: "rgba(240, 193, 74, 0.6)",
  textBright: "#f8fafc",
  textMuted: "#94a3b8",
} as const;

export const DEPARTMENT_COLORS: Record<string, string> = {
  // Council Floor 0
  Office: "#e8843a",
  "Saturday list": "#f59e0b",
  Block: "#38bdf8",
  Citizen: "#a855f7",
  Vouchers: "#10b981",
  Chime: "#ec4899",
  Age: "#6366f1",
  Walk: "#14b8a6",

  // Coding Floor 1
  Coding: "#8b5cf6",
  Server: "#10b981",
  Database: "#06b6d4",
  Simulation: "#f59e0b",
  Map: "#3b82f6",
  Audio: "#ec4899",
};
