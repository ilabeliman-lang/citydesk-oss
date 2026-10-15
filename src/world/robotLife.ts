export type Yard = { power: number; clean: number; green: number };

export type Bot = {
  id: string;
  name: string;
  job: "sweep" | "charge" | "tend" | "guide" | "repair" | "drive";
  energy: number;
  phase: "work" | "charge";
  purse: number;
  kit: number;
  known: number;
  meals: number;
  note: string;
  face: string;
  beat: number;
  vehicle?: "keke" | "bus";
  nextStop?: { lat: number; lng: number };
};

const bots: Bot[] = [
  { id: "ada", name: "Ada", job: "sweep", energy: 82, phase: "work", purse: 4, kit: 1, known: 1, meals: 0, note: "On the first broom.", face: "/people/woman-blue.png", beat: 0 },
  { id: "eko", name: "Eko", job: "charge", energy: 74, phase: "work", purse: 3, kit: 1, known: 1, meals: 0, note: "Watching the power.", face: "/people/man-grey.png", beat: 1 },
  { id: "gba", name: "Gba", job: "tend", energy: 68, phase: "work", purse: 3, kit: 1, known: 1, meals: 0, note: "Tending the green.", face: "/people/woman-yellow.png", beat: 2 },
  { id: "nuru", name: "Nuru", job: "repair", energy: 88, phase: "work", purse: 5, kit: 1, known: 2, meals: 0, note: "Tools are packed.", face: "/people/man-shirt.png", beat: 3 },
  { id: "sade", name: "Sade", job: "guide", energy: 76, phase: "work", purse: 2, kit: 1, known: 1, meals: 0, note: "Learning the streets.", face: "/people/woman-blue.png", beat: 4 },
  { id: "kemi", name: "Kemi", job: "drive", energy: 80, phase: "work", purse: 4, kit: 1, known: 1, meals: 0, note: "Driving the keke on the road.", face: "/people/woman-yellow.png", beat: 5, vehicle: "keke" },
  { id: "ibra", name: "Ibra", job: "drive", energy: 84, phase: "work", purse: 6, kit: 1, known: 1, meals: 0, note: "Driving the bus on the road.", face: "/people/man-grey.png", beat: 6, vehicle: "bus" },
];

const yard: Yard = { power: 64, clean: 60, green: 55 };
const PARTNERS = "ndu-partners";
const CREW_KEY = "ndu-crew";
const purseLines: string[] = [];
let partners: string[] = [];
let wait = 0;

function clampMeter(n: unknown, fallback: number) {
  const value = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(100, Math.max(0, value));
}

function loadCrew() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = JSON.parse(localStorage.getItem(CREW_KEY) || "") as {
      yard?: Partial<Yard>;
      bots?: { id?: string; energy?: number; phase?: string; purse?: number; kit?: number; known?: number; meals?: number; note?: string }[];
      purseLog?: unknown;
    };
    if (raw?.yard) {
      yard.power = clampMeter(raw.yard.power, yard.power);
      yard.clean = clampMeter(raw.yard.clean, yard.clean);
      yard.green = clampMeter(raw.yard.green, yard.green);
    }
    purseLines.length = 0;
    if (Array.isArray(raw.purseLog)) {
      for (const line of raw.purseLog) {
        if (typeof line === "string" && line) purseLines.push(line.slice(0, 160));
      }
      if (purseLines.length > 10) purseLines.splice(0, purseLines.length - 10);
    }
    if (!Array.isArray(raw?.bots)) return;
    for (const row of raw.bots) {
      const bot = bots.find((item) => item.id === row.id);
      if (!bot) continue;
      bot.energy = clampMeter(row.energy, bot.energy);
      bot.phase = row.phase === "charge" ? "charge" : "work";
      bot.purse = Math.max(0, Math.round(typeof row.purse === "number" ? row.purse : bot.purse));
      bot.kit = Math.min(5, Math.max(1, Math.round(typeof row.kit === "number" ? row.kit : bot.kit)));
      bot.known = Math.min(12, Math.max(1, Math.round(typeof row.known === "number" ? row.known : bot.known)));
      bot.meals = Math.max(0, Math.round(typeof row.meals === "number" ? row.meals : bot.meals));
      if (typeof row.note === "string" && row.note) bot.note = row.note.slice(0, 140);
    }
  } catch {
    /* keep the starting crew */
  }
}

function saveCrew() {
  if (typeof localStorage === "undefined") return;
  const snapshot = {
    yard: { ...yard },
    bots: bots.map((bot) => ({
      id: bot.id,
      energy: bot.energy,
      phase: bot.phase,
      purse: bot.purse,
      kit: bot.kit,
      known: bot.known,
      meals: bot.meals,
      note: bot.note,
    })),
    purseLog: purseLines.slice(-10),
  };
  localStorage.setItem(CREW_KEY, JSON.stringify(snapshot));
}

loadCrew();
readPartners();

export function purseLog(): string[] {
  return purseLines.slice();
}

export function wipeCrewMemory(): void {
  partners = [];
  purseLines.length = 0;
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CREW_KEY);
  localStorage.removeItem(PARTNERS);
}

export function getBots() {
  return bots;
}

export function getBot(id: string) {
  return bots.find((bot) => bot.id === id) ?? null;
}

export function getYard() {
  return yard;
}

export function crewNow() {
  return bots.map((bot) => ({ id: bot.id, name: bot.name, job: bot.job, phase: bot.phase, note: bot.note }));
}

export function isPartner(id: string) {
  return readPartners().includes(id);
}

export function togglePartner(id: string) {
  const current = readPartners();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 5);
  partners = next;
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PARTNERS, JSON.stringify(next));
}

function readPartners(): string[] {
  if (typeof localStorage === "undefined") {
    partners = [];
    return partners;
  }
  try {
    const raw = JSON.parse(localStorage.getItem(PARTNERS) || "[]") as unknown;
    partners = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  } catch {
    partners = [];
  }
  return partners;
}

function pushPurse(line: string) {
  purseLines.push(line);
  if (purseLines.length > 10) purseLines.splice(0, purseLines.length - 10);
}

function workGain(bot: Bot) {
  return 1 + bot.kit * 0.35 + bot.known * 0.05;
}

function driveNote(bot: Bot) {
  if (yard.power < 10) return "Route paused. Yard power is under ten.";
  if (bot.vehicle === "keke") {
    const dwell = Math.max(4, 12 - bot.kit * 2);
    return `Driving the keke. Stop dwell ${dwell}s. Ride costs 5 vouchers.`;
  }
  if (bot.vehicle === "bus") {
    const held = Math.min(8, 2 + bot.kit);
    return `Driving the bus. ${held} stops in memory. Ride costs 5 vouchers.`;
  }
  return "On the job.";
}

export function robotTick(dt: number) {
  wait += dt;
  if (wait < 1) return;
  wait = 0;
  yard.clean = Math.max(0, yard.clean - 0.45);
  yard.power = Math.max(0, yard.power - 0.3);
  yard.green = Math.max(0, yard.green - 0.35);
  for (const bot of bots) {
    bot.beat += 1;
    if (bot.phase === "charge") {
      bot.energy = Math.min(100, bot.energy + 9);
      bot.note = "Charging, then back to the job.";
      if (bot.energy >= 85) bot.phase = "work";
      continue;
    }
    bot.energy = Math.max(0, bot.energy - 4);
    if (bot.energy < 18) {
      if (bot.purse >= 3) {
        bot.purse -= 3;
        bot.note = "Paid for a repair, then went to charge.";
        pushPurse(`${bot.name} paid 3 vouchers to repair`);
      }
      bot.phase = "charge";
      continue;
    }
    if (bot.vehicle && yard.power < 10) {
      bot.nextStop = undefined;
      bot.note = "Route paused. Yard power is under ten.";
      continue;
    }
    bot.purse += 1;
    const gain = workGain(bot);
    if (bot.job === "sweep") yard.clean = Math.min(100, yard.clean + 1.1 * gain);
    if (bot.job === "charge") yard.power = Math.min(100, yard.power + 1 * gain);
    if (bot.job === "tend") yard.green = Math.min(100, yard.green + 1 * gain);
    if (bot.job === "repair") {
      yard.power = Math.min(100, yard.power + 0.4 * gain);
      yard.clean = Math.min(100, yard.clean + 0.3 * gain);
    }
    if (bot.job === "guide") yard.clean = Math.min(100, yard.clean + 0.2 * gain);
    if (bot.job === "drive") yard.power = Math.min(100, yard.power + 0.2 * gain);
    if (bot.purse >= 12 && bot.kit < 5) {
      bot.purse -= 12;
      bot.kit += 1;
      bot.note = `Bought better ${bot.job} tools. Kit ${bot.kit}.`;
      pushPurse(`${bot.name} paid 12 vouchers for a kit`);
    } else if (bot.beat % 7 === 0 && bot.purse >= 2 && bot.known < 12) {
      bot.purse -= 2;
      bot.known += 1;
      bot.note = "Read the knowledge pool, then went back to work.";
      pushPurse(`${bot.name} paid 2 vouchers for knowledge`);
    } else if (bot.beat % 5 === 0 && bot.purse >= 1) {
      bot.purse -= 1;
      bot.meals += 1;
      bot.note = "Set one meal aside from the pay.";
      pushPurse(`${bot.name} set a meal aside`);
    } else {
      bot.note = driveNote(bot);
    }
  }
  saveCrew();
}

export function helpYard() {
  yard.clean = Math.min(100, yard.clean + 10);
  yard.green = Math.min(100, yard.green + 8);
  yard.power = Math.min(100, yard.power + 6);
  saveCrew();
}

export function takeMeal(id: string) {
  const bot = getBot(id);
  if (!bot || !isPartner(id) || bot.meals < 1) return false;
  bot.meals -= 1;
  bot.note = "Shared a meal with a partner.";
  saveCrew();
  return true;
}

export function botLine(bot: Bot) {
  return `${bot.name} · kit ${bot.kit} · ${bot.purse} vouchers · ${bot.note}`;
}
