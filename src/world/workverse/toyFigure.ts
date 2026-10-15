/**
 * 3D Toy Figure Model & Kinematics Specification.
 *
 * Provides pure data, dimensions, looks, outfits, and procedural animation poses
 * for CityDesk Workverse characters (COUNCIL agents, player avatar, Ada companion).
 *
 * Follows the Jarvis Verse chibi toy specification:
 * - Large round head with expressive features
 * - Short rounded torso with tailored outfits
 * - Articulated arms and legs with chunky sneakers
 * - Real forward kinematics for typing, walking, waving, sitting, and idle states
 */

import type { AgentState } from "./types";

// ---------------------------------------------------------------------------
// Look, Outfits & Palettes
// ---------------------------------------------------------------------------

export type HairStyle =
  | "short"
  | "spiky"
  | "bun"
  | "curly"
  | "long"
  | "beanie"
  | "cap"
  | "bald"
  | "slick"
  | "sidepart"
  | "buzz"
  | "ponytail";

export const HAIR_STYLES: readonly HairStyle[] = [
  "short",
  "slick",
  "sidepart",
  "buzz",
  "spiky",
  "curly",
  "long",
  "ponytail",
  "bun",
  "beanie",
  "cap",
  "bald",
];

export type OutfitId =
  | "tee"
  | "hoodie"
  | "suit"
  | "leather"
  | "vest"
  | "turtleneck"
  | "blazer"
  | "quarterzip";

export const OUTFIT_IDS: readonly OutfitId[] = [
  "tee",
  "hoodie",
  "suit",
  "leather",
  "vest",
  "turtleneck",
  "blazer",
  "quarterzip",
];

export type Eyewear = "none" | "glasses" | "shades";
export const EYEWEAR: readonly Eyewear[] = ["none", "glasses", "shades"];

export interface ToyLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  shirtAccent: string;
  inner: string;
  pants: string;
  shoes: string;
  blush: boolean;
  outfit: OutfitId;
  eyewear: Eyewear;
}

export interface ToyFigureColors {
  shirt: string;
  pants: string;
  hair: string;
  skin: string;
  shoes: string;
}

export const SKIN_TONES = [
  "#f6d3b8",
  "#f1c4a0",
  "#e9b48e",
  "#d8a37c",
  "#c68a62",
  "#a8704c",
  "#8a5a3c",
  "#6b4430",
] as const;

export const HAIR_COLOURS = [
  "#1a1412",
  "#2a1d15",
  "#3b2a20",
  "#6b4226",
  "#9e5d47",
  "#d9b36c",
  "#c9c9c9",
  "#1d1d24",
] as const;

export const SHIRT_COLOURS = [
  "#3f7fd6",
  "#e8843a",
  "#22c55e",
  "#e11d48",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#2b2b33",
] as const;

export const PANTS_COLOURS = [
  "#1e293b",
  "#2f4a7a",
  "#18181b",
  "#23304f",
  "#3b3f4a",
  "#5a4636",
] as const;

export const DEFAULT_SHOES = "#f8fafc";
export const DEFAULT_INNER = "#f2f2ee";

export interface Colourway {
  id: string;
  primary: string;
  secondary: string;
  accent: string;
  inner: string;
  shoes: string;
}

export interface OutfitDef {
  id: OutfitId;
  colourways: readonly Colourway[];
}

export const OUTFITS: readonly OutfitDef[] = [
  {
    id: "blazer",
    colourways: [
      { id: "navy", primary: "#1f2a44", secondary: "#334155", accent: "#d4a359", inner: "#f8fafc", shoes: "#1a1414" },
      { id: "charcoal", primary: "#2c3038", secondary: "#181a20", accent: "#e8843a", inner: "#f1f5f9", shoes: "#111113" },
      { id: "camel", primary: "#b08a5a", secondary: "#1e293b", accent: "#f2efe6", inner: "#ffffff", shoes: "#2a1d15" },
    ],
  },
  {
    id: "suit",
    colourways: [
      { id: "charcoal", primary: "#2b2f38", secondary: "#2b2f38", accent: "#991b1b", inner: "#f8fafc", shoes: "#111113" },
      { id: "navy", primary: "#1a253c", secondary: "#1a253c", accent: "#d4a359", inner: "#e2e8f0", shoes: "#2a1d15" },
      { id: "lead_gold", primary: "#1e222d", secondary: "#1e222d", accent: "#f0c14a", inner: "#ffffff", shoes: "#0a0a0c" },
    ],
  },
  {
    id: "leather",
    colourways: [
      { id: "black", primary: "#18181c", secondary: "#1f2430", accent: "#94a3b8", inner: "#1e2026", shoes: "#0f1115" },
      { id: "cognac", primary: "#5c3622", secondary: "#18181b", accent: "#f59e0b", inner: "#fdf8f0", shoes: "#3b2418" },
    ],
  },
  {
    id: "hoodie",
    colourways: [
      { id: "lagos_orange", primary: "#e8843a", secondary: "#18181b", accent: "#f8fafc", inner: "#e8843a", shoes: "#ffffff" },
      { id: "slate", primary: "#334155", secondary: "#0f172a", accent: "#38bdf8", inner: "#334155", shoes: "#f1f5f9" },
      { id: "forest", primary: "#166534", secondary: "#1e293b", accent: "#fbbf24", inner: "#166534", shoes: "#f8fafc" },
    ],
  },
  {
    id: "quarterzip",
    colourways: [
      { id: "cyan_slate", primary: "#0e7490", secondary: "#1e293b", accent: "#22d3ee", inner: "#f0fdfa", shoes: "#f8fafc" },
      { id: "sand", primary: "#d4a373", secondary: "#292524", accent: "#fef3c7", inner: "#ffffff", shoes: "#44403c" },
    ],
  },
  {
    id: "vest",
    colourways: [
      { id: "navy_vest", primary: "#1e3a8a", secondary: "#334155", accent: "#f97316", inner: "#f1f5f9", shoes: "#1e293b" },
      { id: "charcoal_vest", primary: "#27272a", secondary: "#18181b", accent: "#22c55e", inner: "#ffffff", shoes: "#09090b" },
    ],
  },
  {
    id: "turtleneck",
    colourways: [
      { id: "purple_synth", primary: "#6b21a8", secondary: "#1e1b4b", accent: "#c084fc", inner: "#6b21a8", shoes: "#0f172a" },
      { id: "midnight", primary: "#090d16", secondary: "#1e293b", accent: "#38bdf8", inner: "#090d16", shoes: "#0f172a" },
    ],
  },
  {
    id: "tee",
    colourways: [
      { id: "emerald", primary: "#10b981", secondary: "#0f172a", accent: "#f59e0b", inner: "#10b981", shoes: "#f8fafc" },
      { id: "white_classic", primary: "#f8fafc", secondary: "#1e293b", accent: "#e11d48", inner: "#f8fafc", shoes: "#ffffff" },
      { id: "amber_gold", primary: "#f59e0b", secondary: "#1c1917", accent: "#fbbf24", inner: "#f59e0b", shoes: "#f8fafc" },
    ],
  },
];

/** Stable 32-bit FNV-1a string hash */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(list: readonly T[], hash: number, salt: number): T {
  return list[(Math.imul(hash ^ salt, 0x9e3779b1) >>> 0) % list.length];
}

// ---------------------------------------------------------------------------
// Council & Preset Looks
// ---------------------------------------------------------------------------

export const COUNCIL_FIGURE_LOOKS: Record<string, Partial<ToyLook>> = {
  pane: {
    skin: "#8a5a3c",
    hair: "#1a1412",
    hairStyle: "sidepart",
    shirt: "#1e222d",
    shirtAccent: "#f0c14a",
    inner: "#ffffff",
    pants: "#1e222d",
    shoes: "#111113",
    outfit: "suit",
    eyewear: "none",
    blush: true,
  },
  warden: {
    skin: "#a8704c",
    hair: "#2a1d15",
    hairStyle: "buzz",
    shirt: "#5c3622",
    shirtAccent: "#f59e0b",
    inner: "#efe8dc",
    pants: "#18181b",
    shoes: "#3b2418",
    outfit: "leather",
    eyewear: "none",
    blush: false,
  },
  street: {
    skin: "#c68a62",
    hair: "#1d1d24",
    hairStyle: "spiky",
    shirt: "#0e7490",
    shirtAccent: "#22d3ee",
    inner: "#f0fdfa",
    pants: "#1e293b",
    shoes: "#f8fafc",
    outfit: "quarterzip",
    eyewear: "none",
    blush: true,
  },
  body: {
    skin: "#d8a37c",
    hair: "#3b2a20",
    hairStyle: "curly",
    shirt: "#e8843a",
    shirtAccent: "#ffffff",
    inner: "#e8843a",
    pants: "#18181b",
    shoes: "#f8fafc",
    outfit: "hoodie",
    eyewear: "none",
    blush: true,
  },
  ledger: {
    skin: "#8a5a3c",
    hair: "#1d1d24",
    hairStyle: "slick",
    shirt: "#2b2f38",
    shirtAccent: "#10b981",
    inner: "#f8fafc",
    pants: "#2b2f38",
    shoes: "#111113",
    outfit: "suit",
    eyewear: "glasses",
    blush: false,
  },
  signal: {
    skin: "#e9b48e",
    hair: "#6b4226",
    hairStyle: "ponytail",
    shirt: "#6b21a8",
    shirtAccent: "#c084fc",
    inner: "#6b21a8",
    pants: "#1e1b4b",
    shoes: "#f8fafc",
    outfit: "turtleneck",
    eyewear: "shades",
    blush: true,
  },
  gate: {
    skin: "#6b4430",
    hair: "#1a1412",
    hairStyle: "beanie",
    shirt: "#1e3a8a",
    shirtAccent: "#f97316",
    inner: "#f1f5f9",
    pants: "#334155",
    shoes: "#1e293b",
    outfit: "vest",
    eyewear: "none",
    blush: false,
  },
  navigator: {
    skin: "#c68a62",
    hair: "#2a1d15",
    hairStyle: "cap",
    shirt: "#10b981",
    shirtAccent: "#fbbf24",
    inner: "#10b981",
    pants: "#0f172a",
    shoes: "#f8fafc",
    outfit: "tee",
    eyewear: "none",
    blush: true,
  },
  ada: {
    skin: "#e9b48e",
    hair: "#2a1d15",
    hairStyle: "bun",
    shirt: "#0d9488",
    shirtAccent: "#34d399",
    inner: "#f0fdf4",
    pants: "#134e4a",
    shoes: "#ffffff",
    outfit: "hoodie",
    eyewear: "none",
    blush: true,
  },
  player: {
    skin: "#d8a37c",
    hair: "#2a1d15",
    hairStyle: "short",
    shirt: "#e8843a",
    shirtAccent: "#f0c14a",
    inner: "#f8fafc",
    pants: "#18181b",
    shoes: "#f8fafc",
    outfit: "blazer",
    eyewear: "none",
    blush: true,
  },
};

/**
 * Returns a fully computed, consistent ToyLook for any character ID.
 */
export function getFigureLook(id: string, overrides?: Partial<ToyLook>): ToyLook {
  const normalized = id.toLowerCase().replace(/^desk-/, "");
  const preset = COUNCIL_FIGURE_LOOKS[normalized];
  const h = hashString(id || "citizen");

  const outfitId = overrides?.outfit ?? preset?.outfit ?? pick(OUTFIT_IDS, h, 0x17);
  const outfitDef = OUTFITS.find((o) => o.id === outfitId) ?? OUTFITS[0];
  const colourway = pick(outfitDef.colourways, h, 0x42);

  const base: ToyLook = {
    skin: preset?.skin ?? pick(SKIN_TONES, h, 0x33),
    hair: preset?.hair ?? pick(HAIR_COLOURS, h, 0x5a),
    hairStyle: preset?.hairStyle ?? pick(HAIR_STYLES, h, 0x7c),
    shirt: preset?.shirt ?? colourway.primary,
    shirtAccent: preset?.shirtAccent ?? colourway.accent,
    inner: preset?.inner ?? colourway.inner,
    pants: preset?.pants ?? colourway.secondary,
    shoes: preset?.shoes ?? colourway.shoes,
    blush: preset?.blush ?? (h % 3 !== 0),
    outfit: outfitId,
    eyewear: preset?.eyewear ?? (h % 5 === 0 ? "glasses" : h % 9 === 0 ? "shades" : "none"),
  };

  return { ...base, ...overrides };
}

/** Legacy color helper preserved for backwards compatibility */
export function getFigureColors(id: string): ToyFigureColors {
  const look = getFigureLook(id);
  return {
    shirt: look.shirt,
    pants: look.pants,
    hair: look.hair,
    skin: look.skin,
    shoes: look.shoes,
  };
}

// ---------------------------------------------------------------------------
// Rig Dimensions (Metres at TOY_HEIGHT = 1.3m)
// ---------------------------------------------------------------------------

export const TOY_HEIGHT = 1.3;

export const TOY = {
  pelvis: { w: 0.3, h: 0.14, d: 0.2 },
  hipUp: 0.06,
  hipX: 0.085,
  thigh: 0.18,
  shin: 0.14,
  sole: 0.06,
  heel: 0.06,
  toe: 0.12,
  legRadius: 0.062,
  torso: { w: 0.34, h: 0.28, d: 0.22 },
  neckY: 0.3,
  shoulderX: 0.2,
  shoulderY: 0.225,
  upperArm: 0.14,
  foreArm: 0.13,
  armRadius: 0.054,
  handRadius: 0.056,
  head: { rx: 0.31, ry: 0.29, rz: 0.25, y: 0.3 },
  hairBack: 0.035,
} as const;

export const TOY_LEG = TOY.thigh + TOY.shin + TOY.sole;

export const SEAT_HEIGHT = {
  chair: 0.52,
  couch: 0.56,
  beanbag: 0.42,
  meeting: 0.5,
} as const;

export const KEYBOARD = { y: 0.78, z: 0.38 } as const;

// ---------------------------------------------------------------------------
// Kinematics & Pose Animation
// ---------------------------------------------------------------------------

export type FigureMode =
  | "idle"
  | "walk"
  | "sit"
  | "work"
  | "sleep"
  | "wave"
  | "talk"
  | "celebrate";

export type ToyMode = FigureMode;
export type Vec3 = [number, number, number];

export interface ToyPose {
  hipY: number;
  hipZ: number;
  bob: number;
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  leftShoulder: Vec3;
  rightShoulder: Vec3;
  leftElbow: number;
  rightElbow: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftAnkle: number;
  rightAnkle: number;
}

export function createPose(): ToyPose {
  return {
    hipY: TOY_LEG - TOY.hipUp,
    hipZ: 0,
    bob: 0,
    torsoPitch: 0,
    torsoYaw: 0,
    torsoRoll: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    leftShoulder: [0, 0, 0.1],
    rightShoulder: [0, 0, -0.1],
    leftElbow: 0,
    rightElbow: 0,
    leftHip: 0,
    rightHip: 0,
    leftKnee: 0,
    rightKnee: 0,
    leftAnkle: 0,
    rightAnkle: 0,
  };
}

const SCALAR_KEYS = [
  "hipY",
  "hipZ",
  "bob",
  "torsoPitch",
  "torsoYaw",
  "torsoRoll",
  "headPitch",
  "headYaw",
  "headRoll",
  "leftElbow",
  "rightElbow",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
] as const;

export function copyPose(src: ToyPose, out: ToyPose): ToyPose {
  for (const key of SCALAR_KEYS) out[key] = src[key];
  for (let i = 0; i < 3; i += 1) {
    out.leftShoulder[i] = src.leftShoulder[i];
    out.rightShoulder[i] = src.rightShoulder[i];
  }
  return out;
}

export function blendPose(
  a: ToyPose,
  b: ToyPose,
  k: number,
  out: ToyPose = createPose()
): ToyPose {
  const clampedK = Math.max(0, Math.min(1, k));
  const j = 1 - clampedK;
  for (const key of SCALAR_KEYS) out[key] = a[key] * j + b[key] * clampedK;
  for (let i = 0; i < 3; i += 1) {
    out.leftShoulder[i] = a.leftShoulder[i] * j + b.leftShoulder[i] * clampedK;
    out.rightShoulder[i] = a.rightShoulder[i] * j + b.rightShoulder[i] * clampedK;
  }
  return out;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (e0: number, e1: number, v: number) => {
  const x = clamp((v - e0) / (e1 - e0), 0, 1);
  return x * x * (3 - 2 * x);
};

export function walkCadence(speed: number): number {
  const s = Math.max(0, speed);
  const stride = 0.45 + 0.1 * Math.min(s, 5);
  return clamp(s / stride, 1.2, 4.6);
}

function soleDrop(hip: number, knee: number, ankle: number): number {
  const a1 = hip;
  const a2 = hip + knee;
  const a3 = a2 + ankle;
  const kneeY = -TOY.thigh * Math.cos(a1);
  const ankleY = kneeY - TOY.shin * Math.cos(a2);
  const c = Math.cos(a3);
  const s = Math.sin(a3);
  const heelY = ankleY - TOY.sole * c + TOY.heel * s;
  const toeY = ankleY - TOY.sole * c - TOY.toe * s;
  return Math.min(heelY, toeY);
}

function ground(p: ToyPose): void {
  const drop = Math.min(
    soleDrop(p.leftHip, p.leftKnee, p.leftAnkle),
    soleDrop(p.rightHip, p.rightKnee, p.rightAnkle)
  );
  p.hipY = -drop - TOY.hipUp;
}

function standBase(p: ToyPose): void {
  p.hipZ = 0;
  p.bob = 0;
  p.torsoPitch = 0;
  p.torsoYaw = 0;
  p.torsoRoll = 0;
  p.headPitch = 0;
  p.headYaw = 0;
  p.headRoll = 0;
  p.leftShoulder[0] = 0.05;
  p.leftShoulder[1] = 0;
  p.leftShoulder[2] = 0.1;
  p.rightShoulder[0] = 0.05;
  p.rightShoulder[1] = 0;
  p.rightShoulder[2] = -0.1;
  p.leftElbow = -0.15;
  p.rightElbow = -0.15;
  p.leftHip = 0;
  p.rightHip = 0;
  p.leftKnee = 0;
  p.rightKnee = 0;
  p.leftAnkle = 0;
  p.rightAnkle = 0;
}

function seatBase(p: ToyPose, seatHeight: number): void {
  standBase(p);
  p.hipY = seatHeight;
  p.hipZ = 0.05;
  p.torsoPitch = 0.14;
  p.leftHip = -Math.PI / 2 + 0.04;
  p.rightHip = -Math.PI / 2 + 0.04;
  p.leftKnee = Math.PI / 2 - 0.04;
  p.rightKnee = Math.PI / 2 - 0.04;
  p.leftShoulder[0] = -0.55;
  p.leftShoulder[2] = 0.12;
  p.rightShoulder[0] = -0.55;
  p.rightShoulder[2] = -0.12;
  p.leftElbow = -0.75;
  p.rightElbow = -0.75;
}

const REACH = { shoulder: 0, elbow: 0 };
function reach(dy: number, dz: number): typeof REACH {
  const l1 = TOY.upperArm;
  const l2 = TOY.foreArm;
  const d = clamp(Math.hypot(dy, dz), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
  const toward = Math.atan2(-dz, -dy);
  const atShoulder = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const atElbow = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  REACH.shoulder = toward + atShoulder;
  REACH.elbow = -(Math.PI - atElbow);
  return REACH;
}

const TYPE_ROLL = 0.1;
const TYPE_ROLL_COS = Math.cos(TYPE_ROLL);

function typeAt(p: ToyPose, t: number): void {
  const cos = Math.cos(p.torsoPitch);
  const sin = Math.sin(p.torsoPitch);
  const shoulderY = p.hipY + TOY.hipUp + p.bob + TOY.shoulderY * cos;
  const shoulderZ = p.hipZ + TOY.shoulderY * sin;
  for (let side = 0; side < 2; side += 1) {
    const tap = 0.012 * Math.max(0, Math.sin(t * TAU * 3.1 + side * 2.1));
    const wy = KEYBOARD.y + 0.045 + tap - shoulderY;
    const wz = KEYBOARD.z - shoulderZ + 0.004 * Math.sin(t * TAU * 1.3 + side);
    const r = reach((wy * cos + wz * sin) / TYPE_ROLL_COS, -wy * sin + wz * cos);
    if (side === 0) {
      p.leftShoulder[0] = r.shoulder;
      p.leftShoulder[2] = -TYPE_ROLL;
      p.leftElbow = r.elbow;
    } else {
      p.rightShoulder[0] = r.shoulder;
      p.rightShoulder[2] = TYPE_ROLL;
      p.rightElbow = r.elbow;
    }
  }
}

export interface PoseOptions {
  seatHeight: number;
  phase?: number;
}

/**
 * Calculates joint rotations and offsets for any figure mode at time `t`.
 */
export function poseFor(
  mode: ToyMode,
  t: number,
  speed: number,
  opts: PoseOptions,
  out: ToyPose = createPose()
): ToyPose {
  const p = out;
  const breathe = Math.sin(t * TAU * 0.28);

  switch (mode) {
    case "walk": {
      standBase(p);
      const s = Math.max(0, speed);
      const phase = (opts.phase ?? t * walkCadence(s)) * TAU;
      const move = smooth(0, 0.35, s);
      const run = smooth(2.6, 3.6, s);
      const swing = move * (0.32 + 0.1 * Math.min(s, 3) + 0.2 * run);
      const sL = Math.sin(phase);
      const sR = -sL;

      p.leftHip = -swing * sL;
      p.rightHip = -swing * sR;

      const liftL = Math.max(0, Math.cos(phase));
      const liftR = Math.max(0, -Math.cos(phase));
      const kneeAmp = move * (0.55 + 0.5 * run);
      p.leftKnee = 0.08 * move + kneeAmp * liftL;
      p.rightKnee = 0.08 * move + kneeAmp * liftR;

      p.leftAnkle = -(p.leftHip + p.leftKnee) * 0.75;
      p.rightAnkle = -(p.rightHip + p.rightKnee) * 0.75;

      const armSwing = move * (0.35 + 0.35 * run);
      p.leftShoulder[0] = armSwing * sL;
      p.rightShoulder[0] = armSwing * sR;
      p.leftElbow = -0.25 - 1.0 * run;
      p.rightElbow = -0.25 - 1.0 * run;
      p.torsoPitch = move * (0.05 + 0.02 * Math.min(s, 3)) + 0.16 * run;
      p.torsoYaw = 0.08 * move * sL;
      p.headPitch = -0.6 * p.torsoPitch * run;
      p.bob = move * (0.012 + 0.012 * run) * Math.abs(Math.cos(phase));
      ground(p);
      return p;
    }

    case "sit": {
      seatBase(p, opts.seatHeight);
      p.bob = 0.004 * breathe;
      p.headYaw = 0.18 * Math.sin(t * 0.37);
      p.headPitch = 0.04 + 0.03 * Math.sin(t * 0.23);
      return p;
    }

    case "work": {
      seatBase(p, opts.seatHeight);
      p.hipZ = 0.08;
      p.torsoPitch = 0.3;
      p.bob = 0.003 * breathe;
      p.headPitch = -0.14 + 0.02 * Math.sin(t * 0.5);
      p.headYaw = 0.05 * Math.sin(t * 0.31);
      typeAt(p, t);
      return p;
    }

    case "sleep": {
      seatBase(p, opts.seatHeight);
      p.torsoPitch = 0.26 + 0.012 * Math.sin(t * TAU * 0.2);
      p.torsoRoll = 0.08;
      p.headPitch = 0.42 + 0.03 * Math.sin(t * TAU * 0.2);
      p.headRoll = 0.3;
      p.leftShoulder[0] = -0.3;
      p.rightShoulder[0] = -0.3;
      p.leftElbow = -0.6;
      p.rightElbow = -0.6;
      p.leftHip += 0.05;
      p.rightHip += 0.08;
      p.leftShoulder[2] = 0.14;
      p.rightShoulder[2] = -0.14;
      return p;
    }

    case "wave": {
      standBase(p);
      p.bob = 0.004 * breathe;
      p.rightShoulder[0] = -0.25;
      p.rightShoulder[2] = -2.45 + 0.28 * Math.sin(t * TAU * 2.2);
      p.rightElbow = -0.35;
      p.torsoRoll = 0.04;
      p.headRoll = -0.08;
      p.headPitch = -0.05;
      ground(p);
      return p;
    }

    case "talk": {
      standBase(p);
      p.bob = 0.004 * breathe;
      p.headPitch = 0.07 * Math.sin(t * TAU * 1.6) - 0.02;
      p.headYaw = 0.12 * Math.sin(t * 0.8);
      p.torsoYaw = 0.05 * Math.sin(t * 0.6);
      p.rightShoulder[0] = -0.45 + 0.15 * Math.sin(t * TAU * 0.9);
      p.rightElbow = -1.1 + 0.3 * Math.sin(t * TAU * 1.3);
      p.leftShoulder[0] = -0.2 + 0.1 * Math.sin(t * TAU * 0.7 + 1.2);
      p.leftElbow = -0.7 + 0.2 * Math.sin(t * TAU * 1.1 + 0.5);
      ground(p);
      return p;
    }

    case "celebrate": {
      standBase(p);
      const hop = Math.sin(t * TAU * 1.6);
      const air = Math.max(0, hop);
      const crouch = Math.max(0, -hop);
      p.leftHip = -0.35 * crouch;
      p.rightHip = -0.35 * crouch;
      p.leftKnee = 0.7 * crouch;
      p.rightKnee = 0.7 * crouch;
      p.leftAnkle = -0.35 * crouch;
      p.rightAnkle = -0.35 * crouch;
      p.leftShoulder[0] = -0.2;
      p.rightShoulder[0] = -0.2;
      p.leftShoulder[2] = 2.6 + 0.2 * Math.sin(t * TAU * 3.2);
      p.rightShoulder[2] = -2.6 - 0.2 * Math.sin(t * TAU * 3.2 + 1);
      p.leftElbow = -0.2;
      p.rightElbow = -0.2;
      p.headPitch = -0.15;
      ground(p);
      p.hipY += 0.11 * air;
      return p;
    }

    case "idle":
    default: {
      standBase(p);
      p.bob = 0.005 * breathe;
      p.torsoRoll = 0.025 * Math.sin(t * TAU * 0.18);
      p.headRoll = -0.5 * p.torsoRoll;
      p.headYaw = 0.25 * Math.sin(t * 0.29) * Math.sin(t * 0.11);
      p.leftShoulder[0] = 0.04 * breathe;
      p.rightShoulder[0] = 0.04 * breathe;
      p.leftHip = -0.02;
      p.rightHip = 0.02;
      ground(p);
      return p;
    }
  }
}

/**
 * Maps an agent status and seated flag to the corresponding FigureMode.
 */
export function stateToFigureMode(state?: AgentState, isSeated = false): FigureMode {
  if (state === "working") return isSeated ? "work" : "work";
  if (state === "waiting") return "wave";
  if (state === "paused") return "sleep";
  if (isSeated) return "sit";
  return "idle";
}
