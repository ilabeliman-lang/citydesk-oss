// NDU-UPG inspect (#04): which verbs an object offers, scored by need and distance. Pure.
// Disabled offers carry a human reason; the peek shows the top 2 enabled ones.
import { MATERIALS } from "../render/materialCatalog.ts";
import type { PropNeed } from "../props/propsCatalogue.ts";
import type { ObjectProfile, Verb, VerbOffer } from "./types.ts";

export type AffordCtx = {
  distanceM: number;
  needs?: Partial<Record<PropNeed, number>>;
  isOwner: boolean;
  propertyReady: boolean;
  consented: boolean;
  kids: boolean;
  vehicleStopped: boolean;
  itemCount: number;
};

type Advert = { verb: Verb; label: string; base: number; need?: PropNeed; reachM: number; when: (p: ObjectProfile, c: AffordCtx) => true | string };

export const CARRY_MAX_KG = 25;
export const CARRY_MAX_M = 1.5;

const always = () => true as const;
const sitCats = new Set(["chair", "sofa", "bed", "bench"]);
const openCats = new Set(["storage", "refrigerator", "oven", "washer_dryer", "dishwasher"]);
const carryCats = new Set(["chair", "lamp", "appliance", "electronics", "television", "other", "scan"]);

const carry = (p: ObjectProfile): true | string => {
  const kg = p.massKg?.value ?? null;
  const dims = p.dimsM?.value ?? null;
  if (kg !== null && kg > CARRY_MAX_KG) return `Too heavy to carry (≈ ${Math.round(kg)} kg)`;
  if (dims && Math.max(...dims) > CARRY_MAX_M) return `Too big to carry (${Math.max(...dims).toFixed(1)} m)`;
  if (kg === null) return "Weight unknown";
  return true;
};

export const CLASS_ADVERTS: Record<string, Advert[]> = {
  building: [
    { verb: "enter", label: "Enter", base: 60, reachM: 40, when: (p) => (p.access === "private" || p.access === "no" ? "Private: no entry" : true) },
    { verb: "view_on_osm", label: "Open on OpenStreetMap", base: 10, reachM: Infinity, when: (p) => (p.osmUrl ? true : "Not on OpenStreetMap") },
    { verb: "look_through", label: "Look through", base: 5, reachM: 30, when: (p) => (p.material && MATERIALS[p.material]?.traits.transparent ? true : "Not see-through") },
  ],
  "prop:bench": [{ verb: "sit", label: "Sit", base: 50, need: "rest", reachM: 2.5, when: always }],
  "prop:standpipe": [{ verb: "use", label: "Wash", base: 50, need: "wash", reachM: 2, when: always }],
  "prop:food_stall": [{ verb: "use", label: "Buy food", base: 45, need: "eat", reachM: 3, when: (_p, c) => (c.kids ? "Ask a grown-up" : true) }],
  "prop:bus_stop": [{ verb: "wait", label: "Wait for a bus", base: 40, need: "transit", reachM: 5, when: always }],
  vehicle: [{ verb: "ride", label: "Ride", base: 55, need: "transit", reachM: 6, when: (p, c) => (!/^vehicle:(keke|danfo|bus)$/.test(p.className) ? "Not a hailable vehicle" : c.vehicleStopped ? true : "Wait until it stops") }],
  walker: [{ verb: "talk", label: "Wave", base: 30, reachM: 4, when: always }],
  place: [{ verb: "enter", label: "Go in", base: 50, reachM: 40, when: always }],
  scan: [
    { verb: "link_record", label: "Link to a record", base: 70, reachM: Infinity, when: (_p, c) => (!c.isOwner ? "Only the owner can link" : !c.propertyReady ? "Property records are off right now" : !c.consented ? "Agree to the record terms first" : true) },
    { verb: "pick_up", label: "Pick up", base: 40, reachM: 1.5, when: carry },
  ],
  item: [
    { verb: "sit", label: "Sit", base: 45, need: "rest", reachM: 1.5, when: (p) => (sitCats.has(p.category ?? "") ? true : "Not a seat") },
    { verb: "open", label: "Open", base: 35, reachM: 1.5, when: (p) => (openCats.has(p.category ?? "") ? true : "Nothing to open") },
    { verb: "pick_up", label: "Pick up", base: 40, reachM: 1.5, when: carry },
  ],
};

/** Class key for a profile: "building", "prop:bench", "vehicle", "walker", "place", "scan", "item". */
export function advertClass(p: ObjectProfile): string {
  if (p.className.startsWith("vehicle:")) return "vehicle";
  if (p.className.startsWith("prop:")) return p.className;
  if (p.className === "place") {
    const c = `prop:${p.category}`;
    return CLASS_ADVERTS[c] ? c : "place";
  }
  return p.className;
}

const needWeight = (need: PropNeed | undefined, needs: AffordCtx["needs"]) => (need && needs ? Math.max(0, Math.min(1, needs[need] ?? 0)) : 0);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function offersFor(p: ObjectProfile, ctx: AffordCtx): VerbOffer[] {
  const cls = advertClass(p);
  let adverts = [...(CLASS_ADVERTS[cls] ?? [])];
  if (p.className === "item" || (cls === "scan" && p.category && p.category !== "scan")) adverts = adverts.concat(CLASS_ADVERTS.item.filter((a) => !adverts.some((b) => b.verb === a.verb)));
  if (p.osmUrl && !adverts.some((a) => a.verb === "view_on_osm")) adverts.push({ verb: "view_on_osm", label: "Open on OpenStreetMap", base: 10, reachM: Infinity, when: always });
  // kids + flammable stalls/stoves: no "use"
  if (ctx.kids && p.material && MATERIALS[p.material]?.traits.flammable) adverts = adverts.filter((a) => a.verb !== "use");
  if (ctx.kids) adverts = adverts.filter((a) => !(a.verb === "use" && (p.category === "food_stall" || p.category === "stove")));
  const out: VerbOffer[] = adverts.map((a) => {
    const ok = a.when(p, ctx);
    const dist = Number.isFinite(a.reachM) ? clamp(1 - ctx.distanceM / a.reachM, 0.1, 1) : 1;
    const score = Math.round(a.base * (1 + needWeight(a.need, ctx.needs)) * dist * 100) / 100;
    return ok === true ? { verb: a.verb, label: a.label, score, enabled: true } : { verb: a.verb, label: a.label, score, enabled: false, reason: ok };
  });
  return out.sort((x, y) => Number(y.enabled) - Number(x.enabled) || y.score - x.score || x.verb.localeCompare(y.verb));
}
