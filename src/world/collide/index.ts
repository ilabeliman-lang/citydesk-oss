import type { Map as MapLibreMap } from "maplibre-gl";
import { onCollideData } from "./bus.ts";
import { collideSubFlag } from "./flag.ts";
import { needsRecentre, toLL, toXY } from "./enu.ts";
import { bestDoor, doorsFromEntrances, mergeDoors, synthDoors, type RoadDistance } from "./doors.ts";
import { ejectPoint } from "./eject.ts";
import { newResult, slideMove, tickStuck } from "./move.ts";
import { gridAStar, needsDetour } from "./route.ts";
import { armAuto, newTrigger, startCooldown, tickTrigger } from "./trigger.ts";
import { addLayers, doorFeatures, setDebugEdges, setDoors } from "./layers.ts";
import { probeCamera } from "./camera.ts";
import { CollisionWorld } from "./world.ts";
import { INDEX_R, INDEX_R_C, REBUILD_MOVE, type Collider, type Door, type EntranceNode, type Vec } from "./types.ts";

/** NDU-UPG collide: lazy chunk that owns the collision world, doors, trigger and layers (CD-COL-07). */
type LL = { lat: number; lng: number };
export type RoadFns = { distance: (lat: number, lng: number) => number; snap: (lat: number, lng: number) => LL | null };
export type DoorSpot = { name: string; lat: number; lng: number; feature: unknown; bearing: number; kind: string; door: { lat: number; lng: number; bearing: number; kind: string; synthetic: boolean; locked: boolean }; buildingOsm?: number };
export type TriggerResult = { enter: DoorSpot | null; peek: DoorSpot | null; door: unknown; prompt: { changed: boolean; text: string | null; locked: boolean } };

export type CollideHandle = {
  readonly ready: boolean;
  move(from: LL, east: number, north: number, meters: number): LL;
  eject(at: LL): { ll: LL; note: string } | null;
  trigger(i: { you: LL; vel: Vec; stickHeld: boolean; eHeld: boolean; typing: boolean; dt: number }): TriggerResult;
  nearestDoorDist(at: LL): number;
  exitSpot(door: unknown): LL | null;
  walkTarget(tap: { osm?: number | null; at: LL }, from: LL): { goal: LL; name: string; doorId: string } | { goal: null; name: string } | null;
  armDoor(doorId: string | null): void;
  detour(from: LL, to: LL): LL[] | null;
  camera(at: LL, bearing: number, eyeM: number, backM: number): { occluders: number[]; boomScale: number } | null;
  stats: Record<string, number>;
  dispose(): void;
};

const bearingOf = (v: Vec) => ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;

export function colliderAsFeature(world: CollisionWorld, c: Collider): GeoJSON.Feature {
  const coords = c.rings.map((r) => {
    const out: number[][] = [];
    for (let i = 0; i < r.length; i += 2) {
      const p = toLL(world.frame, r[i], r[i + 1]);
      out.push([p.lng, p.lat]);
    }
    return out;
  });
  return { type: "Feature", id: c.osm ?? undefined, properties: { osm: c.osm, h: c.height, b: c.base, lv: c.levels, name: c.name, kind: c.kind, render_height: c.height, render_min_height: c.base, "building:levels": c.levels || undefined }, geometry: { type: "Polygon", coordinates: coords } };
}

export function mountCollide(map: MapLibreMap, o: { getYou: () => LL; road: () => RoadFns | null; tierC?: boolean }): CollideHandle {
  const debug = collideSubFlag("debug");
  const world = new CollisionWorld();
  const you0 = o.getYou();
  world.setFrame(you0.lat, you0.lng);
  const stats = { queryMs: 0, buildMs: 0, colliders: 0, edges: 0, doors: 0, blocks: 0, ejects: 0, stuck: 0, entries: 0, rebuilds: 0 };
  const res = newResult();
  const trig = newTrigger();
  const stuck = { t: 0 };
  let ready = false;
  let built: LL | null = null;
  let timer = 0;
  let dead = false;
  let lastDoorKey = "";
  let entrances: EntranceNode[] = [];
  let nearFid: number | null = null;
  const removeLayers = addLayers(map, { tierC: Boolean(o.tierC), debug });
  const radius = o.tierC ? INDEX_R_C : INDEX_R;

  const roadDist = (): RoadDistance | null => {
    const r = o.road();
    if (!r) return null;
    return (x, y) => {
      const ll = toLL(world.frame, x, y);
      const p = r.snap(ll.lat, ll.lng);
      if (!p) return null;
      const v = toXY(world.frame, p.lat, p.lng);
      return { d: Math.hypot(v.x - x, v.y - y), px: v.x, py: v.y };
    };
  };

  const rebuild = () => {
    if (dead) return;
    const you = o.getYou();
    if (needsRecentre(world.frame, you.lat, you.lng)) world.setFrame(you.lat, you.lng);
    const st = world.rebuild(you, radius);
    const tagged = doorsFromEntrances(world, entrances, debug);
    world.doors = mergeDoors([...tagged, ...synthDoors(world, roadDist(), tagged)]);
    stats.buildMs = Math.round(st.buildMs * 10) / 10;
    stats.colliders = st.colliders;
    stats.edges = st.edges;
    stats.doors = world.doors.length;
    stats.rebuilds += 1;
    built = { ...you };
    ready = true;
    const key = world.doors.map((d) => d.id).join("|");
    if (key !== lastDoorKey) {
      lastDoorKey = key;
      nearFid = null;
      setDoors(map, doorFeatures(world.frame, world.doors, toXY(world.frame, you.lat, you.lng)));
    }
    if (debug) setDebugEdges(map, world);
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(rebuild, { timeout: 1000 });
      else window.setTimeout(rebuild, 50);
    }, 250);
  };
  const off = onCollideData((d) => {
    entrances = [];
    for (const list of d.entrances.values()) entrances.push(...(list as EntranceNode[]));
    world.ingest({ buildings: d.buildings, tileFootprints: d.tileFootprints });
    schedule();
  });

  const doorSpot = (door: Door): DoorSpot | null => {
    const c = world.byKey(door.colliderKey);
    if (!c) return null;
    const at = toLL(world.frame, door.at.x, door.at.y);
    const inward = bearingOf({ x: -door.normal.x, y: -door.normal.y });
    return { name: door.name || c.name || "This building", lat: at.lat, lng: at.lng, feature: colliderAsFeature(world, c), bearing: inward, kind: c.kind, door: { lat: at.lat, lng: at.lng, bearing: inward, kind: door.kind, synthetic: door.synthetic, locked: door.locked }, buildingOsm: c.osm ?? undefined };
  };

  let promptKey: string | null = null;
  const handle: CollideHandle = {
    get ready() {
      return ready;
    },
    stats,
    move(from, east, north, meters) {
      if (!ready) return from;
      const t0 = performance.now();
      if (built && Math.hypot(toXY(world.frame, from.lat, from.lng).x - toXY(world.frame, built.lat, built.lng).x, toXY(world.frame, from.lat, from.lng).y - toXY(world.frame, built.lat, built.lng).y) > REBUILD_MOVE) {
        built = { ...from };
        schedule();
      }
      const p = toXY(world.frame, from.lat, from.lng);
      const m = Math.hypot(east, north) || 1;
      slideMove(world, p, { x: (east / m) * meters, y: (north / m) * meters }, world.opts, res);
      if (res.blocked) stats.blocks += 1;
      if (tickStuck(stuck, meters, res.moved, 1 / 60)) stats.stuck += 1;
      stats.queryMs = Math.round((stats.queryMs * 119 + (performance.now() - t0)) / 120 * 1000) / 1000;
      return toLL(world.frame, res.pos.x, res.pos.y);
    },
    eject(at) {
      if (!ready) return null;
      const p = toXY(world.frame, at.lat, at.lng);
      const e = ejectPoint(world, p.x, p.y);
      if (!e) return null;
      stats.ejects += 1;
      const name = e.collider.name || "a building";
      return { ll: toLL(world.frame, e.x, e.y), note: e.via === "door" ? `You were inside ${name}, so we stepped you out by the door.` : `You were inside ${name}, so we stepped you out to the street.` };
    },
    trigger(i) {
      const empty: TriggerResult = { enter: null, peek: null, door: null, prompt: { changed: false, text: null, locked: false } };
      if (!ready) return empty;
      const p = toXY(world.frame, i.you.lat, i.you.lng);
      const out = tickTrigger(trig, { pos: p, vel: i.vel, stickHeld: i.stickHeld, eHeld: i.eHeld, typing: i.typing, dt: i.dt, doors: world.doors });
      const d = out.door;
      const key = d && out.state === "prompting" ? `${d.id}:${d.locked}` : null;
      const changed = key !== promptKey;
      promptKey = key;
      if (changed) {
        // highlight the nearest door slab + dot
        const feats = doorFeatures(world.frame, world.doors, p);
        const fid = d ? ((feats.find((f) => (f.properties as { id: string }).id === d.id)?.id as number | undefined) ?? null) : null;
        try {
          if (nearFid !== null) {
            map.setFeatureState({ source: "ndu-doors-src", id: nearFid }, { near: false });
            map.setFeatureState({ source: "ndu-doors-src", id: nearFid + 1 }, { near: false });
          }
          if (fid !== null) {
            map.setFeatureState({ source: "ndu-doors-src", id: fid }, { near: true });
            map.setFeatureState({ source: "ndu-doors-src", id: fid + 1 }, { near: true });
          }
        } catch {
          /* source not ready */
        }
        nearFid = fid;
      }
      const name = d ? d.name || world.byKey(d.colliderKey)?.name || "this building" : "";
      const r: TriggerResult = { enter: null, peek: null, door: d, prompt: { changed, text: key && d ? (d.locked ? `${name} · private` : `Enter ${name}`) : null, locked: Boolean(d?.locked) } };
      if (d && out.enter) {
        stats.entries += 1;
        r.enter = doorSpot(d);
      } else if (d && out.peek) r.peek = doorSpot(d);
      return r;
    },
    nearestDoorDist(at) {
      const p = toXY(world.frame, at.lat, at.lng);
      let best = Infinity;
      for (const d of world.doors) best = Math.min(best, Math.hypot(d.at.x - p.x, d.at.y - p.y));
      return best;
    },
    exitSpot(door) {
      const d = door as Door | null;
      if (!d || !d.approach) return null;
      startCooldown(trig, d.id);
      const out = toLL(world.frame, d.approach.x + d.normal.x * 0.3, d.approach.y + d.normal.y * 0.3);
      return out;
    },
    walkTarget(tap, from) {
      if (!ready) return null;
      let c: Collider | null = tap.osm ? world.byOsm(tap.osm) : null;
      if (!c) {
        const p = toXY(world.frame, tap.at.lat, tap.at.lng);
        c = world.pointInBlocking(p.x, p.y);
      }
      if (!c) return null;
      const f = toXY(world.frame, from.lat, from.lng);
      const d = bestDoor(world.doors, c.key, f);
      if (!d || d.locked) return { goal: null, name: c.name || "This building" };
      return { goal: toLL(world.frame, d.approach.x, d.approach.y), name: d.name || c.name || "This building", doorId: d.id };
    },
    armDoor(id) {
      armAuto(trig, id);
    },
    detour(from, to) {
      if (!ready) return null;
      const a = toXY(world.frame, from.lat, from.lng);
      const b = toXY(world.frame, to.lat, to.lng);
      if (!needsDetour(world, a, b)) return null;
      const path = gridAStar(world, a, b);
      return path ? path.map((v) => toLL(world.frame, v.x, v.y)) : null;
    },
    camera(at, bearing, eyeM, backM) {
      if (!ready || o.tierC || !collideSubFlag("camera")) return null;
      return probeCamera(world, toXY(world.frame, at.lat, at.lng), bearing, eyeM, backM);
    },
    dispose() {
      dead = true;
      off();
      window.clearTimeout(timer);
      removeLayers();
      const w = window as Window & { __nduCollide?: unknown };
      if (w.__nduCollide) delete w.__nduCollide;
    },
  };
  const qa: Record<string, unknown> = {
    stats,
    world,
    probe: (lat: number, lng: number) => {
      const p = toXY(world.frame, lat, lng);
      return { inside: world.pointInBlocking(p.x, p.y)?.key ?? null, clearance: world.clearance(p.x, p.y, 3) };
    },
  };
  if (import.meta.env?.DEV || debug) qa.place = (lat: number, lng: number) => window.dispatchEvent(new CustomEvent("ndu-collide-place", { detail: { lat, lng } }));
  (window as Window & { __nduCollide?: unknown }).__nduCollide = qa;
  return handle;
}
