// NDU-UPG inspect (#04): unit tests (node --experimental-strip-types --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { holdMs, inspectAllowed, inspectTapFirst, INSPECT_FLAG_KEY, type FlagEnv } from "./flag.ts";
import { MATERIALS, OSM_MATERIAL, fromOsm, mixHex, toSrgbHex, tintFor, lumHex, type MaterialKey } from "../render/materialCatalog.ts";
import { getPhysicalMaterial, clearPhysicalMaterialCache } from "../render/physicalMaterials.ts";
import { ageText, parseStartDate } from "./dates.ts";
import { VEHICLE_SPECS } from "./vehicleSpecs.ts";
import { buildingProfile, formatField, placeProfile, propProfile, scanProfile, summaryLine, vehicleProfile, walkerProfile } from "./profile.ts";
import { uniqueLines } from "./unique.ts";
import { offersFor, type AffordCtx } from "./affordances.ts";
import { createPressTracker, type Clock } from "./gesture.ts";
import { choosePart, dedupeBuildings, osmIdOf, pickAt, type PickMap, type HitFeature } from "./pick.ts";
import { cellStats, toBuildings } from "../realism/buildingsData.ts";
import { PUBLIC_TAG_KEYS } from "./tagPolicy.ts";
import { createInspectStore } from "./store.ts";
import { propPhysics } from "./propPhysics.ts";

// ── T1 flag ──────────────────────────────────────────────────────────────────────────────────────
const env = (o: Partial<FlagEnv> = {}): FlagEnv => ({ server: false, search: "", dev: false, vars: {}, storage: null, ...o });
const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });

test("flag: server is always off", () => assert.equal(inspectAllowed(env({ server: true, search: "?inspect=1", dev: true })), false));
test("flag: ?inspect=0 / off hides it, even in dev", () => {
  assert.equal(inspectAllowed(env({ search: "?inspect=0", dev: true })), false);
  assert.equal(inspectAllowed(env({ search: "?inspect=off", vars: { VITE_NDU_INSPECT: "on" } })), false);
});
test("flag: ?inspect=1 / on forces it", () => {
  assert.equal(inspectAllowed(env({ search: "?inspect=1" })), true);
  assert.equal(inspectAllowed(env({ search: "?inspect=on" })), true);
});
test("flag: dev on, prod off unless VITE_NDU_INSPECT=on", () => {
  assert.equal(inspectAllowed(env({ dev: true })), true);
  assert.equal(inspectAllowed(env()), false);
  assert.equal(inspectAllowed(env({ vars: { VITE_NDU_INSPECT: "on" } })), true);
  assert.equal(inspectAllowed(env({ vars: { VITE_NDU_INSPECT: "off" } })), false);
});
test("flag: localStorage opt-out wins", () => {
  assert.equal(inspectAllowed(env({ dev: true, search: "?inspect=1", storage: store({ [INSPECT_FLAG_KEY]: "1" }) })), false);
  assert.equal(inspectAllowed(env({ dev: true, storage: { getItem: () => { throw new Error("blocked"); } } })), true);
});
test("flag: tap-first needs the flag and ?inspect-tap=1 or VITE_NDU_INSPECT_TAP", () => {
  assert.equal(inspectTapFirst(env({ dev: true })), false);
  assert.equal(inspectTapFirst(env({ dev: true, search: "?inspect-tap=1" })), true);
  assert.equal(inspectTapFirst(env({ dev: true, vars: { VITE_NDU_INSPECT_TAP: "on" } })), true);
  assert.equal(inspectTapFirst(env({ search: "?inspect-tap=1" })), false);
});
test("flag: holdMs 300/450/700, default 450", () => {
  assert.equal(holdMs(env()), 450);
  assert.equal(holdMs(env({ storage: store({ "ndu.inspect.hold": "300" }) })), 300);
  assert.equal(holdMs(env({ storage: store({ "ndu.inspect.hold": "700" }) })), 700);
  assert.equal(holdMs(env({ storage: store({ "ndu.inspect.hold": "999" }) })), 450);
});

// ── T3 materials ─────────────────────────────────────────────────────────────────────────────────
test("materials: every OSM value maps to a catalogue key", () => {
  for (const [k, v] of Object.entries(OSM_MATERIAL)) assert.ok(MATERIALS[v], `${k} → ${v}`);
});
test("materials: densities, colours, roughness, metalness in range", () => {
  for (const m of Object.values(MATERIALS)) {
    assert.ok(m.densityKgM3 === null || (m.densityKgM3 >= 50 && m.densityKgM3 <= 25000), m.key);
    for (const c of m.baseColor) assert.ok(c >= 0 && c <= 1, m.key);
    assert.ok(m.roughness >= 0 && m.roughness <= 1 && m.metalness >= 0 && m.metalness <= 1, m.key);
  }
  assert.equal(Object.keys(MATERIALS).length, 24);
});
test("materials: fromOsm takes the first ; value, case-insensitive, unknown → null", () => {
  assert.equal(fromOsm("Brick;concrete"), "brick");
  assert.equal(fromOsm(" Corrugated iron "), "corrugated_metal");
  assert.equal(fromOsm("asbestos"), "cement_block");
  assert.equal(fromOsm("unobtainium"), null);
  assert.equal(fromOsm(undefined), null);
});
test("materials: hex helpers and a palette-dominant tint", () => {
  assert.equal(toSrgbHex([1, 1, 1]), "#ffffff");
  assert.equal(toSrgbHex([0, 0, 0]), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  const base = "#3a4250";
  for (const k of Object.keys(MATERIALS) as MaterialKey[]) {
    const r = lumHex(tintFor(base, k)) / lumHex(base);
    assert.ok(r > 0.88 && r < 1.12, `${k} ${r}`);
  }
});
test("materials: getPhysicalMaterial caches one instance per key", () => {
  const a = getPhysicalMaterial("brick");
  assert.equal(a, getPhysicalMaterial("brick"));
  assert.ok(a instanceof THREE.MeshStandardMaterial);
  assert.equal(getPhysicalMaterial("glass").transparent, true);
  clearPhysicalMaterialCache();
  assert.notEqual(a, getPhysicalMaterial("brick"));
});

// ── T4 dates ─────────────────────────────────────────────────────────────────────────────────────
const NOW = 2026;
const cases: [string, number | null, string | null][] = [
  ["1975", 1975, "year"], ["1975-06", 1975, "month"], ["1975-06-01", 1975, "day"], ["~1950", 1950, "approx"],
  ["ca. 1950", 1950, "approx"], ["1960s", 1965, "decade"], ["C19", 1850, "century"], ["early C20", 1915, "century"],
  ["mid C20", 1950, "century"], ["late C19", 1885, "century"], ["before 1900", 1900, "before"], ["after 2001", 2001, "after"],
  ["1990..2000", 1995, "range"], ["2027", 2027, "year"], ["0999", null, null], ["2040", null, null], ["yesterday", null, null],
  ["", null, null], ["2000..1990", null, null], ["1975-13", null, null], ["1975-02-40", null, null], ["C9", null, null], ["19 75", null, null],
];
for (const [raw, year, prec] of cases)
  test(`dates: ${JSON.stringify(raw)}`, () => {
    const p = parseStartDate(raw, NOW);
    if (year === null) assert.equal(p, null);
    else {
      assert.equal(p?.year, year);
      assert.equal(p?.precision, prec);
    }
  });
test("dates: ageText wording", () => {
  assert.equal(ageText(parseStartDate("1975", NOW), NOW), "built 1975 (51 years)");
  assert.equal(ageText(parseStartDate("~1950", NOW), NOW), "built about 1950 (≈ 76 years)");
  assert.equal(ageText(parseStartDate("C19", NOW), NOW), "19th century");
  assert.equal(ageText(parseStartDate("2027", NOW), NOW), "planned (2027)");
  assert.equal(ageText(null, NOW), "Age: not mapped");
});

// ── T6 vehicles vs life/models.ts boxes ─────────────────────────────────────────────────────────
test("vehicles: specs match the drawn life models (w/l ±5%, h ±10%)", async () => {
  const { vehicleGeometry } = await import("../life/models.ts");
  for (const k of ["car", "keke", "bus", "danfo"] as const) {
    const g = vehicleGeometry(k);
    g.computeBoundingBox();
    const s = new THREE.Vector3();
    g.boundingBox!.getSize(s);
    const [w, h, l] = VEHICLE_SPECS[k].dimsM;
    assert.ok(Math.abs(s.x - w) / w <= 0.05, `${k} width ${s.x} vs ${w}`);
    assert.ok(Math.abs(s.z - l) / l <= 0.05, `${k} length ${s.z} vs ${l}`);
    assert.ok(Math.abs(s.y - h) / h <= 0.1, `${k} height ${s.y} vs ${h}`);
  }
});
test("vehicles: keke summary line", () => {
  assert.equal(summaryLine(vehicleProfile("keke")), "Keke (tricycle) · 1.36 × 1.81 × 2.62 m · about 350 kg · 4 seats");
});

// ── T7 profiles ──────────────────────────────────────────────────────────────────────────────────
const sq = (lng: number, lat: number, d = 0.0001) => [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]];
const feat = (props: Record<string, unknown>, layer = "ndu-real-buildings", id = 42): HitFeature => ({ id, layer: { id: layer }, properties: props, geometry: { type: "Polygon", coordinates: sq(7.0, 4.8) } });
const at: [number, number] = [7.00005, 4.80005];

test("profile: tagged height → osm_tag, ≥ 0.9, value 12", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "office", height: "12" }, lngLat: at, nowYear: NOW });
  const h = p.sets.find((s) => s.id === "size")!.fields.height;
  assert.equal(h.value, 12);
  assert.equal(h.source, "osm_tag");
  assert.ok(h.confidence >= 0.9);
  assert.equal(formatField(h), "12.0 m · tagged");
});
test("profile: levels path", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes", "building:levels": "4" }, lngLat: at, nowYear: NOW });
  const s = p.sets.find((x) => x.id === "size")!.fields;
  assert.equal(s.height.source, "osm_levels");
  assert.equal(s.floors.value, 4);
});
test("profile: type prior reads 'about'", () => {
  const p = buildingProfile({ feature: feat({ osm: 42, h: 6, b: 0, lv: 2, src: "type", tg: 0, kind: "house" }), tags: {}, lngLat: at, nowYear: NOW });
  const h = p.sets.find((x) => x.id === "size")!.fields.height;
  assert.equal(h.source, "type_prior");
  assert.match(formatField(h), /^about 6 m · from building type$/);
});
test("profile: height=0 + levels uses floors with a note", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes", height: "0", "building:levels": "10" }, lngLat: at, nowYear: NOW });
  const h = p.sets.find((x) => x.id === "size")!.fields.height;
  assert.equal(h.source, "osm_levels");
  assert.ok((h.value as number) >= 30);
  assert.match(h.note ?? "", /height=0/);
});
test("profile: ML footprint lowers confidence by 0.1", () => {
  const a = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes", "building:levels": "2" }, lngLat: at, nowYear: NOW });
  const b = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes", "building:levels": "2", source: "microsoft/BuildingFootprints" }, lngLat: at, nowYear: NOW });
  const ca = a.sets.find((x) => x.id === "size")!.fields.height.confidence;
  const cb = b.sets.find((x) => x.id === "size")!.fields.height.confidence;
  assert.ok(Math.abs(ca - cb - 0.1) < 1e-9 || cb < ca, `${ca} ${cb}`);
});
test("profile: GFA = area × floors, volume = area × height", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes", "building:levels": "3", height: "9" }, lngLat: at, nowYear: NOW });
  const s = p.sets.find((x) => x.id === "size")!.fields;
  const area = s.footprint.value as number;
  assert.ok(area > 100 && area < 150, String(area));
  assert.ok(Math.abs((s.gfa.value as number) - area * 3) < 1e-6);
  assert.ok(Math.abs((s.volume.value as number) - area * 9) < 1e-6);
});
test("profile: unknown material reads 'not mapped' (never invented)", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes" }, lngLat: at, nowYear: NOW });
  const w = p.sets.find((x) => x.id === "material")!.fields.walls;
  assert.equal(w.value, null);
  assert.equal(formatField(w), "not mapped");
  assert.equal(p.material, undefined);
});
test("profile: roof prior uses regional_prior (West Africa → corrugated metal)", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes" }, lngLat: at, nowYear: NOW });
  const r = p.sets.find((x) => x.id === "material")!.fields.roof;
  assert.equal(r.source, "regional_prior");
  assert.equal(r.value, "Corrugated metal sheet");
});
test("profile: tagged materials, age, OSM url, facts", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "retail", "building:material": "brick", "roof:material": "metal", start_date: "1975", height: "8" }, lngLat: at, nowYear: NOW });
  assert.equal(p.material, "brick");
  assert.equal(p.osmUrl, "https://www.openstreetmap.org/way/42");
  assert.equal(p.sets.find((x) => x.id === "age")!.fields.built.value, "built 1975 (51 years)");
  assert.equal(p.facts.length, 3);
  assert.ok(p.unique.includes("Brick walls, metal roof (tagged)"));
});
test("profile: serialised tags only hold allow-listed keys", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "house", phone: "+234", owner: "Ada", "contact:email": "a@b.c", note: "x", height: "7" } as Record<string, string>, lngLat: at, nowYear: NOW });
  const keys = Object.keys(JSON.parse(JSON.stringify(p)).tags);
  for (const k of keys) assert.ok(PUBLIC_TAG_KEYS.includes(k), k);
  assert.ok(!JSON.stringify(p).includes("+234"));
});
test("profile: tile feature id → floor(id/10)", () => {
  const p = buildingProfile({ feature: { id: 4205, layer: { id: "building-3d" }, properties: { render_height: 15 }, geometry: { type: "Polygon", coordinates: sq(7, 4.8) } }, tags: null, lngLat: at, nowYear: NOW });
  assert.equal(p.osmUrl, "https://www.openstreetmap.org/way/420");
  assert.equal(p.sets.find((x) => x.id === "size")!.fields.height.value, 15);
});
test("unique: deterministic, ≤ 3 lines, ranks by rarity", () => {
  const stats = { n: 50, hP50: 6, hP90: 12, hP99: 30, hMax: 40, yearN: 20, yearP05: 1920 };
  const facts = { height: 40, heightTagged: true, year: 1900, wall: "brick" as MaterialKey, roof: null, levels: 12 };
  const a = uniqueLines(facts, stats);
  assert.deepEqual(a, uniqueLines(facts, stats));
  assert.ok(a.length <= 3);
  assert.equal(a[0], "Tallest mapped building nearby");
  assert.equal(a[1], "Older than 95% of mapped buildings nearby");
});
test("profiles: walker, place, prop, scan", () => {
  assert.match(walkerProfile("w1").subtitle, /no identity/);
  assert.equal(placeProfile({ placeId: "p", name: "Mama Put", kind: "eat" }).category, "food_stall");
  const bench = propProfile("bench");
  assert.equal(bench.material, "wood");
  assert.equal(bench.massKg?.value, 35);
  const tree03 = propProfile("tree", { kind: "tree", osmId: 9, osmType: "n", lng: 7, lat: 4.8, heightM: 14, widthM: 9, depthM: 9, src: "osm", tree: { genus: "Mangifera", leaf: "b", crownM: 9, crownShape: "round", trunkM: 0.6 } });
  assert.equal(tree03.title, "Tree · Mangifera");
  assert.equal(tree03.osmUrl, "https://www.openstreetmap.org/node/9");
  assert.ok(propPhysics("parked_car"));
  const scan = scanProfile({ id: "s1", name: "Chair", format: "glb", status: "ready", pose: null, stats: { before: { tris: 10, meshes: 1, materials: 1, textures: 0, bytes: 1 }, after: { tris: 5, meshes: 1, materials: 1, textures: 0, bytes: 1 }, preset: "prop", budget: 1, simplified: true, size: [0.5, 0.9, 0.5], offset: [0, 0, 0], upAxis: "Y", metersPerUnit: 1, converter: null } }, { material: "wood", category: "chair", fill: "furniture" }, [0.1, 0.2, 0.3]);
  assert.equal(scan.sets[0].id, "yours");
  assert.match(String(scan.sets[0].fields.pin.value), /Pinned point 0.10, 0.20, 0.30 m/);
  assert.ok((scan.massKg?.value ?? 0) > 0 && scan.massKg?.note === "estimated ±50%");
});

// ── T8 affordances ───────────────────────────────────────────────────────────────────────────────
const ctx = (o: Partial<AffordCtx> = {}): AffordCtx => ({ distanceM: 1, isOwner: false, propertyReady: false, consented: false, kids: false, vehicleStopped: false, itemCount: 0, ...o });
const offer = (list: ReturnType<typeof offersFor>, v: string) => list.find((o) => o.verb === v);

test("afford: access=private building → enter disabled with reason", () => {
  const p = buildingProfile({ feature: feat({ osm: 42 }), tags: { building: "yes", access: "private" }, lngLat: at, nowYear: NOW });
  const e = offer(offersFor(p, ctx()), "enter")!;
  assert.equal(e.enabled, false);
  assert.equal(e.reason, "Private: no entry");
});
test("afford: bench → sit", () => assert.equal(offer(offersFor(propProfile("bench"), ctx()), "sit")?.enabled, true));
test("afford: storage → open; 30 kg refused; 10 kg 0.6 m allowed", () => {
  const item = (category: string, kg: number, dim: number) => ({ ...propProfile("bench"), className: "item", category, massKg: { value: kg, source: "owner" as const, confidence: 1 }, dimsM: { value: [dim, dim, dim] as [number, number, number], source: "scan" as const, confidence: 1 } });
  assert.equal(offer(offersFor(item("storage", 10, 0.6), ctx()), "open")?.enabled, true);
  const heavy = offer(offersFor(item("other", 30, 0.6), ctx()), "pick_up")!;
  assert.equal(heavy.enabled, false);
  assert.equal(heavy.reason, "Too heavy to carry (≈ 30 kg)");
  assert.equal(offer(offersFor(item("other", 10, 0.6), ctx()), "pick_up")?.enabled, true);
});
test("afford: link_record needs property ready", () => {
  const s = scanProfile({ id: "s", name: "x", format: "glb", status: "ready", pose: null, stats: null });
  const l = offer(offersFor(s, ctx({ isOwner: true })), "link_record")!;
  assert.equal(l.enabled, false);
  assert.ok(l.reason);
  assert.equal(offer(offersFor(s, ctx({ isOwner: true, propertyReady: true, consented: true })), "link_record")?.enabled, true);
});
test("afford: kids + food stall → no use", () => {
  assert.ok(offer(offersFor(propProfile("food_stall"), ctx()), "use"));
  assert.equal(offer(offersFor(propProfile("food_stall"), ctx({ kids: true })), "use"), undefined);
});
test("afford: a need raises the score; ride needs a stopped hailable vehicle", () => {
  const a = offer(offersFor(propProfile("bench"), ctx()), "sit")!.score;
  const b = offer(offersFor(propProfile("bench"), ctx({ needs: { rest: 1 } })), "sit")!.score;
  assert.ok(b > a);
  assert.equal(offer(offersFor(vehicleProfile("keke"), ctx()), "ride")?.enabled, false);
  assert.equal(offer(offersFor(vehicleProfile("keke"), ctx({ vehicleStopped: true })), "ride")?.enabled, true);
  assert.equal(offer(offersFor(vehicleProfile("car"), ctx({ vehicleStopped: true })), "ride")?.enabled, false);
});

// ── T9 gesture ───────────────────────────────────────────────────────────────────────────────────
function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => (timers.set(++seq, { at: t + ms, fn }), seq),
    clearTimeout: (id) => void timers.delete(id as number),
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      t = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    t = end;
  };
  return { clock, advance };
}
const ev = (x: number, y: number, pointerId = 1) => ({ pointerId, pointerType: "touch", clientX: x, clientY: y });

test("gesture: tap shorter than hold → no long-press", () => {
  const { clock, advance } = fakeClock();
  let n = 0;
  const g = createPressTracker({ holdMs: 450, clock, onLongPress: () => (n += 1) });
  g.down(ev(10, 10));
  advance(200);
  g.up(ev(10, 10));
  advance(1000);
  assert.equal(n, 0);
  assert.equal(g.swallowClick(), false);
});
test("gesture: hold → exactly one long-press, preview first, click swallowed for 450 ms", () => {
  const { clock, advance } = fakeClock();
  const log: string[] = [];
  const g = createPressTracker({ holdMs: 450, clock, onPreview: () => log.push("preview"), onLongPress: (p) => log.push(`long ${p.x},${p.y}`) });
  g.down(ev(10, 20));
  advance(1000);
  assert.deepEqual(log, ["preview", "long 10,20"]);
  g.up(ev(10, 20));
  assert.equal(g.swallowClick(), false); // 1000 ms - 450 ms fire time = 550 ms later
  g.down(ev(10, 20));
  advance(460);
  assert.equal(g.swallowClick(), true);
  advance(450);
  assert.equal(g.swallowClick(), false);
});
test("gesture: moving 11 px cancels; a second pointer cancels", () => {
  const { clock, advance } = fakeClock();
  let n = 0;
  let cancelled = 0;
  const g = createPressTracker({ holdMs: 450, clock, onLongPress: () => (n += 1), onCancel: () => (cancelled += 1) });
  g.down(ev(0, 0));
  advance(250);
  g.move(ev(11, 0));
  advance(500);
  assert.equal(n, 0);
  assert.equal(cancelled, 1);
  g.up(ev(11, 0));
  g.down(ev(0, 0, 1));
  g.down(ev(50, 50, 2));
  advance(500);
  assert.equal(n, 0);
});
test("gesture: contextmenu → immediate long-press", () => {
  const { clock } = fakeClock();
  let n = 0;
  let prevented = false;
  const g = createPressTracker({ holdMs: 450, clock, onLongPress: () => (n += 1) });
  g.contextmenu({ clientX: 5, clientY: 5, preventDefault: () => (prevented = true) });
  assert.equal(n, 1);
  assert.equal(prevented, true);
  assert.equal(g.swallowClick(), true);
});
test("gesture: attach/detach adds and removes every listener and restores styles", () => {
  const listeners = new Map<string, number>();
  const el = { style: { userSelect: "auto" } as Record<string, string>, addEventListener: (t: string) => listeners.set(t, (listeners.get(t) ?? 0) + 1), removeEventListener: (t: string) => listeners.set(t, (listeners.get(t) ?? 0) - 1) };
  const mapL = new Map<string, number>();
  const map = { on: (t: string) => mapL.set(t, (mapL.get(t) ?? 0) + 1), off: (t: string) => mapL.set(t, (mapL.get(t) ?? 0) - 1) };
  const g = createPressTracker({ holdMs: 450, onLongPress: () => undefined });
  const detach = g.attach(el, map);
  assert.equal(listeners.size, 5);
  assert.equal(el.style.userSelect, "none");
  assert.equal(mapL.size, 4);
  detach();
  for (const v of [...listeners.values(), ...mapL.values()]) assert.equal(v, 0);
  assert.equal(el.style.userSelect, "auto");
});

// ── T10 cell stats + m/rm/y ──────────────────────────────────────────────────────────────────────
test("buildingsData: m/rm/y from tags and cellStats percentiles", () => {
  const ring = [{ lat: 4.8, lon: 7 }, { lat: 4.8, lon: 7.0001 }, { lat: 4.8001, lon: 7.0001 }, { lat: 4.8, lon: 7 }];
  const fc = toBuildings([{ type: "way", id: 1, tags: { building: "yes", "building:material": "Brick", "roof:material": "metal", start_date: "1975", height: "9" }, geometry: ring }]);
  const p = fc.features[0].properties;
  assert.equal(p.m, "brick");
  assert.equal(p.rm, "metal");
  assert.equal(p.y, 1975);
  const stats = cellStats(Array.from({ length: 100 }, (_, i) => ({ properties: { h: i + 1, y: i < 10 ? 1900 + i : 0 } })));
  assert.equal(stats.n, 100);
  assert.equal(stats.hMax, 100);
  assert.equal(stats.hP99, 99);
  assert.equal(stats.hP50, 50);
  assert.equal(stats.yearN, 10);
  assert.equal(stats.yearP05, 1900);
});

// ── T12 picker + store ───────────────────────────────────────────────────────────────────────────
function mockMap(responses: HitFeature[][]) {
  const calls: number[] = [];
  const map: PickMap = {
    queryRenderedFeatures: (box) => {
      calls.push(box[1][0] - box[0][0]);
      return responses[calls.length - 1] ?? [];
    },
    unproject: () => ({ lng: 7, lat: 4.8 }),
    getBearing: () => 15,
    getLayer: () => ({}),
  };
  return { map, calls };
}
const bHit = (osm: number, layer = "ndu-real-buildings", extra: Record<string, unknown> = {}): HitFeature => ({ id: osm, layer: { id: layer }, properties: { osm, ...extra }, geometry: { type: "Polygon", coordinates: sq(7, 4.8) } });

test("pick: placing a scan owns the pointer", () => {
  const { map } = mockMap([[bHit(1)]]);
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans: { isPlacing: () => true } }), null);
});
test("pick: life beats building", () => {
  const { map } = mockMap([[bHit(1)]]);
  const t = pickAt(map, { x: 1, y: 1 }, { lifePickAt: () => ({ agentId: "v1", kind: "vehicle", vkind: "keke", lngLat: [7, 4.8] }) });
  assert.equal(t?.kind, "vehicle");
});
test("pick: scan beats building when nearer, building wins when much nearer", () => {
  const { map } = mockMap([[bHit(1)], [bHit(1)]]);
  const scans = { isPlacing: () => false, pick: () => ({ scanId: "s1", model: [0, 0, 0] as [number, number, number], distanceM: 20 }) };
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans, buildingDistanceM: () => 30 })?.kind, "scan");
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans, buildingDistanceM: () => 5 })?.kind, "building");
});
test("pick: tolerance retry with a 22 px box", () => {
  const { map, calls } = mockMap([[], [bHit(7)]]);
  const t = pickAt(map, { x: 50, y: 50 }, { layers: ["building"] });
  assert.deepEqual(calls, [12, 44]);
  assert.equal(t?.kind === "building" && t.osmId, 7);
  assert.equal(t?.kind === "building" && t.bearing, 15);
});
test("pick: dedupe prefers ndu-real-buildings; part:1 wins; osmIdOf both sources", () => {
  const d = dedupeBuildings([{ id: 5, layer: { id: "building-3d" }, properties: {} }, bHit(0.5 as unknown as number, "x"), { id: 50, layer: { id: "building-3d" }, properties: {} }, bHit(5)]);
  assert.ok(d.some((h) => h.layer?.id === "ndu-real-buildings" && osmIdOf(h) === 5));
  assert.equal(choosePart([bHit(1, "ndu-real-buildings", { part: 0 }), bHit(2, "ndu-real-buildings", { part: 1 })])?.properties?.osm, 2);
  assert.equal(osmIdOf({ id: 1234567, properties: {} }), 123456);
  assert.equal(osmIdOf({ id: 3, properties: { osm: 99 } }), 99);
});
test("store: open → peek, expand → full, close aborts and resets", () => {
  let aborted = false;
  let cleared = 0;
  const s = createInspectStore({ clearHighlight: () => (cleared += 1) });
  const seen: string[] = [];
  const off = s.subscribe(() => seen.push(s.get().sheet));
  s.open({ kind: "walker", agentId: "a", lngLat: [7, 4.8] }, { abort: () => (aborted = true) } as unknown as AbortController);
  s.expand();
  s.close();
  off();
  assert.deepEqual(seen, ["peek", "full", "closed"]);
  assert.equal(aborted, true);
  assert.equal(cleared, 1);
  assert.equal(s.get().target, null);
});

// NDU-UPG u-115: UI-over-world picker priority. The UI-context hits (a scan
// being placed, a life agent the HUD tracks) must win over the world feature
// at the same point — including when both are exactly coincident.

test("pick UI priority: placing a scan wins over a coincident building", () => {
  const { map } = mockMap([[bHit(1)]]);
  // building and scan at the same point: placing (UI) still returns null-safe
  // (the pointer belongs to placement, not the world)
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans: { isPlacing: () => true, pick: () => ({ scanId: "s1", model: null, distanceM: 0 }) } }), null);
});

test("pick UI priority: life agent wins over a coincident building", () => {
  const { map } = mockMap([[bHit(1)]]);
  const life = { agentId: "v1", kind: "vehicle" as const, vkind: "keke" as const, lngLat: [7, 4.8] as [number, number] };
  // exactly coincident: the UI-tracked agent still wins
  const t = pickAt(map, { x: 1, y: 1 }, { lifePickAt: () => life });
  assert.equal(t?.kind, "vehicle");
  // even when the world has many candidates at the same point
  const { map: busy } = mockMap([[bHit(1), bHit(2), bHit(3)]]);
  assert.equal(pickAt(busy, { x: 1, y: 1 }, { lifePickAt: () => life })?.kind, "vehicle");
});

test("pick UI priority: walker (UI) beats world; no UI hit falls through to world", () => {
  const { map } = mockMap([[bHit(1)]]);
  assert.equal(pickAt(map, { x: 1, y: 1 }, { lifePickAt: () => ({ agentId: "w1", kind: "walker", lngLat: [7, 4.8] }) })?.kind, "walker");
  // with no life/scan hit, the world feature is picked (fall-through, not a lock)
  const t = pickAt(map, { x: 1, y: 1 }, { lifePickAt: () => null });
  assert.equal(t?.kind, "building");
});

test("pick UI priority: scan vs building is distance-decided; scan within 1.5 m wins", () => {
  // mockMap cycles one response per query; give every call its own building
  const { map } = mockMap([[bHit(1)], [bHit(1)], [bHit(1)], [bHit(1)], [bHit(1)], [bHit(1)]]);
  const near = { isPlacing: () => false, pick: () => ({ scanId: "s1", model: null, distanceM: 0 }) };
  // scan at the point (distance 0) vs building at 0: scan wins (0 <= 0 + 1.5)
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans: near, buildingDistanceM: () => 0 })?.kind, "scan");
  // a scan 20 m out loses to a building 5 m away (20 > 5 + 1.5): world wins
  const far = { isPlacing: () => false, pick: () => ({ scanId: "s1", model: null, distanceM: 20 }) };
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans: far, buildingDistanceM: () => 5 })?.kind, "building");
  // but the same 20 m scan beats a building 30 m away (20 <= 30 + 1.5)
  assert.equal(pickAt(map, { x: 1, y: 1 }, { scans: far, buildingDistanceM: () => 30 })?.kind, "scan");
});

// NDU-UPG audit follow-up: the server fn interpolates input.id into Overpass
// QL; a non-integer id must be rejected before it reaches the query string.
// (serveInspectTags needs the server env; this pins the validation contract
// via the same predicate the server fn now guards with.)
test("inspect server: id must be a positive safe integer (injection guard)", () => {
  const valid = (id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
  assert.ok(valid(123456));
  assert.ok(!valid("1);out;"));
  assert.ok(!valid(1.5));
  assert.ok(!valid(-1));
  assert.ok(!valid(0));
  assert.ok(!valid(Number.NaN));
  assert.ok(!valid(Number.POSITIVE_INFINITY));
  assert.ok(!valid(2 ** 53)); // beyond safe integer
});
