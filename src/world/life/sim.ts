import { BEAT_PACE, beatAt } from "../director/npc.ts"; // NDU-UPG: city-director beat sets the pace
import { along, headingOf, laneOffset, nextDrive, nextWalk, pick, seeded, type Edge, type Graph, type XY } from "./graph.ts";
import { alongZ } from "../ground/profile.ts";
import { VEHICLE_BOX, contactPose, ease } from "../ground/pose.ts";
import { LIVERY, MIX, OUTFIT, SKIN, poiPull, type Region, type Targets, type VKind } from "./density.ts";
import { sizeOf } from "../traffic/dimensions.ts";

/**
 * NDU-UPG life (#203 #205-lite #208-lite #214 #219 #239 #240 #257 #258 #263 #276): the street
 * simulation. Walkers keep to sidewalks/footways; vehicles follow directed lanes with IDM car
 * following at 5 Hz (integrated per frame), stop at OSM bus stops, yield at OSM traffic signals and
 * brake for the player's avatar. Agents spawn/despawn off-screen when possible and fade otherwise.
 * Pure (no DOM / three) and seeded per ward so QA runs are reproducible.
 */

export type Role = "shopper" | "trader" | "churchgoer" | "commuter" | "stroller" | "foodie" | "neighbour";

type Agent = {
  id: number;
  /** rendered position (smoothed) in local metres, heading radians clockwise from north */
  rx: number;
  ry: number;
  rh: number;
  /** 0..1 grow-in / shrink-out so nothing pops in view */
  fade: number;
  leaving: boolean;
  placed: boolean;
  /** NDU realism 02: smoothed height (m, DEM metres; 0 when unbaked), pitch/roll (radians, vehicles) */
  rz?: number;
  pitch?: number;
  roll?: number;
};

export type Walker = Agent & {
  e: number;
  s: number;
  dir: 1 | -1;
  v: number;
  side: 1 | -1;
  pause: number;
  phase: number;
  amp: number;
  role: Role;
  skin: number;
  outfit: number;
  tall: number;
  /** NDU-UPG follow: greeted by the player: stands and turns to face them while `pause` lasts. */
  facing?: boolean;
};

export type Vehicle = Agent & {
  kind: VKind;
  e: number;
  next: number;
  s: number;
  v: number;
  acc: number;
  lane: number;
  len: number;
  drive: number;
  dwell: number;
  servedEdge: number;
  servedS: number;
  color: number;
};

const KIND: Record<VKind, { len: number; a: number; b: number; T: number; s0: number; cap: number }> = {
  car: { len: sizeOf("car").length, a: 1.6, b: 2.2, T: 1.2, s0: 2.2, cap: 60 / 3.6 },
  keke: { len: 2.7, a: 1.1, b: 2, T: 1.1, s0: 1.8, cap: 38 / 3.6 },
  bus: { len: sizeOf("bus").length, a: 0.9, b: 1.8, T: 1.6, s0: 3, cap: 50 / 3.6 },
  danfo: { len: 4.9, a: 1.3, b: 2.2, T: 1.1, s0: 2, cap: 50 / 3.6 },
};

const BIG_ROADS = new Set(["trunk", "primary", "secondary", "tertiary", "trunk_link", "primary_link", "secondary_link", "tertiary_link"]);

function kindFits(kind: VKind, cls: string): number {
  if (kind === "bus") return BIG_ROADS.has(cls) ? 1 : 0;
  if (kind === "danfo") return BIG_ROADS.has(cls) || cls === "unclassified" ? 1 : 0;
  if (kind === "keke") return cls.startsWith("motorway") || cls.startsWith("trunk") ? 0 : 1;
  return cls === "living_street" || cls === "service" ? 0.3 : 1;
}

const IDM_DT = 0.2;
const SIGNAL_CYCLE = 36;

export type SimOptions = { seed: number; region: Region; minutes: number; weekday: number };

export class StreetSim {
  readonly g: Graph;
  readonly region: Region;
  readonly walkers: Walker[] = [];
  readonly vehicles: Vehicle[] = [];
  private rnd: () => number;
  private nextId = 1;
  private targets: Targets = { walkers: 0, vehicles: 0 };
  private focus: XY = { x: 0, y: 0 };
  private radius = { walk: 220, drive: 380 };
  private visible: (p: XY) => boolean = () => false;
  private player: XY | null = null;
  private minutes: number;
  private weekday: number;
  private idmClock = 0;
  private clock = 0;
  /** POIs within 70 m of each walk edge's midpoint (indices into g.pois) */
  private edgePois: number[][];
  private walkPull: number[] = [];

  constructor(g: Graph, o: SimOptions) {
    this.g = g;
    this.region = o.region;
    this.rnd = seeded(o.seed);
    this.minutes = o.minutes;
    this.weekday = o.weekday;
    this.edgePois = g.walk.map((e) => {
      const m = along(g, e, e.len / 2, 0);
      const near: number[] = [];
      g.pois.forEach((p, i) => {
        if (p.kind === "signal" || p.kind === "stop" || p.kind === "yield" || p.kind === "board") return;
        if (Math.hypot(p.x - m.x, p.y - m.y) < 70) near.push(i);
      });
      return near;
    });
    this.computePull();
  }

  setTargets(t: Targets) {
    this.targets = t;
  }

  setClock(minutes: number, weekday: number) {
    if (Math.abs(minutes - this.minutes) < 5 && weekday === this.weekday) return;
    this.minutes = minutes;
    this.weekday = weekday;
    this.computePull();
  }

  setFocus(p: XY, walkRadius = 220, driveRadius = 380) {
    this.focus = p;
    this.radius = { walk: walkRadius, drive: driveRadius };
  }

  setVisibility(fn: (p: XY) => boolean) {
    this.visible = fn;
  }

  /** NDU-UPG follow: the player said hello: the walker stops and faces them for a few seconds. */
  greet(id: number, seconds = 8): Walker | null {
    const w = this.walkers.find((a) => a.id === id && !a.leaving);
    if (!w) return null;
    w.pause = Math.max(w.pause, seconds);
    w.facing = true;
    return w;
  }

  setPlayer(p: XY | null) {
    this.player = p;
  }

  private computePull() {
    this.walkPull = this.edgePois.map((list) => list.reduce((sum, i) => sum + poiPull(this.g.pois[i].kind, this.minutes, this.weekday), 1));
  }

  private near(p: XY, r: number) {
    return Math.hypot(p.x - this.focus.x, p.y - this.focus.y) < r;
  }

  /** Pick a spawn edge near the focus, off-screen if any of a few tries is (#240). */
  private spawnSpot(count: number, weight: (i: number) => number, at: (i: number, s: number) => XY, r: number): { i: number; s: number; seen: boolean } | null {
    const cand: number[] = [];
    const w: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const wt = weight(i);
      if (wt <= 0) continue;
      cand.push(i);
      w.push(wt);
    }
    if (!cand.length) return null;
    let last: { i: number; s: number; seen: boolean } | null = null;
    for (let tries = 0; tries < 6; tries += 1) {
      const i = cand[pick(w, this.rnd)];
      const s = this.rnd();
      const p = at(i, s);
      if (!this.near(p, r)) continue;
      const seen = this.visible(p);
      last = { i, s, seen };
      if (!seen) return last;
    }
    return last;
  }

  private role(edge: number): Role {
    const h = this.minutes / 60;
    const kinds = this.edgePois[edge].map((i) => this.g.pois[i].kind);
    const r = this.rnd();
    if (kinds.includes("church") && this.weekday === 0 && h >= 7 && h < 13 && r < 0.6) return "churchgoer";
    if (kinds.includes("market") && h >= 7 && h < 18) return r < 0.25 ? "trader" : "shopper";
    if ((kinds.includes("bus") || kinds.includes("station")) && r < 0.6) return "commuter";
    if (kinds.includes("food") && r < 0.5) return "foodie";
    if (h >= 18 || h < 6) return r < 0.5 ? "stroller" : "neighbour";
    return r < 0.35 ? "commuter" : r < 0.6 ? "shopper" : "neighbour";
  }

  private spawnWalker(instant: boolean): boolean {
    const g = this.g;
    const spot = this.spawnSpot(
      g.walk.length,
      (i) => {
        const e = g.walk[i];
        return this.near(along(g, e, e.len / 2, 0), this.radius.walk) ? this.walkPull[i] * Math.min(1, e.len / 12) : 0;
      },
      (i, s) => along(g, g.walk[i], g.walk[i].len * s, 0),
      this.radius.walk,
    );
    if (!spot) return false;
    const e = g.walk[spot.i];
    const outfits = OUTFIT[this.region];
    const w: Walker = {
      id: this.nextId++,
      e: spot.i,
      s: e.len * spot.s,
      dir: this.rnd() < 0.5 ? 1 : -1,
      v: (1.05 + this.rnd() * 0.45) * (e.vmax / 1.4),
      side: this.rnd() < 0.5 ? 1 : -1,
      pause: 0,
      phase: this.rnd() * Math.PI * 2,
      amp: 0,
      role: this.role(spot.i),
      skin: SKIN[Math.floor(this.rnd() * SKIN.length)],
      outfit: outfits[Math.floor(this.rnd() * outfits.length)],
      tall: 0.92 + this.rnd() * 0.16,
      rx: 0,
      ry: 0,
      rh: 0,
      fade: instant || !spot.seen ? 1 : 0,
      leaving: false,
      placed: false,
    };
    this.walkers.push(w);
    return true;
  }

  private spawnVehicle(instant: boolean): boolean {
    const g = this.g;
    if (!g.drive.length) return false;
    const mix = MIX[this.region];
    const kind = mix[pick(mix.map((m) => m[1]), this.rnd)][0];
    const spot = this.spawnSpot(
      g.drive.length,
      (i) => {
        const e = g.drive[i];
        if (e.len < KIND[kind].len + 4) return 0;
        return this.near(along(g, e, e.len / 2, 0), this.radius.drive) ? kindFits(kind, e.cls) * Math.min(1, e.len / 30) * (BIG_ROADS.has(e.cls) ? 1.6 : 1) : 0;
      },
      (i, s) => along(g, g.drive[i], g.drive[i].len * s, 0),
      this.radius.drive,
    );
    if (!spot) return false;
    const e = g.drive[spot.i];
    const lane = Math.floor(this.rnd() * e.lanes);
    const s = Math.max(1, Math.min(e.len - 1, e.len * spot.s));
    // never on top of another vehicle
    if (this.vehicles.some((o) => o.e === spot.i && Math.abs(o.s - s) < KIND[kind].len + 6 && Math.min(o.lane, e.lanes - 1) === lane)) return false;
    const colors = LIVERY[this.region][kind];
    const spec = KIND[kind];
    this.vehicles.push({
      id: this.nextId++,
      kind,
      e: spot.i,
      next: nextDrive(g, spot.i, this.rnd),
      s,
      v: Math.min(e.vmax, spec.cap) * 0.6,
      acc: 0,
      lane,
      len: spec.len,
      drive: 0.85 + this.rnd() * 0.2,
      dwell: 0,
      servedEdge: -1,
      servedS: -1,
      color: colors[Math.floor(this.rnd() * colors.length)],
      rx: 0,
      ry: 0,
      rh: 0,
      fade: instant || !spot.seen ? 1 : 0,
      leaving: false,
      placed: false,
    });
    return true;
  }

  /** Is the signal at `node` green for travel along `e`? N-S and E-W alternate on a 36 s cycle. */
  signalGreen(node: number, e: Edge, t = this.clock): boolean {
    const phase = ((t + node * 7.3) % SIGNAL_CYCLE) / SIGNAL_CYCLE;
    const northSouth = Math.abs(e.dy) >= Math.abs(e.dx);
    return northSouth ? phase < 0.5 : phase >= 0.5;
  }

  private idm() {
    const g = this.g;
    const byEdge = new Map<number, Vehicle[]>();
    for (const v of this.vehicles) {
      const list = byEdge.get(v.e) ?? [];
      list.push(v);
      byEdge.set(v.e, list);
    }
    for (const me of this.vehicles) {
      const e = g.drive[me.e];
      const spec = KIND[me.kind];
      const v0 = Math.max(2, Math.min(e.vmax, spec.cap) * me.drive);
      let gap = Infinity;
      let lead = 0;
      const lane = Math.min(me.lane, e.lanes - 1);
      for (const o of byEdge.get(me.e) ?? []) {
        if (o === me || Math.min(o.lane, e.lanes - 1) !== lane || o.s <= me.s) continue;
        const d = o.s - me.s - o.len;
        if (d < gap) {
          gap = d;
          lead = o.v;
        }
      }
      if (gap === Infinity && me.next >= 0) {
        for (const o of byEdge.get(me.next) ?? []) {
          const d = e.len - me.s + o.s - o.len;
          if (d < gap) {
            gap = d;
            lead = o.v;
          }
        }
      }
      const obstacle = (at: number) => {
        const d = at - me.s - 1;
        if (d > -1 && d < gap) {
          gap = Math.max(0.1, d);
          lead = 0;
        }
      };
      // #208-lite: stop line 4 m before a red signal
      const red = g.signals.has(e.b) && !this.signalGreen(e.b, e);
      if ((red || g.halts.has(e.b)) && e.len - me.s > 3.5) obstacle(e.len - 4);
      // #205-lite: buses and danfos stop at real OSM bus stops
      if ((me.kind === "bus" || me.kind === "danfo") && me.dwell <= 0) {
        for (const at of g.stops.get(me.e) ?? []) {
          if (at > me.s - 0.5 && !(me.servedEdge === me.e && me.servedS >= at)) {
            obstacle(at + 1);
            if (Math.abs(at - me.s) < 2.5 && me.v < 0.6) {
              me.dwell = 5 + this.rnd() * 4;
              me.servedEdge = me.e;
              me.servedS = at;
            }
            break;
          }
        }
      }
      // #219: brake for the player's avatar (never hit)
      if (this.player) {
        const a = g.nodes[e.a];
        const px = this.player.x - a.x;
        const py = this.player.y - a.y;
        const ahead = px * e.dx + py * e.dy;
        const lat = px * e.dy - py * e.dx - laneOffset(e, me.lane);
        if (ahead > me.s && ahead < me.s + 30 && Math.abs(lat) < 2.6) obstacle(ahead - 2.5);
      }
      const dv = me.v - lead;
      const sStar = spec.s0 + Math.max(0, me.v * spec.T + (me.v * dv) / (2 * Math.sqrt(spec.a * spec.b)));
      const free = 1 - (me.v / v0) ** 4;
      const inter = gap === Infinity ? 0 : (sStar / Math.max(0.1, gap)) ** 2;
      me.acc = Math.max(-8, Math.min(spec.a, spec.a * (free - inter)));
      if (me.dwell > 0) me.acc = -8;
    }
  }

  /** Advance the street by dt seconds. move=false (reduced motion): agents appear but stand still. */
  step(dt: number, move = true) {
    const g = this.g;
    this.clock += dt;
    // population: spawn toward targets (a few per frame), retire extras and far-away agents
    const keepW = this.walkers.filter((w) => !w.leaving).length;
    for (let n = 0, need = this.targets.walkers - keepW; n < Math.min(need, move ? 3 : 200); n += 1) this.spawnWalker(!move);
    const keepV = this.vehicles.filter((v) => !v.leaving).length;
    for (let n = 0, need = this.targets.vehicles - keepV; n < Math.min(need, move ? 2 : 200); n += 1) this.spawnVehicle(!move);
    this.retire(this.walkers, this.targets.walkers, this.radius.walk, 60);
    this.retire(this.vehicles, this.targets.vehicles, this.radius.drive, 80);
    const k = move ? 1 - Math.exp(-dt * 8) : 1;
    const fadeStep = move ? dt / 0.6 : 1;

    for (const w of this.walkers) {
      const e = g.walk[w.e];
      if (move && w.pause > 0) {
        w.pause -= dt;
        if (w.pause <= 0) w.facing = false;
        w.amp = 0.06;
        w.phase += dt * 1.6; // breathing idle (#276)
      } else if (move) {
        w.s += w.dir * w.v * BEAT_PACE[beatAt(this.minutes)] * dt;
        w.amp = Math.min(1, w.v / 1.2);
        w.phase += ((w.v * dt) / 0.75) * Math.PI;
        if (w.s < 0 || w.s > e.len) {
          const at = w.s < 0 ? e.a : e.b;
          const over = w.s < 0 ? -w.s : w.s - e.len;
          const [ni, nd] = nextWalk(g, w.e, at, this.rnd);
          const ne = g.walk[ni];
          w.e = ni;
          w.dir = nd;
          w.s = nd === 1 ? Math.min(over, ne.len) : Math.max(0, ne.len - over);
          w.v = Math.max(0.6, Math.min(1.6, w.v * (ne.vmax / Math.max(0.5, e.vmax))));
          // linger near busy places (stalls, stops, church doors): conversation-like pauses
          const pull = this.walkPull[ni] ?? 1;
          if (pull > 3 && this.rnd() < 0.25) w.pause = 2 + this.rnd() * 5;
        }
      } else {
        w.amp = 0;
      }
      const ce = g.walk[w.e];
      const off = ce.off > 0 ? ce.off : 0.6;
      // keep to one side of travel (sidewalk on roads, a little off-centre on footways)
      const p = along(g, ce, Math.max(0, Math.min(ce.len, w.s)), w.dir * w.side * off);
      const pl = w.facing && w.pause > 0 ? this.player : null; // NDU-UPG follow: turn to the player who greeted them
      const h = pl ? headingOf(pl.x - p.x, pl.y - p.y) : headingOf(ce.dx * w.dir, ce.dy * w.dir);
      this.place(w, p, h, w.placed ? k : 1, g.nodeZ ? alongZ(g, ce, Math.max(0, Math.min(ce.len, w.s))) : 0);
      w.fade = w.leaving ? Math.max(0, w.fade - fadeStep) : Math.min(1, w.fade + fadeStep);
    }

    if (move) {
      this.idmClock += dt;
      if (this.idmClock >= IDM_DT) {
        this.idmClock %= IDM_DT;
        this.idm();
      }
    }
    for (const v of this.vehicles) {
      if (move) {
        if (v.dwell > 0) {
          v.dwell -= dt;
          v.v = 0;
        } else {
          v.v = Math.max(0, Math.min(KIND[v.kind].cap * 1.05, v.v + v.acc * dt));
          v.s += v.v * dt;
        }
        let guard = 0;
        while (v.s > g.drive[v.e].len && guard++ < 4) {
          if (v.next < 0) {
            v.leaving = true;
            v.s = g.drive[v.e].len;
            break;
          }
          v.s -= g.drive[v.e].len;
          v.e = v.next;
          v.next = nextDrive(g, v.e, this.rnd);
        }
      }
      const e = g.drive[v.e];
      const p = along(g, e, Math.min(e.len, v.s), laneOffset(e, v.lane));
      this.place(v, p, headingOf(e.dx, e.dy), v.placed ? k : 1, g.nodeZ ? this.vehicleZ(v, e, Math.min(e.len, v.s), p, dt) : 0);
      v.fade = v.leaving ? Math.max(0, v.fade - fadeStep) : Math.min(1, v.fade + fadeStep);
    }
    for (const list of [this.walkers, this.vehicles] as Agent[][]) {
      for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].leaving && list[i].fade <= 0) list.splice(i, 1);
    }
  }

  /** NDU realism 02: lateral ground sampler (local metres → DEM metres) and the degrade "centre only" rung. */
  groundAt: ((x: number, y: number) => number) | null = null;
  groundCentreOnly = false;

  private vehicleZ(v: Vehicle, e: Edge, s: number, p: XY, dt: number): number {
    const [len, width] = VEHICLE_BOX[v.kind] ?? [4.5, 1.8];
    const half = 0.35 * len;
    const g = this.g;
    const zc = alongZ(g, e, s);
    if (this.groundCentreOnly || !Number.isFinite(zc)) {
      v.pitch = 0;
      v.roll = 0;
      return Number.isFinite(zc) ? zc : 0;
    }
    const zf = alongZ(g, e, s + half);
    const zr = alongZ(g, e, s - half);
    let zl = zc;
    let zrt = zc;
    const at = this.groundAt;
    if (at) {
      const w = width / 2;
      const c = at(p.x, p.y);
      if (Number.isFinite(c)) {
        zl = zc + at(p.x - e.dy * w, p.y + e.dx * w) - c;
        zrt = zc + at(p.x + e.dy * w, p.y - e.dx * w) - c;
      }
    }
    const pose = contactPose(zf, zr, zl, zrt, 2 * half, width);
    const kk = v.placed ? ease(dt, 0.2) : 1;
    v.pitch = (v.pitch ?? 0) + (pose.pitch - (v.pitch ?? 0)) * kk;
    v.roll = (v.roll ?? 0) + (pose.roll - (v.roll ?? 0)) * kk;
    return pose.z;
  }

  private place(a: Agent, p: XY, h: number, k: number, z = 0) {
    a.rx += (p.x - a.rx) * k;
    a.ry += (p.y - a.ry) * k;
    const zz = Number.isFinite(z) ? z : (a.rz ?? 0);
    a.rz = a.placed && a.rz !== undefined ? a.rz + (zz - a.rz) * k : zz;
    let dh = h - a.rh;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    a.rh += dh * k;
    a.placed = true;
  }

  private retire(list: Agent[], target: number, r: number, margin: number) {
    let alive = list.filter((a) => !a.leaving).length;
    for (const a of list) {
      if (a.leaving || !a.placed) continue;
      const p = { x: a.rx, y: a.ry };
      // far away, or out of sight and outside the radius: recycle it near the camera
      const gone = !this.near(p, r + margin) || (!this.near(p, r) && !this.visible(p));
      if (gone || alive > target) {
        a.leaving = true;
        alive -= 1;
        // off-screen agents vanish at once; on-screen ones shrink away (#240)
        if (!this.visible(p)) a.fade = 0;
      }
    }
  }
}

/** Canned talk-bubble lines per role (#266), with a local greeting per region. Adults-only world (18+). */
export function talkLine(role: Role, region: Region, id: number, minutes: number): string {
  const hi = region === "hi";
  const ng = region === "ng";
  const greet = hi ? "Aloha!" : ng ? "Good day o!" : "Hello!";
  const evening = minutes >= 17 * 60 || minutes < 5 * 60;
  const lines: Record<Role, string[]> = {
    shopper: [`${greet} Heading to the market before the good stuff sells out.`, "Looking for fresh fruit and a fair price.", "Just window-shopping, honestly."],
    trader: ["Stall is open! Come and see, I give you good price.", "Been here since seven. Business is steady today.", `${greet} Fresh stock just came in.`],
    churchgoer: ["Off to Sunday service. God is good!", "Choir practice ran long, but it was beautiful.", `${greet} Blessings on your day.`],
    commuter: ["Catching the next bus, wish me luck.", hi ? "TheBus should be here in five minutes." : "Waiting for a ride to work.", "Traffic is heavy, I'm walking instead."],
    stroller: [evening ? "Nice cool evening for a walk." : "Just stretching my legs.", "I like the street when it's quiet like this.", `${greet} Lovely night, isn't it?`],
    foodie: [evening ? "Dinner time! Following my nose." : "Lunch break, finally.", hi ? "Plate lunch spot around the corner is the best." : "Suya stand smells amazing tonight.", "Have you eaten yet?"],
    neighbour: [`${greet} Nice to see a new face on the block.`, "Just running errands.", "Lovely day in the neighbourhood."],
  };
  const list = lines[role];
  return list[id % list.length];
}

/** NDU-UPG follow: what a walker says back when the player waves (local greeting, then a role line). */
export function greetReply(role: Role, region: Region, id: number): string {
  const hi = region === "hi" ? ["Aloha! Howzit?", "Aloha, cousin!"] : region === "ng" ? ["How far? I dey o!", "Ah, good day! Welcome."] : ["Hey, hi there!", "Oh hello!"];
  const tail: Record<Role, string> = {
    shopper: "Market's that way if you need anything.",
    trader: "Come and look at my stall later!",
    churchgoer: "God bless you.",
    commuter: "Sorry, can't stop long, my ride is coming.",
    stroller: "Enjoy the walk.",
    foodie: "You should try the food stand down the road.",
    neighbour: "Good to see you around here.",
  };
  return `${hi[id % hi.length]} ${tail[role]}`;
}

export const ROLE_LABEL: Record<Role, string> = {
  shopper: "Shopper",
  trader: "Market trader",
  churchgoer: "Churchgoer",
  commuter: "Commuter",
  stroller: "Evening stroller",
  foodie: "On a food run",
  neighbour: "Neighbour",
};

export function vehicleLabel(kind: VKind, region: Region): string {
  if (kind === "bus") return region === "hi" ? "TheBus" : region === "ng" ? "City bus (BRT)" : "City bus";
  if (kind === "danfo") return "Danfo minibus";
  if (kind === "keke") return "Keke";
  return "Car";
}
