import type { PoiKind } from "./parse.ts";

/**
 * NDU-UPG life (#207 #231 #258 #263 #278 #280): how many walkers and vehicles to show, and where.
 * Driven by the realism time state (local minutes on the dial + weekday), the device tier and the
 * degrade ladder. Pure; unit tested in life.test.ts.
 */

export type Tier = "A" | "B" | "C";
export type Region = "ng" | "hi" | "other";
export type VKind = "car" | "keke" | "bus" | "danfo";

/** Per-tier caps (#231 vehicles A 40 / B 20 / C 0; #278 crowd caps — instanced, so a bit above the skinned caps). */
export const CAPS: Record<Tier, { walkers: number; vehicles: number }> = {
  A: { walkers: 72, vehicles: 40 },
  B: { walkers: 28, vehicles: 20 },
  C: { walkers: 0, vehicles: 0 },
};

const lerpTable = (table: [number, number][], m: number) => {
  const h = (((m / 60) % 24) + 24) % 24;
  for (let i = 1; i < table.length; i += 1) {
    const [h1, v1] = table[i];
    const [h0, v0] = table[i - 1];
    if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0 || 1);
  }
  return table[table.length - 1][1];
};

/** People on foot by local hour: quiet at night, busy late morning and early evening. */
export const walkFactor = (minutes: number) =>
  lerpTable(
    [
      [0, 0.1],
      [5, 0.08],
      [7, 0.55],
      [9, 0.8],
      [12, 1],
      [14, 0.9],
      [17, 0.95],
      [19, 1],
      [21, 0.55],
      [23, 0.18],
      [24, 0.1],
    ],
    minutes,
  );

/** Traffic by local hour: rush hours 7-9 and 16-19 (#207). */
export const driveFactor = (minutes: number) =>
  lerpTable(
    [
      [0, 0.15],
      [5, 0.2],
      [6.5, 0.6],
      [7.5, 1],
      [9, 1],
      [10, 0.7],
      [15.5, 0.75],
      [16.5, 1],
      [19, 1],
      [20, 0.55],
      [22, 0.3],
      [24, 0.15],
    ],
    minutes,
  );

export type Targets = { walkers: number; vehicles: number };

/** weekday: 0 = Sunday. step: degrade-ladder rungs dropped (>= 4 halves the crowd, like the skinned rung). */
export function lifeTargets(tier: Tier, minutes: number, weekday: number, step = 0): Targets {
  const cap = CAPS[tier];
  if (!cap.walkers && !cap.vehicles) return { walkers: 0, vehicles: 0 };
  let w = walkFactor(minutes);
  let v = driveFactor(minutes);
  const h = minutes / 60;
  if (weekday === 0 && h >= 7 && h < 13) {
    w *= 1.1; // Sunday service crowds
    v *= 0.7;
  }
  if (weekday === 6 && h >= 8 && h < 17) w *= 1.1; // Saturday market
  const half = step >= 4 ? 0.5 : 1;
  return {
    walkers: Math.round(Math.min(1, w) * cap.walkers * half),
    vehicles: Math.round(Math.min(1, v) * cap.vehicles * half),
  };
}

/** How strongly a POI pulls walkers at this hour/day (#258 #263 #280). */
export function poiPull(kind: PoiKind, minutes: number, weekday: number): number {
  const h = minutes / 60;
  const night = h < 6 || h >= 21;
  switch (kind) {
    case "market":
      if (night) return 0.3;
      return weekday === 6 ? 9 : h >= 7 && h < 18 ? 6 : 1.5; // traders open stalls at 7
    case "church":
      return weekday === 0 && h >= 7 && h < 13 ? 8 : night ? 0.2 : 1;
    case "bus":
    case "station":
      return night ? 0.6 : (h >= 7 && h < 9) || (h >= 16 && h < 19) ? 5 : 2.5;
    case "food":
      return h >= 11 && h < 14 ? 4 : h >= 17 && h < 22 ? 4.5 : night ? 1 : 1.5; // gatherings near lit food spots at night
    case "shop":
      return night ? 0.4 : 1.5;
    case "door":
      return night ? 0.2 : 2.2;
    case "bench":
      return night ? 0.1 : 1.1;
    default:
      return 0;
  }
}

export function regionOf(lat: number, lng: number): Region {
  if (lat > 3 && lat < 14.5 && lng > 2 && lng < 15) return "ng";
  if (lat > 18 && lat < 23 && lng > -161 && lng < -154) return "hi";
  return "other";
}

/** Vehicle mix per city (#217): Nigerian wards get kekes + danfos; Honolulu gets TheBus and fewer kekes. */
export const MIX: Record<Region, [VKind, number][]> = {
  ng: [
    ["keke", 0.36],
    ["danfo", 0.2],
    ["car", 0.34],
    ["bus", 0.1],
  ],
  hi: [
    ["car", 0.68],
    ["bus", 0.14],
    ["keke", 0.18],
  ],
  other: [
    ["car", 0.72],
    ["bus", 0.12],
    ["keke", 0.16],
  ],
};

/** Liveries (#217), sRGB hex. */
export const LIVERY: Record<Region, Record<VKind, number[]>> = {
  ng: {
    keke: [0xf2c12e, 0x2f8f46, 0xf2c12e],
    danfo: [0xf2b705],
    bus: [0x2b5fae, 0xc7372f],
    car: [0xe8e6e1, 0xb9bcc2, 0x2a2a2e, 0x7a1f1f, 0x2f5d9e, 0x6b6e73],
  },
  hi: {
    keke: [0x1fa3a3, 0xf2c12e],
    danfo: [0xf2b705],
    bus: [0xf5c518],
    car: [0xf2f1ee, 0xb9bcc2, 0x2a2a2e, 0xb3302a, 0x2f5d9e, 0x6b6e73, 0x3f7f6a],
  },
  other: {
    keke: [0xf2c12e, 0x2f8f46],
    danfo: [0xf2b705],
    bus: [0xd9532b, 0x2b5fae],
    car: [0xe8e6e1, 0xb9bcc2, 0x2a2a2e, 0xb3302a, 0x2f5d9e],
  },
};

/** Inclusive skin tones for Hawaii and Nigeria populations (#281), sRGB hex. */
export const SKIN = [0x3b2219, 0x4a2c20, 0x5c3a28, 0x6e4530, 0x8a5a3c, 0xa06d4b, 0xb98060, 0xc99673, 0xdcae8c, 0xe8c3a2];

/** Outfit colours incl. Ankara-bright and aloha-print tones (#255-lite, no textures). */
export const OUTFIT: Record<Region, number[]> = {
  ng: [0xe8843a, 0x2f8f46, 0x8e3b8e, 0xf2c12e, 0x1f6fb2, 0xc7372f, 0xf6efe2, 0x2a2a2e, 0x12857a],
  hi: [0x1fa3a3, 0xf0805a, 0xf6efe2, 0x2f5d9e, 0xe8c547, 0x5a8f3e, 0xd94f70, 0x2a2a2e, 0x8ac6e0],
  other: [0x2f5d9e, 0xf6efe2, 0x2a2a2e, 0xc7372f, 0x5a8f3e, 0xe8843a, 0x8e3b8e],
};

/** Local weekday (0 = Sunday) of an instant in an IANA / Etc zone. */
export function weekdayIn(at: Date, zone: string): number {
  try {
    const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone }).format(at);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  } catch {
    return at.getDay();
  }
}
