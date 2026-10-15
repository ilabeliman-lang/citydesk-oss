import { getTier, onTier } from "@/world/perf/tier";
import { getQuality, onQuality } from "@/world/perf/degrade";
import { getRealism, shownMinutes, subscribeRealism } from "@/world/realism/state";
import { lifeStreets } from "./streets.ts";
import type { Streets } from "./parse.ts";
import { buildGraph, hashSeed, projector, type XY } from "./graph.ts";
import { setDoors } from "./doors.ts";
import { streetWind, sway } from "@/world/atmosphere/wind";
import { lodScale } from "@/world/render/lod";
import { lampHalo } from "./lamps.ts";
import { lifeTargets, regionOf, weekdayIn } from "./density.ts";
import { greetReply, ROLE_LABEL, StreetSim, talkLine, vehicleLabel, type Vehicle, type Walker } from "./sim.ts";
import { BubbleCard } from "./card.ts";
import { BEAT_NOTE, beatAt } from "@/world/director/npc"; // NDU-UPG director
import { speakLine } from "@/world/tts/stream"; // NDU-UPG voice
import { setLifeBodies } from "./bodies.ts";
import { lifeEnabled, lifePlayerSpot, setLifeInspector, setLifePicker } from "./hooks.ts";
import { GREET_M, PERSONAL_M, lifeScales } from "./scale.ts";
import { applyRoadWidths, type WidthMap } from "./roadWidths.ts";
import { mergePois, roadNameNear, streetsFromTiles, type TileMap } from "./tiles.ts";
import type { FrameInfo, LifeHostMap } from "./lifeLayer.ts";
import { groundHandle, onGroundHandle } from "@/world/ground/hooks";
import { bakeGraph } from "@/world/ground/profile";

/**
 * NDU-UPG life — "fill the streets with life" (categories 5 + 6 of NDU_1000_UPGRADES.md).
 * Mounted once from CityBuildings after the style loads (own chunk). On every tier it sets true-scale
 * road widths (#201). On Tier A/B it fetches the street graph around the view, runs the walker +
 * traffic sim and lazy-loads the three.js custom layer that draws it; Tier C draws nothing here.
 * Density follows the realism time dial (#207 #258). Tap a walker or vehicle for a bubble card.
 */

export type LifeMap = LifeHostMap &
  WidthMap &
  TileMap & {
    getCenter: () => { lng: number; lat: number };
    getZoom: () => number;
    getPitch: () => number;
    getBearing: () => number;
    project: (lngLat: [number, number]) => { x: number; y: number };
    getContainer: () => HTMLElement;
    triggerRepaint: () => void;
    on: (event: string, fn: () => void) => void;
    off: (event: string, fn: () => void) => void;
  };

const MIN_ZOOM = 15.5;
const REFETCH_M = 250;
const OSM_WAIT_MS = 4000;

export { GREET_M, PERSONAL_M, lifeScales, STREET_TILT, vehicleScale, walkerScale } from "./scale.ts"; // NDU-UPG follow: moved (alias-free, unit tested)
export * from "./ride.ts";

/** Greet listens for ndu-stand. Call the return value when the street unmounts. */
export function bindNduStand(onStand: () => void): () => void {
  window.addEventListener("ndu-stand", onStand);
  return () => window.removeEventListener("ndu-stand", onStand);
}

export function mountLife(map: LifeMap): () => void {
  let dead = false;
  const lat0 = map.getCenter().lat;
  const restoreRoads = applyRoadWidths(map, lat0); // #201, all tiers (a style tweak, no extra drawing)
  if (!lifeEnabled()) return () => restoreRoads();

  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const card = new BubbleCard(map.getContainer());
  let sim: StreetSim | null = null;
  let streets: Streets | null = null;
  let proj = projector(lat0, map.getCenter().lng);
  let fetchedAt: { lat: number; lng: number } | null = null;
  let loading = false;
  let removeLayer: (() => void) | null = null;
  let removeLand: (() => void) | null = null;
  let layerJob: Promise<void> | null = null;
  let last = 0;
  let open: { kind: "walker"; a: Walker } | { kind: "vehicle"; a: Vehicle } | null = null;

  const toXY = (p: { lat: number; lng: number }) => proj.toXY(p.lng, p.lat);
  const screenOf = (x: number, y: number) => {
    const [lng, lat] = proj.toLL(x, y);
    return map.project([lng, lat]);
  };
  const canvasSize = () => {
    const c = map.getCanvas();
    return { w: c.clientWidth || 1, h: c.clientHeight || 1 };
  };
  /** Pixels per metre (vertical, roughly) at a local point: drives picking and the card's anchor. */
  const pxPerMetre = (x: number, y: number) => {
    const a = screenOf(x, y);
    const b = screenOf(x + 2, y);
    const tilt = Math.max(0.35, Math.sin((map.getPitch() * Math.PI) / 180));
    return { a, k: (Math.hypot(b.x - a.x, b.y - a.y) / 2) * tilt };
  };

  // ── NDU realism 02: ground heights (only when the ground handle exists and terrain is drawn) ──
  let bakeTimer = 0;
  let offGround: (() => void) | null = null;
  const bake = () => {
    if (!sim) return;
    const gh = groundHandle();
    const g = sim.g;
    if (!gh || gh.mode() !== "terrain3d") {
      if (g.nodeZ) {
        g.nodeZ = undefined;
        for (const e of [...g.drive, ...g.walk]) e.zs = undefined;
        sim.groundAt = null;
        map.triggerRepaint();
      }
      return;
    }
    const r = bakeGraph(g, gh.heightAt, proj.toLL, gh.version());
    gh.noteBake(r.ms);
    const local = proj;
    sim.groundAt = (x, y) => {
      const [lng, lat] = local.toLL(x, y);
      const s = gh.heightAt(lng, lat);
      return s.ok ? s.h : NaN;
    };
    map.triggerRepaint();
  };
  const scheduleBake = () => {
    window.clearTimeout(bakeTimer);
    bakeTimer = window.setTimeout(bake, 300);
  };
  const watchGround = () => {
    offGround?.();
    offGround = groundHandle()?.subscribe(scheduleBake) ?? null;
    scheduleBake();
  };
  const offGroundHandle = onGroundHandle(watchGround);
  watchGround();
  const groundZ = (): { z0: number; dem0: number } => {
    const gh = groundHandle();
    if (!sim?.g.nodeZ || !gh || gh.mode() !== "terrain3d") return { z0: 0, dem0: 0 };
    const d = gh.heightAt(sim.g.lng0, sim.g.lat0);
    const a = gh.anchorAt(sim.g.lng0, sim.g.lat0);
    return { z0: a.h, dem0: d.ok || d.src === "last" ? d.h : a.h };
  };

  const retarget = () => {
    if (!sim) return;
    const rs = getRealism();
    const minutes = shownMinutes(rs);
    const wd = weekdayIn(rs.at, rs.zone);
    sim.setClock(minutes, wd);
    sim.setTargets(lifeTargets(getTier().tier, minutes, wd, getQuality().step));
    map.triggerRepaint();
  };


  const publishBodies = () => {
    if (!sim || !proj) {
      setLifeBodies([]);
      return;
    }
    const out: { lng: number; lat: number; r: number }[] = [];
    for (const w of sim.walkers) {
      if (!w.placed || w.leaving || w.fade < 0.4) continue;
      const [lng, lat] = proj.toLL(w.rx, w.ry);
      out.push({ lng, lat, r: 0.55 });
    }
    for (const v of sim.vehicles) {
      if (!v.placed || v.leaving || v.fade < 0.4) continue;
      const [lng, lat] = proj.toLL(v.rx, v.ry);
      out.push({ lng, lat, r: v.kind === "bus" || v.kind === "danfo" ? 1.35 : 1.05 });
    }
    setLifeBodies(out);
  };
  let frames = 0;
  const frame = (now: number): FrameInfo => {
    frames += 1;
    // sparse frames (frame budget below) catch up in 0.1 s sub-steps, up to 0.8 s
    const dt = last ? Math.min(0.8, (now - last) / 1000) : 0;
    last = now;
    const z = map.getZoom();
    if (!sim || z < MIN_ZOOM) {
      setLifeBodies([]);
      return { sim: null, scale: 0, vscale: 0 };
    }
    // keep the crowd where the camera can see it: radius follows the visible ground width
    const mpp = (78271.517 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** z;
    const rw = Math.max(80, Math.min(260, canvasSize().w * mpp * 1.3));
    sim.setFocus(toXY(map.getCenter()), rw, Math.max(130, Math.min(420, rw * 1.6)));
    const player = lifePlayerSpot();
    sim.setPlayer(player ? toXY(player) : null);
    for (let left = dt; left > 1e-4; left -= 0.1) sim.step(Math.min(0.1, left), !reduced);
    if (dt <= 1e-4) sim.step(0, !reduced);
    followCard();
    publishBodies();
    if (sim.g.nodeZ) sim.groundCentreOnly = getQuality().step >= 3;
    const drawn = lifeScales(z, map.getPitch());
    const far = lodScale(rw);
    return { sim, scale: drawn.scale * far, vscale: drawn.vscale * far, ...groundZ() };
  };

  const ensureLayer = () => {
    if (layerJob || dead) return;
    layerJob = import("./lifeLayer.ts")
      .then(({ addLifeLayer }) => {
        if (dead) return;
        removeLayer = addLifeLayer(map, frame);
        map.triggerRepaint();
      })
      .catch(() => {
        layerJob = null; // three.js failed to load: the street just stays quiet
      });
  };

  const build = (st: Streets) => {
    if (dead) return;
    if (!st.roads.length && !st.walks.length) return; // nothing drawable here (yet): keep what we had
    streets = st;
    proj = projector(st.lat, st.lng);
    const g = buildGraph(st);
    setDoors(g.pois.filter((p) => p.kind === "door"));
    removeLand?.();
    removeLand = showLandmarks(map, g.pois);
    const rs = getRealism();
    card.close();
    open = null;
    sim = new StreetSim(g, {
      seed: hashSeed(`${st.lat.toFixed(3)},${st.lng.toFixed(3)}`), // #239 seeded per ward cell
      region: regionOf(st.lat, st.lng),
      minutes: shownMinutes(rs),
      weekday: weekdayIn(rs.at, rs.zone),
    });
    sim.setVisibility((p: XY) => {
      const s = screenOf(p.x, p.y);
      const { w, h } = canvasSize();
      return s.x > -60 && s.y > -60 && s.x < w + 60 && s.y < h + 60;
    });
    retarget();
    scheduleBake();
    ensureLayer();
  };

  /** Roads + footways from the map's own tiles (instant); signals/stops/POIs from Overpass when it answers in time. */
  const load = (c: { lat: number; lng: number }, tries = 0) => {
    if (loading || dead) return;
    loading = true;
    const osm = Promise.race([
      lifeStreets({ data: { lat: c.lat, lng: c.lng } }).catch(() => null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), OSM_WAIT_MS)),
    ]);
    void osm.then((o) => {
      loading = false;
      if (dead) return;
      const tiles = streetsFromTiles(map, c.lat, c.lng);
      if (tiles.roads.length + tiles.walks.length < 4 && !(o && o.roads.length)) {
        // tiles for a freshly jumped-to spot may still be loading
        if (tries < 4) window.setTimeout(() => load(c, tries + 1), 1500);
        return;
      }
      fetchedAt = { lat: c.lat, lng: c.lng };
      build(tiles.roads.length >= 4 || !o?.roads.length ? { ...tiles, pois: mergePois(tiles.pois, o?.pois) } : o);
    });
  };

  let moveTimer = 0;
  const onMoveEnd = () => {
    window.clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => {
      if (dead || map.getZoom() < MIN_ZOOM) return;
      const c = map.getCenter();
      if (!fetchedAt) return load(c);
      const d = Math.hypot((c.lng - fetchedAt.lng) * 111320 * Math.cos((c.lat * Math.PI) / 180), (c.lat - fetchedAt.lat) * 111320);
      if (d > REFETCH_M) load(c);
    }, 700);
  };
  map.on("moveend", onMoveEnd);

  // ~30 fps repaint on Tier B, every frame on Tier A; nothing while hidden, zoomed out or reduced motion.
  // Frame budget: the crowd watches the page's real frame rate each second and backs off (fewer
  // animated frames, down to one every 4 s) when the map gets slow, then creeps back when it's
  // smooth again, so the degrade ladder never drops a rung because of the crowd.
  let raf = 0;
  let lastPaint = 0;
  let every = 0;
  let winStart = 0;
  let winFrames = 0;
  let animating = false;
  let good = 0; // interval of the last smooth second
  let hold = 0; // after a dip, don't creep back below twice the last smooth interval (decays)
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const base = getTier().tier === "A" ? 0 : 31;
    winFrames += 1;
    if (!winStart) winStart = now;
    if (now - winStart >= 1000) {
      const fps = (winFrames * 1000) / (now - winStart);
      hold *= 0.97;
      if (animating) {
        if (fps < 45) hold = Math.min(4000, Math.max(hold, good * 2));
        if (fps > 55) good = every;
        if (fps < 25) every = Math.min(4000, Math.max(every * 4, 250));
        else if (fps < 45) every = Math.min(4000, Math.max(every * 2, 80));
        else if (fps > 55) every = Math.max(every * 0.8, hold);
      }
      winStart = now;
      winFrames = 0;
    }
    every = Math.max(base, every);
    animating = !!sim && !!removeLayer && !reduced && !document.hidden && map.getZoom() >= MIN_ZOOM;
    if (!animating || now - lastPaint < every) return;
    lastPaint = now;
    map.triggerRepaint();
  };
  raf = requestAnimationFrame(tick);

  // ── tap a walker or vehicle → bubble card ─────────────────────────────────
  type Hit = { kind: "walker"; a: Walker } | { kind: "vehicle"; a: Vehicle };
  const anchorOf = (hit: Hit) => {
    const { a, k } = pxPerMetre(hit.a.rx, hit.a.ry);
    const { scale, vscale } = lifeScales(map.getZoom(), map.getPitch());
    const tall = hit.kind === "walker" ? 1.75 * hit.a.tall * scale : (hit.a.kind === "bus" ? 3.2 : hit.a.kind === "car" ? 1.5 : 2) * vscale;
    return { ground: a, top: { x: a.x, y: a.y - tall * k } };
  };
  function followCard() {
    if (!open || !card.isOpen) return;
    const list: { id: number; leaving: boolean }[] = open.kind === "walker" ? (sim?.walkers ?? []) : (sim?.vehicles ?? []);
    if (!list.some((a) => a.id === open?.a.id && !a.leaving)) {
      card.close();
      open = null;
      return;
    }
    const { top } = anchorOf(open);
    const { w, h } = canvasSize();
    card.follow(top.x < -20 || top.y < -20 || top.x > w + 20 || top.y > h + 20 ? null : top);
  }
  const roadName = (v: Vehicle) => {
    const e = sim?.g.drive[v.e];
    const tagged = e && e.road >= 0 ? (streets?.roads[e.road]?.name ?? "") : "";
    if (tagged) return tagged;
    const [lng, lat] = proj.toLL(v.rx, v.ry);
    return roadNameNear(map, lng, lat);
  };
  /** NDU-UPG follow: metres from the player's avatar to a walker (null when the avatar isn't placed). */
  const metresToPlayer = (w: Walker) => {
    const p = lifePlayerSpot();
    if (!p) return null;
    const q = toXY(p);
    return Math.hypot(q.x - w.rx, q.y - w.ry);
  };
  const describe = (hit: Hit) => {
    const region = sim?.region ?? "other";
    if (hit.kind === "walker") {
      const w = hit.a;
      const d = metresToPlayer(w);
      const near = d !== null && d <= GREET_M;
      if (near) sim?.greet(w.id); // human range: they stop and turn to face you
      return {
        title: ROLE_LABEL[w.role],
        line: talkLine(w.role, region, w.id, shownMinutes(getRealism())),
        sub: !near ? `${BEAT_NOTE[beatAt(shownMinutes(getRealism()))]} · walk within ${GREET_M} m to say hello` : near && d !== null && d < PERSONAL_M ? "Personal space is 1.2 m. They stopped short of you." : near ? "Made-up neighbour · not a real person" : `Made-up neighbour · walk within ${GREET_M} m to say hello`,
        color: w.outfit,
        action: near
          ? {
              label: "👋 Wave hello",
              done: "👋 Waved",
              run: () => {
                sim?.greet(w.id, 10);
                const reply = greetReply(w.role, region, w.id);
                speakLine(reply); // tap-only voice reply, browser speech
                return reply;
              },
            }
          : undefined,
      };
    }
    const v = hit.a;
    const name = roadName(v);
    const kmh = Math.round(v.v * 3.6);
    const doing = v.dwell > 0 ? "Stopped at the bus stop" : kmh < 3 ? "Waiting in traffic" : `${kmh} km/h`;
    return {
      title: vehicleLabel(v.kind, region),
      line: name ? `On ${name} · ${doing}` : doing,
      sub: v.kind === "bus" || v.kind === "danfo" ? "Stops at real OSM bus stops · simulated, not live" : "Simulated traffic · busier at rush hour",
      color: v.color,
    };
  };
  // NDU-UPG inspect (#04): the hit test is shared by the tap picker and the inspect picker.
  const hitAt = (pt: { x: number; y: number }): Hit | null => {
    if (!sim || !removeLayer || map.getZoom() < MIN_ZOOM) return null;
    let best: Hit | null = null;
    let bestD = Infinity;
    const test = (hit: Hit, slop: number) => {
      if (!hit.a.placed || hit.a.fade < 0.5 || hit.a.leaving) return;
      const { ground, top } = anchorOf(hit);
      // distance from the tap to the agent's on-screen upright segment
      const vx = top.x - ground.x;
      const vy = top.y - ground.y;
      const len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((pt.x - ground.x) * vx + (pt.y - ground.y) * vy) / len2));
      const d = Math.hypot(pt.x - (ground.x + vx * t), pt.y - (ground.y + vy * t));
      if (d < slop && d < bestD) {
        bestD = d;
        best = hit;
      }
    };
    for (const a of sim.walkers) test({ kind: "walker", a }, 24);
    for (const a of sim.vehicles) test({ kind: "vehicle", a }, 30);
    return best as Hit | null;
  };
  setLifeInspector((pt) => {
    const hit = hitAt(pt);
    if (!hit) return null;
    const [lng, lat] = proj.toLL(hit.a.rx, hit.a.ry);
    if (hit.kind === "walker") return { agentId: `w${hit.a.id}`, kind: "walker", lngLat: [lng, lat] };
    const v = hit.a;
    return { agentId: `v${v.id}`, kind: "vehicle", vkind: v.kind as "car" | "keke" | "bus" | "danfo", lngLat: [lng, lat], stopped: v.dwell > 0 || v.v < 0.8 };
  });
  setLifePicker((pt) => {
    if (!sim || !removeLayer || map.getZoom() < MIN_ZOOM) return false;
    const hit = hitAt(pt);
    if (hit) {
      open = hit;
      card.open(hit.a.id, describe(hit));
      followCard();
      map.triggerRepaint();
      return true;
    }
    if (card.isOpen) {
      card.close();
      open = null;
      return true; // the dismissing tap does not also start a trip
    }
    return false;
  });

  const onStand = () => {
    if (!sim || card.isOpen) return;
    let best: Walker | null = null;
    let bestD = GREET_M;
    for (const w of sim.walkers) {
      if (!w.placed || w.leaving) continue;
      const d = metresToPlayer(w);
      if (d !== null && d <= bestD) {
        best = w;
        bestD = d;
      }
    }
    if (!best) return;
    const hit: Hit = { kind: "walker", a: best };
    open = hit;
    card.open(best.id, describe(hit));
    followCard();
  };
  const unbindStand = bindNduStand(onStand);

  const offRealism = subscribeRealism(retarget);
  const offQuality = onQuality(retarget);
  const offTier = onTier((t) => {
    if (t.tier === "C") {
      removeLayer?.();
      removeLayer = null;
      layerJob = null;
      sim = null;
      card.close();
    } else retarget();
  });
  const clock = window.setInterval(retarget, 60_000);
  load(map.getCenter());

  if (import.meta.env.DEV) {
    (window as Window & { __nduLife?: unknown }).__nduLife = {
      sim: () => sim,
      stats: () => ({
        walkers: sim?.walkers.length ?? 0,
        frameEvery: Math.round(every),
        vehicles: sim?.vehicles.length ?? 0,
        kinds: sim?.vehicles.reduce<Record<string, number>>((m, v) => ((m[v.kind] = (m[v.kind] ?? 0) + 1), m), {}),
        graph: sim ? { walk: sim.g.walk.length, drive: sim.g.drive.length, pois: sim.g.pois.length, signals: sim.g.signals.size, stops: sim.g.stops.size } : null,
        layer: Boolean(removeLayer),
        frames,
        sample: sim?.vehicles.slice(0, 2).map((v) => ({ ll: proj.toLL(v.rx, v.ry), scr: screenOf(v.rx, v.ry), fade: v.fade, kind: v.kind })),
      }),
      /** QA: a camera spot on the nearest big street (centre + bearing along it) */
      streetView: () => {
        if (!sim) return null;
        const g = sim.g;
        const c = toXY(map.getCenter());
        let best: { x: number; y: number; h: number; d: number } | null = null;
        for (const e of g.drive) {
          if (!["primary", "secondary", "tertiary"].includes(e.cls) || e.len < 40) continue;
          const a = g.nodes[e.a];
          const m = { x: a.x + (e.dx * e.len) / 2, y: a.y + (e.dy * e.len) / 2 };
          const d = Math.hypot(m.x - c.x, m.y - c.y);
          if (!best || d < best.d) best = { ...m, h: (Math.atan2(e.dx, e.dy) * 180) / Math.PI, d };
        }
        if (!best) return null;
        const [lng, lat] = proj.toLL(best.x, best.y);
        return { lng, lat, bearing: best.h };
      },
      /** QA: screen point of the nearest on-screen walker/vehicle to the view centre */
      nearest: (kind: "walker" | "vehicle" = "walker") => {
        const { w, h } = canvasSize();
        const list = kind === "walker" ? (sim?.walkers ?? []) : (sim?.vehicles ?? []);
        let best: { x: number; y: number; d: number } | null = null;
        for (const a of list) {
          if (!a.placed || a.fade < 1) continue;
          const hit = (kind === "walker" ? { kind, a } : { kind, a }) as Hit;
          const { ground, top } = anchorOf(hit);
          const p = { x: (ground.x + top.x) / 2, y: (ground.y + top.y) / 2 };
          if (p.x < 30 || p.y < 120 || p.x > w - 30 || p.y > h - 90) continue;
          const d = Math.hypot(p.x - w / 2, p.y - h * 0.62);
          if (!best || d < best.d) best = { ...p, d };
        }
        return best;
      },
    };
  }

  return () => {
    dead = true;
    window.clearTimeout(bakeTimer);
    offGround?.();
    offGroundHandle();
    cancelAnimationFrame(raf);
    window.clearTimeout(moveTimer);
    window.clearInterval(clock);
    map.off("moveend", onMoveEnd);
    offRealism();
    unbindStand();
    offQuality();
    offTier();
    setLifePicker(null);
    setLifeInspector(null); // NDU-UPG inspect (#04)
    card.close();
    removeLayer?.();
    removeLand?.();
    restoreRoads();
    setLifeBodies([]);
  };
}

const LAND = "ndu-land";
const MARKS = new Set(["tree", "board", "cave", "lamp", "bench", "bin", "door"]);

function leaned(p: { kind: string; lng: number; lat: number }): [number, number] {
  if (p.kind !== "tree") return [p.lng, p.lat];
  const lean = sway(performance.now() / 1000, streetWind());
  const cos = Math.cos((p.lat * Math.PI) / 180) || 1;
  return [p.lng + lean.east / (111320 * cos), p.lat + lean.north / 111320];
}

function showLandmarks(map: LifeMap, pois: { kind: string; lng: number; lat: number }[]): () => void {
  const draw = map as LifeMap & {
    getSource?: (id: string) => { setData: (data: unknown) => void } | undefined;
    addSource?: (id: string, spec: unknown) => void;
    addLayer?: (layer: unknown) => void;
    getLayer?: (id: string) => unknown;
    removeLayer?: (id: string) => void;
    removeSource?: (id: string) => void;
    setPaintProperty?: (id: string, prop: string, value: unknown) => void;
  };
  let timer = 0;
  const close = () => {
    if (timer) window.clearInterval(timer);
    if (draw.getLayer?.(LAND)) draw.removeLayer?.(LAND);
    if (draw.getSource?.(LAND)) draw.removeSource?.(LAND);
  };
  if (!draw.getSource || !draw.addSource || !draw.addLayer) return close;
  const collection = () => ({
    type: "FeatureCollection",
    features: pois
      .filter((p) => MARKS.has(p.kind))
      .map((p) => ({
        type: "Feature",
        properties: { kind: p.kind },
        geometry: { type: "Point", coordinates: leaned(p) },
      })),
  });
  const lampOpacity = () => ["match", ["get", "kind"], "lamp", lampHalo(getRealism().pal.night), 0.92] as unknown;
  const existing = draw.getSource(LAND);
  if (existing) existing.setData(collection());
  else {
    draw.addSource(LAND, { type: "geojson", data: collection() });
    draw.addLayer({
      id: LAND,
      type: "circle",
      source: LAND,
      paint: {
        "circle-radius": ["match", ["get", "kind"], "tree", 3.5, "lamp", 2.2, "bench", 2.4, "door", 2.2, "board", 2.4, 2],
        "circle-color": ["match", ["get", "kind"], "tree", "#2f6b34", "lamp", "#f0d7a4", "bench", "#8a6244", "door", "#d7c4a8", "board", "#c4a574", "#3a3532"],
        "circle-stroke-width": 0.6,
        "circle-stroke-color": "#1a1714",
        "circle-opacity": lampOpacity(),
      },
    });
  }
  timer = window.setInterval(() => {
    const src = draw.getSource?.(LAND);
    if (!src) return;
    src.setData(collection());
    draw.setPaintProperty?.(LAND, "circle-opacity", lampOpacity());
  }, 400);
  return close;
}
