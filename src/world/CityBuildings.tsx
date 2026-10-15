import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { bindInput, readMove } from "@/game/input";
import { buildWays, cruise, openWays, pace, poseBearing, posePoint, readWard, roadDistance, snapPose, walkPose, wayLabel, writeWard, type Net, type Pose, type Pt } from "@/world/paths";
import { getBots, getYard, robotTick } from "@/world/robotLife";
import { aheadPoint, takeRide, yieldTo } from "@/world/transit";
import { clock, cumulative, distanceLabel, planTrip, splitAt, TRIP_NOTE, type TripSource } from "@/world/trip";
import type { Neighbor } from "@/world/presence";
import type { Place } from "@/world/places";
import { registerSearchMap } from "@/world/search/mapHandle"; // NDU-AI search
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { ScanMap } from "@/world/scanLayer";
import { ScanDesk } from "@/world/ScanDesk";
import { attachDragTurn } from "@/world/dragTurn";
import { attachFollow } from "@/world/orbit/follow"; // NDU-UPG follow
import { followAttached, getPerson, setPerson, streetNow } from "@/world/orbit/followBus"; // NDU-UPG follow
import { RouteBubble } from "@/world/bubbles/RouteBubble"; // NDU-UPG bubbles
import { ToolCluster } from "@/world/bubbles/ToolCluster"; // NDU-UPG bubbles
// NDU-UPG 502/503/504: device tiers + degrade ladder; three.js only when scans are needed.
import { attachMapPerf, tierMapOptions, type PerfMap } from "@/world/perf/mapPerf";
import { gateScans } from "@/world/perf/scanGate";
// NDU-UPG 5 6 7 51: real sun + real building heights (src/world/realism)
import { addSatelliteBasemap } from "@/world/satellite";
import { TimeDial } from "@/world/realism/TimeDial";
import { tappableBuildingLayers } from "@/world/realism/layers";
import { blocksBuilding, slideMeters } from "@/world/realism/collide";
import { doorWithin } from "@/world/life/doors";
import { inspectLine } from "@/world/realism/inspect";
import { lifeBodies } from "@/world/life/bodies";
import { lifePlayer, lifeTap, streetRoster } from "@/world/life/hooks"; // NDU-UPG life: walkers + traffic
import { stepSurface } from "@/world/audio/footsteps";
import { playFootstep, unlockStreetSteps } from "@/world/workverse/audio";
import { ImmerseSlot } from "@/world/immerse/ImmerseSlot"; // NDU-UPG immerse
import { immerseAllowed } from "@/world/immerse/flag"; // NDU-UPG immerse
import { groundOn } from "@/world/ground/flag"; // NDU realism 02: terrain + ground clamping (default off)
import { onPlayerSpot } from "@/world/ground/hooks";
import { propsAllowed } from "@/world/props/flag"; // NDU-UPG props (tiny, no three.js)
import { AssistantSlot } from "@/world/assistant/AssistantSlot"; // NDU-AI assistant
import { inspectAllowed, inspectTapFirst } from "@/world/inspect/flag"; // NDU-UPG inspect (#04): tiny, eager
import { InspectSlot } from "@/world/inspect/InspectSlot"; // NDU-UPG inspect (#04): sheet chunk loads on first pick
import { registerAssistantMap, setAssistantPlaces } from "@/world/assistant/bridgeStore"; // NDU-AI assistant
import { readRun, setStick } from "@/game/input";
import "@/world/hud/hud.css";
import { isKeyHeld } from "@/game/input"; // NDU-UPG collide
import { collideOn, noteEnteredDoor, onExited, publishRoadNet } from "@/world/collide/bus"; // NDU-UPG collide
import type { CollideHandle } from "@/world/collide"; // NDU-UPG collide (type only; chunk is lazy)
import { readMoveFp } from "@/game/input"; // NDU-FP
import { fpAllowed } from "@/world/fp/flag"; // NDU-FP
import type { FpHandle } from "@/world/fp/controller"; // NDU-FP (type only)

/** NDU-UPG collide: soft magnetism toward the street direction (mirror of collide/move.ts magnetise; kept here so the flag-off entry chunk stays collide-free). */
function magnetiseLite(east: number, north: number, dir: { x: number; y: number }, dist: number) {
  const m = Math.hypot(east, north);
  if (m < 1e-9 || dist > 3) return { east, north };
  const cos = (east * dir.x + north * dir.y) / m;
  if (Math.abs(cos) < 0.7) return { east, north };
  const s = cos < 0 ? -1 : 1;
  const w = 0.6 * (1 - dist / 3);
  const ex = east / m + (dir.x * s - east / m) * w;
  const ny = north / m + (dir.y * s - north / m) * w;
  const l = Math.hypot(ex, ny) || 1;
  return { east: (ex / l) * m, north: (ny / l) * m };
}

// NDU-FP: the lazily loaded first-person controller, set once its chunk arrives (never loaded with the flag off).
let fpLazy: FpHandle | null = null;

function MapTouchControls() {
  const [touchSupported, setTouchSupported] = useState(false);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const JOYSTICK_RADIUS = 46;

  useEffect(() => {
    const isTouch =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.("(pointer: coarse)").matches;
    setTouchSupported(Boolean(isTouch));
    if (!isTouch) return;
    document.documentElement.dataset.nduTouch = "1";
    return () => {
      delete document.documentElement.dataset.nduTouch;
    };
  }, []);
  const [sprinting, setSprinting] = useState(false);
  const sprint = (on: boolean) => {
    setSprinting(on);
    window.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { code: "ShiftLeft" }));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch || !joystickBaseRef.current) return;
    activeTouchIdRef.current = touch.identifier;
    setIsActive(true);

    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    setStickPos({ x: stickX, y: stickY });
    setStick(stickX / JOYSTICK_RADIUS, -stickY / JOYSTICK_RADIUS);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null || !joystickBaseRef.current) return;
    let currentTouch: React.Touch | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
        currentTouch = e.changedTouches[i];
        break;
      }
    }
    if (!currentTouch) return;

    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = currentTouch.clientX - centerX;
    const dy = currentTouch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    setStickPos({ x: stickX, y: stickY });
    setStick(stickX / JOYSTICK_RADIUS, -stickY / JOYSTICK_RADIUS);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
        activeTouchIdRef.current = null;
        setIsActive(false);
        setStickPos({ x: 0, y: 0 });
        setStick(0, 0);
        break;
      }
    }
  };

  if (!touchSupported) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden">
      {/* ── Left Virtual Joystick (WASD move on OSM map) ── */}
      <div className="ndu-hud-stick pointer-events-auto touch-none" data-ndu-bubble-hideable="">
        <div
          ref={joystickBaseRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className={`relative h-full w-full rounded-full border-2 transition-colors flex items-center justify-center ${
            isActive
              ? "border-amber-400 bg-slate-950/70 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
              : "border-slate-700/60 bg-slate-950/40 backdrop-blur-sm"
          }`}
        >
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-[1px] bg-slate-700/40 pointer-events-none" />
          <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 w-[1px] bg-slate-700/40 pointer-events-none" />
          <div
            className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300 shadow-lg pointer-events-none flex items-center justify-center transition-transform duration-75"
            style={{
              transform: `translate3d(${stickPos.x}px, ${stickPos.y}px, 0)`,
            }}
          >
            <div className="w-3 h-3 rounded-full bg-slate-950/40" />
          </div>
        </div>
      </div>

      {/* ── Right Action Buttons (Act & Jump) ── */}
      <div className="ndu-hud-actions pointer-events-auto touch-none" data-ndu-bubble-hideable="">
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
            setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE" })), 120);
          }}
          aria-label="Act (interact)"
          className="ndu-hud-act rounded-full bg-cyan-600/90 active:bg-cyan-500 border border-cyan-400 text-slate-950 font-bold text-xs flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer"
        >
          <span className="text-base leading-none">⚡</span>
          <span className="text-[9px] uppercase tracking-wider font-extrabold mt-0.5">Act</span>
        </button>

        <button
          type="button"
          aria-label="Sprint (hold)"
          aria-pressed={sprinting}
          onTouchStart={(e) => {
            e.stopPropagation();
            sprint(true);
          }}
          onTouchEnd={() => sprint(false)}
          onTouchCancel={() => sprint(false)}
          className="ndu-hud-sprint rounded-full bg-slate-900/85 active:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer"
        >
          <span className="text-sm leading-none">▲</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-300 mt-0.5">Sprint</span>
        </button>
      </div>
    </div>
  );
}

type LngLat = { lat: number; lng: number };

type CityMap = MapLibreMap;
type Marker = MapLibreMarker;
type MapLibre = typeof import("maplibre-gl");

/**
 * MapLibre GL JS is a pinned npm dependency (package.json, exact 5.6.1), loaded client-only in its
 * own chunk the first time the 3D map mounts — no third-party CDN on the critical path and never
 * in the server bundle. Its stylesheet ships from the package too.
 */
let mapLibrePromise: Promise<MapLibre> | null = null;
function loadMapLibre(): Promise<MapLibre> {
  // Constant-folded by Vite: the SSR build drops the import below, so the server bundle never carries MapLibre.
  if (import.meta.env.SSR) return Promise.reject(new Error("MapLibre is client-only"));
  mapLibrePromise ??= Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
    .then(([mod]) => ((mod as unknown as { default?: MapLibre }).default ?? mod) as MapLibre)
    .catch((err) => {
      mapLibrePromise = null; // a flaky network must not poison later mounts
      throw err;
    });
  return mapLibrePromise;
}

function sign(text: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  el.style.cssText =
    "background:#1a1511;color:#f6efe2;padding:6px 8px;border-radius:6px;border:0;border-bottom:4px solid #e8843a;font:12px sans-serif;white-space:nowrap;cursor:pointer";
  return el;
}

const FACES = ["/people/man-grey.png", "/people/woman-blue.png", "/people/man-shirt.png", "/people/woman-yellow.png"];

/**
 * Real-world heights in metres. The OSM buildings are fill-extrusions in true metres (`render_height`),
 * so every street sprite is resized each frame from its height in metres, not a fixed pixel size.
 */
const HUMAN_M = 1.75;

function photoSprite(src: string, label: string, meters: number, cover = false) {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
  if (label) {
    const plate = document.createElement("div");
    plate.dataset.plate = "1";
    plate.textContent = label;
    plate.style.cssText =
      "background:#14110e;color:#f6efe2;font:700 11px/1.2 sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:4px;border:2px solid #f0c14a;margin-bottom:2px";
    root.append(plate);
  }
  const img = document.createElement("img");
  img.dataset.head = "1";
  img.alt = "";
  img.draggable = false;
  img.src = src;
  img.dataset.meters = String(meters);
  img.style.cssText = cover
    ? "aspect-ratio:3/5;width:auto;height:24px;display:block;object-fit:cover;border-radius:4px;border:1px solid #f0c14a;background:#2c241c"
    : "height:24px;width:auto;display:block;filter:drop-shadow(0 3px 2px rgba(0,0,0,.4))";
  root.append(img);
  return root;
}

function rideSprite(vehicle: string, face: string, label: string) {
  const root = document.createElement("button");
  root.type = "button";
  root.style.cssText = "border:0;background:transparent;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center";
  const plate = document.createElement("div");
  plate.dataset.plate = "1";
  plate.textContent = label;
  plate.style.cssText = "color:#f6efe2;background:#14110e;font:700 11px/1.2 sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:4px;border:2px solid #f0c14a;margin-bottom:2px";
  const spin = document.createElement("div");
  spin.dataset.spin = "1";
  spin.style.cssText = "display:flex;align-items:flex-end";
  const driver = document.createElement("img");
  driver.alt = "";
  driver.src = face;
  driver.dataset.meters = "1.2";
  driver.style.cssText = "height:24px;width:auto;border-radius:50%;object-fit:cover;border:2px solid #f0c14a";
  const body = document.createElement("img");
  body.alt = "";
  body.src = vehicle === "bus" ? "/people/bus.png" : "/people/keke.png";
  body.dataset.meters = vehicle === "bus" ? "2.9" : "1.8";
  body.style.cssText = "height:24px;width:auto;display:block";
  spin.append(driver, body);
  root.append(plate, spin);
  return root;
}

/** Where the player's figure is standing — shown so a default spot is never mistaken for a real one. */
type Where = "default" | "saved" | "gps" | "moved";

export type TripGoal = { lat: number; lng: number; name: string };

type TripView = { name: string; left: number; total: number; eta: number; source: TripSource };

const plateText = (name: string, where: Where) => (where === "default" ? `${name || "You"} · default spot` : name || "You");

const TRIP_SOURCE_ID = "ndu-trip";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function line(points: Pt[]): GeoJSON.LineString {
  const coords = points.map((p) => [p.lng, p.lat]);
  if (coords.length === 1) coords.push(coords[0]);
  return { type: "LineString", coordinates: coords };
}

function goalPin(text: string) {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
  const plate = document.createElement("div");
  plate.textContent = text;
  plate.style.cssText =
    "background:#1a1511;color:#f6efe2;font:600 11px/1.2 sans-serif;padding:3px 7px;border-radius:6px;border:2px solid #e8843a;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis";
  const stem = document.createElement("div");
  stem.style.cssText = "width:3px;height:18px;background:#1a1511";
  const foot = document.createElement("div");
  foot.style.cssText = "width:12px;height:12px;border-radius:999px;background:#e8843a;border:3px solid #1a1511;margin-top:-2px";
  root.append(plate, stem, foot);
  return root;
}

function youFigure(label: string, photo: string) {
  const own = photo.startsWith("data:image/") || photo.startsWith("https://");
  const root = photoSprite(own ? photo : "/people/man-grey.png", label, HUMAN_M, own);
  // A flat ring at the feet keeps the spot findable when the true-size figure is only a few pixels tall.
  const ring = document.createElement("div");
  ring.style.cssText =
    "position:absolute;left:50%;bottom:-6px;width:22px;height:12px;transform:translateX(-50%);z-index:-1;border-radius:50%;border:3px solid #e8843a;background:rgba(232,132,58,.25)";
  root.style.position = "relative";
  root.append(ring);
  return root;
}

function shopFront(text: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.style.cssText = "border:0;padding:0;background:transparent;cursor:pointer";
  const awning = document.createElement("div");
  awning.style.cssText = "height:8px;background:repeating-linear-gradient(90deg,#e8843a 0 8px,#f6efe2 8px 16px)";
  const name = document.createElement("div");
  name.textContent = text;
  name.style.cssText = "background:#1a1511;color:#f6efe2;font:12px sans-serif;padding:4px 8px";
  el.append(awning, name);
  return el;
}

export function CityBuildings({
  lat,
  lng,
  defaultLabel,
  saved,
  people,
  places,
  name,
  photo,
  onEnter,
  onMeet,
  onTalk,
  onMove,
  goRef,
}: {
  lat: number;
  lng: number;
  /** Human name of the default spot (`lat`/`lng`), used when there's no saved spot and no GPS. */
  defaultLabel: string;
  /** The player's last saved spot (presence / this browser), if any. */
  saved: Pt | null;
  people: Neighbor[];
  places: Place[];
  name: string;
  photo: string;
  // NDU-UPG empty-state: optional building feature + map bearing for the isometric inside view
  onEnter: (spot: { name: string; lat: number; lng: number; feature?: unknown; bearing?: number; kind?: string; placeId?: string }) => void;
  onMeet: (person: Neighbor) => void;
  onTalk?: (id: string) => void;
  /** The player's figure moved (walk, trip, or GPS) — persist it. Never called for the default spot. */
  onMove: (spot: Pt) => void;
  /** Filled with a function that walks the figure to a goal along a route; resolves true on arrival. */
  goRef?: MutableRefObject<((goal: TripGoal) => Promise<boolean>) | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const peopleRef = useRef(people);
  const placesRef = useRef(places);
  const enterRef = useRef(onEnter);
  const meetRef = useRef(onMeet);
  const talkRef = useRef(onTalk);
  const nameRef = useRef(name);
  const photoRef = useRef(photo);
  const markRef = useRef<HTMLDivElement | null>(null);
  const turnRef = useRef<(delta: number) => void>(() => undefined);
  const paintRef = useRef<() => void>(() => undefined);
  const savedRef = useRef(saved);
  const moveRef = useRef(onMove);
  const applySavedRef = useRef<(spot: Pt) => void>(() => undefined);
  const locateRef = useRef<() => void>(() => undefined);
  const stopTripRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<ScanMap | null>(null);
  const [scanReady, setScanReady] = useState(false);
  const [where, setWhere] = useState<Where>("default");
  const whereRef = useRef<Where>("default");
  whereRef.current = where;
  const [trip, setTrip] = useState<TripView | null>(null);
  const [tripNote, setTripNote] = useState("");
  const [doorPrompt, setDoorPrompt] = useState<{ text: string; locked: boolean } | null>(null); // NDU-UPG collide
  savedRef.current = saved;
  moveRef.current = onMove;
  peopleRef.current = people;
  placesRef.current = places;
  enterRef.current = onEnter;
  meetRef.current = onMeet;
  talkRef.current = onTalk;
  nameRef.current = name;
  photoRef.current = photo;

  useEffect(() => {
    const root = markRef.current;
    if (!root) return;
    const plate = root.querySelector("[data-plate]");
    if (plate) plate.textContent = plateText(name, where);
    const head = root.querySelector("[data-head]") as HTMLImageElement | null;
    if (!head) return;
    const own = photo.startsWith("data:image/") || photo.startsWith("https://");
    head.src = own ? photo : "/people/man-grey.png";
    head.style.objectFit = own ? "cover" : "contain";
  }, [name, photo, where]);

  useEffect(() => bindInput(window), []);

  useEffect(() => {
    paintRef.current();
    setAssistantPlaces(places); // NDU-AI assistant
  }, [people, places]);

  useEffect(() => {
    if (saved) applySavedRef.current(saved);
  }, [saved]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let map: CityMap | null = null;
    let frame = 0;
    let detachTurn: () => void = () => undefined;
    let stopFollow: () => void = () => undefined; // NDU-UPG follow
    let stopFp: () => void = () => undefined; // NDU-FP
    let detachPerf: () => void = () => undefined; // NDU-UPG 503
    let stopScanGate: () => void = () => undefined; // NDU-UPG 504
    let stopRealism: () => void = () => undefined; // NDU-UPG 5 51
    let stopLife: () => void = () => undefined; // NDU-UPG life
    let stopProps: () => void = () => undefined; // NDU-UPG props
    let stopImmerse: () => void = () => undefined; // NDU-UPG immerse
    // NDU-UPG inspect (#04): long-press / right-click / i to inspect (own chunk; off unless the flag is on)
    let stopInspect: () => void = () => undefined;
    let inspectRt: import("@/world/inspect/runtime").InspectRuntime | null = null;
    let inspectMod: typeof import("@/world/inspect/runtime") | null = null;
    let stopAssistant: () => void = () => undefined; // NDU-AI assistant
    let collide: CollideHandle | null = null; // NDU-UPG collide
    let stopExited: () => void = () => undefined; // NDU-UPG collide
    const you = { lat, lng };
    const markers: { remove: () => void }[] = [];
    void loadMapLibre()
      .then((ml) => {
        if (dead) return;
        map = new ml.Map({
          ...tierMapOptions(), // NDU-UPG 502/507: pixel ratio + tile cache by tier (Tier A = MapLibre defaults)
          container: el,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [lng, lat],
          zoom: 17.6,
          pitch: 58,
          maxPitch: 85,
          maxZoom: 22,
          bearing: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          touchZoomRotate: true,
          attributionControl: { compact: true },
        });
        if (document.documentElement.dataset.nduTouch === "1") {
          map.once("load", () => {
            host.current?.querySelectorAll(".maplibregl-ctrl-attrib.maplibregl-compact-show").forEach((el) => {
              el.classList.remove("maplibregl-compact-show");
              el.removeAttribute("open");
            });
          });
        }
        // Sprites sized in metres: each frame, px-per-metre is measured at the sprite's own spot, so the
        // figure keeps human scale next to the extruded buildings at any zoom, pitch or screen depth.
        const sized: { marker: Marker; img: HTMLElement; px: number }[] = [];
        const track = (marker: Marker) => {
          const img = marker.getElement().querySelector<HTMLElement>("[data-meters]");
          if (img) sized.push({ marker, img, px: 0 });
          return marker;
        };
        const mark = youFigure(nameRef.current || "You", photoRef.current);
        markRef.current = mark;
        const plate = mark.querySelector("[data-plate]");
        if (plate) plate.textContent = plateText(nameRef.current, whereRef.current);
        const player = track(new ml.Marker({ element: mark, anchor: "bottom", ...(groundOn() ? { opacityWhenCovered: "0.85" } : {}) }).setLngLat([lng, lat]).addTo(map));
        let net: Net | null = null;
        let pose: Pose | null = null;
        let viewing = false;
        const gestureStart = (event: { originalEvent?: Event }) => {
          if (event.originalEvent) viewing = true;
        };
        const gestureEnd = () => {
          viewing = false;
        };
        map.on("dragstart", gestureStart);
        map.on("rotatestart", gestureStart);
        map.on("pitchstart", gestureStart);
        map.on("zoomstart", gestureStart);
        map.on("dragend", gestureEnd);
        map.on("rotateend", gestureEnd);
        map.on("pitchend", gestureEnd);
        map.on("zoomend", gestureEnd);
        let roadsTicket = 0;
        let movedByUser = false;
        let whereNow: Where = "default";
        const markWhere = (next: Where) => {
          if (whereNow === next) return;
          whereNow = next;
          setWhere(next);
        };
        // The figure is ALWAYS shown at a real coordinate: the old code kept it hidden until the
        // OSM road network loaded and snapped, so a failed/empty Overpass answer meant no avatar.
        const placeRaw = (spot: Pt) => {
          you.lat = spot.lat;
          you.lng = spot.lng;
          player.setLngLat([spot.lng, spot.lat]);
          mark.style.visibility = "visible";
          lifePlayer(spot); // NDU-UPG life 219: vehicles brake for the figure
          onPlayerSpot(spot); // NDU realism 02: no-op without the ground flag
        };
        const placeYou = (next: Pose) => {
          if (!net) return;
          pose = next;
          placeRaw(posePoint(net, next));
        };
        let lastReport = 0;
        const report = (force = false) => {
          const now = performance.now();
          if (!force && now - lastReport < 4000) return;
          lastReport = now;
          moveRef.current({ lat: you.lat, lng: you.lng });
        };
        const actors: { pose: Pose; speed: number; marker: { setLngLat: (pos: [number, number]) => void; remove: () => void }; plate?: HTMLElement; spin?: HTMLElement; botId?: string }[] = [];
        const clearActors = () => {
          actors.forEach((actor) => actor.marker.remove());
          actors.length = 0;
        };
        const spawnStreet = () => {
          clearActors();
          if (!net || !map) return;
          const roster = streetRoster([ // NDU-UPG life 204: Tier A/B draw walkers + vehicles in 3D
            { count: 8, speed: 1.2, label: "", meters: HUMAN_M, srcs: FACES },
            { count: 3, speed: 0.35, label: "Hawker", meters: 1.9, srcs: ["/people/hawker.png"] },
            { count: 4, speed: 6.5, label: "Keke", meters: 1.8, srcs: ["/people/keke.png"] },
            { count: 2, speed: 4.5, label: "Bus", meters: 2.9, srcs: ["/people/bus.png"] },
            { count: 5, speed: 8, label: "", meters: 1.5, srcs: ["/people/car.png"] },
          ]);
          for (const kind of roster) {
            for (let n = 0; n < kind.count; n += 1) {
              const seg = Math.floor(Math.random() * net.seg.length);
              const pose: Pose = { seg, t: Math.random(), dir: Math.random() > 0.5 ? 1 : -1 };
              const spot = posePoint(net, pose);
              const marker = track(
                new ml.Marker({
                  element: photoSprite(kind.srcs[n % kind.srcs.length], kind.label, kind.meters),
                  anchor: "bottom",
                })
                  .setLngLat([spot.lng, spot.lat])
                  .addTo(map),
              );
              actors.push({ pose, speed: kind.speed, marker });
            }
          }
          for (const bot of getBots()) {
            const seg = Math.floor(Math.random() * net.seg.length);
            const botPose: Pose = { seg, t: Math.random(), dir: 1 };
            const spot = posePoint(net, botPose);
            const body = bot.vehicle ? rideSprite(bot.vehicle, bot.face, bot.name) : photoSprite(bot.face, bot.name, HUMAN_M, true);
            body.style.pointerEvents = "auto";
            body.onclick = (event) => {
              event.stopPropagation();
              talkRef.current?.(bot.id);
            };
            const marker = track(
              new ml.Marker({ element: body, anchor: "bottom" }).setLngLat([spot.lng, spot.lat]).addTo(map),
            );
            const plate = body.querySelector("[data-plate]");
            const spin = body.querySelector("[data-spin]");
            actors.push({
              pose: botPose,
              speed: bot.vehicle === "bus" ? 4.5 : bot.vehicle === "keke" ? 6.5 : 1.4,
              marker,
              plate: plate instanceof HTMLElement ? plate : undefined,
              spin: spin instanceof HTMLElement ? spin : undefined,
              botId: bot.id,
            });
          }
        };
        const loadRoads = (at: { lat: number; lng: number }) => {
          const ticket = ++roadsTicket;
          const apply = (built: Net | null) => {
            if (!built || dead || ticket !== roadsTicket) return false;
            net = built;
            publishRoadNet(built); // NDU-UPG collide
            pose = !tripRun ? snapPose(built, you.lat, you.lng, 160) : null;
            if (pose) placeYou(pose);
            spawnStreet();
            fit();
            return true;
          };
          const cached = readWard(at.lat, at.lng);
          if (cached?.length) apply(buildWays(cached));
          void openWays({ data: at })
            .catch(() => [])
            .then((ways) => {
              if (dead || ticket !== roadsTicket) return;
              if (ways.length) {
                writeWard(at.lat, at.lng, ways);
                if (apply(buildWays(ways))) return;
              }
              if (!net && cached?.length) apply(buildWays(cached));
            });
        };
        const relocate = (spot: Pt, why: Where) => {
          if (!map) return;
          stopTrip(false);
          pose = null;
          const ej = collide?.eject(spot); // NDU-UPG collide: a saved/GPS spot inside a footprint steps out
          placeRaw(ej ? ej.ll : spot);
          if (ej) setTripNote(ej.note); // NDU-UPG collide
          if (!streetNow()) map.jumpTo({ center: [spot.lng, spot.lat], zoom: 17.2, pitch: 62 }); // NDU-UPG follow: street level on the avatar
          markWhere(why);
          loadRoads(spot);
        };
        applySavedRef.current = (spot: Pt) => {
          if (movedByUser || whereNow === "saved" || tripRun) return;
          relocate(spot, "saved");
        };
        const locate = (asked: boolean) => {
          if (!navigator.geolocation) {
            if (asked) setTripNote("This browser has no location service.");
            return;
          }
          if (asked) setTripNote("Finding you…");
          navigator.geolocation.getCurrentPosition(
            (fix) => {
              if (dead) return;
              if (!asked && (movedByUser || whereNow === "saved")) return;
              const spot = { lat: fix.coords.latitude, lng: fix.coords.longitude };
              relocate(spot, "gps");
              movedByUser = asked || movedByUser;
              setTripNote("");
              report(true);
            },
            () => {
              if (asked) setTripNote("Location is blocked. Allow it for this site to use your real spot.");
            },
            { enableHighAccuracy: true, timeout: 8000 },
          );
        };
        locateRef.current = () => locate(true);
        const paintBoards = () => {
          markers.forEach((item) => item.remove());
          markers.length = 0;
          if (!map) return;
          for (const place of placesRef.current.slice(0, 20)) {
            const board = shopFront(place.source === "google" ? `Google · ${place.name}` : place.name);
            board.onclick = (event) => {
              event.stopPropagation();
              // NDU-UPG empty-state: hand over the building under the pin (if any) + bearing
              let feature: unknown;
              try {
                feature = map?.queryRenderedFeatures(map.project([place.lng, place.lat]), { layers: ["building-3d", "building"] })[0];
              } catch {
                feature = undefined;
              }
              enterRef.current({ name: place.name, lat: place.lat, lng: place.lng, feature, bearing: map?.getBearing(), kind: place.kind, placeId: place.id });
            };
            // NDU-UPG inspect (#04): long-press a place board for its card (a normal tap still enters)
            inspectMod?.attachMarkerInspect(board, { kind: "place", placeId: place.id, name: place.name, category: place.kind, lngLat: [place.lng, place.lat] });
            markers.push(new ml.Marker({ element: board, anchor: "bottom" }).setLngLat([place.lng, place.lat]).addTo(map));
          }
          for (const person of peopleRef.current.slice(0, 20)) {
            const dot = photoSprite(person.avatar || FACES[person.displayName.length % FACES.length], person.displayName, HUMAN_M, Boolean(person.avatar));
            dot.style.pointerEvents = "auto";
            dot.onclick = (event) => {
              event.stopPropagation();
              meetRef.current(person);
            };
            dot.title = person.displayName;
            markers.push(track(new ml.Marker({ element: dot, anchor: "bottom", ...(groundOn() ? { opacityWhenCovered: "0.5" } : {}) }).setLngLat([person.lng, person.lat]).addTo(map)));
          }
        };
        // ── trips: route line + figure moving along it, Uber-style ──────────────
        let tripRun: {
          points: Pt[];
          cum: number[];
          total: number;
          speed: number;
          d: number;
          name: string;
          source: TripSource;
          pin: { remove: () => void };
          lastUi: number;
          resolve: (arrived: boolean) => void;
        } | null = null;
        let tripTicket = 0;
        const drawTrip = () => {
          const source = map?.getSource<GeoJSONSource>(TRIP_SOURCE_ID);
          if (!source) return;
          if (!tripRun) {
            source.setData(EMPTY);
            return;
          }
          const { done, left } = splitAt(tripRun.points, tripRun.cum, tripRun.d);
          const origin = tripRun.points[0];
          source.setData({
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: { part: "done" }, geometry: line(done) },
              { type: "Feature", properties: { part: "left" }, geometry: line(left) },
              { type: "Feature", properties: { part: "origin" }, geometry: { type: "Point", coordinates: [origin.lng, origin.lat] } },
            ],
          });
        };
        const showTrip = () => {
          if (!tripRun) return;
          setTrip({
            name: tripRun.name,
            left: tripRun.total - tripRun.d,
            total: tripRun.total,
            eta: (tripRun.total - tripRun.d) / tripRun.speed,
            source: tripRun.source,
          });
        };
        // Hail-replace sets this so stopTrip does not drop the new ride back to third.
        // Stick-cancel, arrival, and Stop leave it false and still return to third.
        let keepRideCam = false;
        const stopTrip = (arrived: boolean) => {
          tripTicket += 1;
          const run = tripRun;
          const keeping = keepRideCam;
          keepRideCam = false;
          if (!run) return;
          tripRun = null;
          run.pin.remove();
          drawTrip();
          setTrip(null);
          pose = net ? snapPose(net, you.lat, you.lng, 25) : null;
          if (pose && !collide?.ready) placeYou(pose); // NDU-UPG collide: off-rail, stay at the door approach
          setTripNote(arrived ? `Arrived at ${run.name}.` : "Stopped. You are where the line ended.");
          if (rideCam && !keeping) {
            rideCam = false;
            fpLazy?.posture("stand"); // NDU-FP
            setPerson("third");
          }
          report(true);
          run.resolve(arrived);
        };
        stopTripRef.current = () => stopTrip(false);
        const startTrip = async (goal: TripGoal): Promise<boolean> => {
          if (!map) return false;
          stopTrip(false);
          const ticket = ++tripTicket;
          setTripNote("Finding the way…");
          const plan = await planTrip(net, { lat: you.lat, lng: you.lng }, goal);
          if (dead || !map || ticket !== tripTicket) return false;
          if (plan.source === "line" && collide?.ready) {
            const around = collide.detour({ lat: you.lat, lng: you.lng }, goal); // NDU-UPG collide: A* around buildings
            if (around) plan.points = around;
          }
          movedByUser = true;
          markWhere("moved");
          setTripNote("");
          const cum = cumulative(plan.points);
          const total = cum[cum.length - 1] ?? 0;
          if (total < 3) {
            placeRaw(goal);
            report(true);
            return true;
          }
          // Game time: ~14 m/s, but every trip takes 4–30 s so short hops and long drives both read well.
          const seconds = Math.max(4, Math.min(30, total / 14));
          const pin = new ml.Marker({ element: goalPin(goal.name), anchor: "bottom" }).setLngLat([goal.lng, goal.lat]).addTo(map);
          let lngMin = Infinity;
          let lngMax = -Infinity;
          let latMin = Infinity;
          let latMax = -Infinity;
          for (const p of plan.points) {
            lngMin = Math.min(lngMin, p.lng);
            lngMax = Math.max(lngMax, p.lng);
            latMin = Math.min(latMin, p.lat);
            latMax = Math.max(latMax, p.lat);
          }
          try {
            map.fitBounds(
              [
                [lngMin, latMin],
                [lngMax, latMax],
              ],
              { padding: 90, maxZoom: 18, duration: 700 },
            );
          } catch {
            // a viewport too small for the padding just keeps the current camera
          }
          return new Promise<boolean>((resolve) => {
            tripRun = { points: plan.points, cum, total, speed: total / seconds, d: 0, name: goal.name, source: plan.source, pin, lastUi: 0, resolve };
            drawTrip();
            showTrip();
          });
        };
        if (goRef) goRef.current = startTrip;
        if (map) registerSearchMap(map, ml.Marker, startTrip); // NDU-AI search: results fly the camera / walk there
        const fit = () => {
          if (!map) return;
          // A vertical metre on screen is a sideways metre at the same depth times sin(pitch); a floor
          // keeps a top-down view from flattening the figures to nothing.
          const tilt = Math.max(0.35, Math.sin((map.getPitch() * Math.PI) / 180));
          const side = ((map.getBearing() + 90) * Math.PI) / 180;
          for (let i = sized.length - 1; i >= 0; i -= 1) {
            const item = sized[i];
            if (!item.img.isConnected) {
              sized.splice(i, 1);
              continue;
            }
            const at = item.marker.getLngLat();
            const a = map.project([at.lng, at.lat]);
            const b = map.project([
              at.lng + (2 * Math.sin(side)) / (111320 * (Math.cos((at.lat * Math.PI) / 180) || 1)),
              at.lat + (2 * Math.cos(side)) / 111320,
            ]);
            const perMeter = Math.hypot(b.x - a.x, b.y - a.y) / 2;
            const px = Math.max(2, Math.min(900, Math.round(Number(item.img.dataset.meters) * perMeter * tilt)));
            if (px !== item.px) {
              item.px = px;
              item.img.style.height = `${px}px`;
            }
          }
        };
        map.on("zoom", fit);
        map.on("load", () => {
          addSatelliteBasemap(map as never);
          fit();
          paintRef.current = paintBoards;
          paintBoards();
          try {
            const m = map;
            if (!m) return;
            m.addSource(TRIP_SOURCE_ID, { type: "geojson", data: EMPTY });
            const round = { "line-cap": "round", "line-join": "round" } as const;
            m.addLayer({ id: "ndu-trip-done", type: "line", source: TRIP_SOURCE_ID, filter: ["==", ["get", "part"], "done"], layout: round, paint: { "line-color": "#8a8178", "line-width": 4, "line-opacity": 0.75, "line-dasharray": [1, 1.6] } });
            m.addLayer({ id: "ndu-trip-casing", type: "line", source: TRIP_SOURCE_ID, filter: ["==", ["get", "part"], "left"], layout: round, paint: { "line-color": "#1a1511", "line-width": 9 } });
            m.addLayer({ id: "ndu-trip-left", type: "line", source: TRIP_SOURCE_ID, filter: ["==", ["get", "part"], "left"], layout: round, paint: { "line-color": "#e8843a", "line-width": 5 } });
            m.addLayer({ id: "ndu-trip-origin", type: "circle", source: TRIP_SOURCE_ID, filter: ["==", ["get", "part"], "origin"], paint: { "circle-radius": 6, "circle-color": "#f6efe2", "circle-stroke-color": "#1a1511", "circle-stroke-width": 3 } });
            drawTrip();
          } catch {
            // no route layer: the figure still moves, just without the drawn line
          }
          // NDU-UPG 502/503: tiers + degrade ladder on the live map (also marks first map paint).
          if (map) detachPerf = attachMapPerf(map as unknown as PerfMap);
          // Imported scans: three.js loads only now, in its own chunk.
          // NDU-UPG 504: ...and only once a placed scan is near the view or the player opens Scans.
          const mountScanLayer = () =>
          void import("@/world/scanLayer")
            .then(({ mountScans }) => {
              if (dead || !map) return;
              scanRef.current = mountScans(map, ml);
              setScanReady(true);
            })
            .catch(() => undefined); // no scan layer: the rest of the map is unaffected
          if (map) stopScanGate = gateScans(map as unknown as Parameters<typeof gateScans>[0], mountScanLayer); // NDU-UPG 504
          // NDU-UPG 5 6 51: real sun, sky and tag-accurate building heights (own chunk, never blocks the map)
          void import("@/world/realism")
            .then(({ mountRealism }) => {
              if (!dead && map) stopRealism = mountRealism(map);
            })
            .catch(() => undefined);
          // NDU-UPG life: street life + true-scale roads (own chunk; three.js only on Tier A/B)
          void import("@/world/life")
            .then(({ mountLife }) => {
              if (!dead && map) stopLife = mountLife(map as unknown as Parameters<typeof mountLife>[0]);
            })
            .catch(() => undefined);
          // NDU-UPG inspect (#04): own chunk, only when the flag is on (?inspect=1, dev, or VITE_NDU_INSPECT=on)
          if (inspectAllowed())
            void import("@/world/inspect/runtime")
              .then((mod) => {
                if (dead || !map) return;
                inspectMod = mod;
                stopInspect = mod.mountInspect(map as unknown as Parameters<typeof mod.mountInspect>[0], { scans: () => scanRef.current, enter: (spot) => enterRef.current(spot) });
                inspectRt = mod.inspectRuntime();
                paintRef.current?.();
              })
              .catch(() => undefined);
          // NDU-UPG props: real-size OSM street furniture (own chunk; off unless VITE_NDU_PROPS / ?props=1)
          if (propsAllowed())
            void import("@/world/props")
              .then(({ mountProps }) => {
                if (!dead && map) stopProps = mountProps(map as unknown as Parameters<typeof mountProps>[0]);
              })
              .catch(() => undefined);
          // NDU-UPG collide: avatar collision + real doors (own chunk; flag off = never fetched)
          if (collideOn())
            void import("@/world/collide")
              .then(({ mountCollide }) => {
                if (dead || !map) return;
                collide = mountCollide(map, {
                  getYou: () => ({ lat: you.lat, lng: you.lng }),
                  road: () => (net ? { distance: (la, ln) => roadDistance(net as Net, la, ln), snap: (la, ln) => { const p = snapPose(net as Net, la, ln, 60); return p ? posePoint(net as Net, p) : null; } } : null),
                  tierC: document.documentElement.dataset.nduTier === "C",
                });
                stopExited = onExited((door) => {
                  const out = collide?.exitSpot(door);
                  if (out) placeRaw(out);
                });
              })
              .catch(() => undefined);
          if (map) stopAssistant = registerAssistantMap(map, () => ({ lat: you.lat, lng: you.lng })); // NDU-AI assistant
          // NDU-UPG immerse: live weather, terrain, water, sky + sound (own chunk; ?immerse=0 turns it off)
          if (immerseAllowed())
            void import("@/world/immerse")
              .then(({ mountImmerse }) => {
                if (!dead && map) stopImmerse = mountImmerse(map);
              })
              .catch(() => undefined);
        });
        map.on("click", (event) => {
          if (!map) return;
          if (inspectRt?.swallowClick()) return; // NDU-UPG inspect (#04): the long-press already took this tap
          const scans = scanRef.current;
          if (scans?.isPlacing()) {
            // Placing a scan takes the tap. On a building (NDU-8) it snaps to that building's footprint
            // centre — a coarse, building-level anchor; works without any GPS fix.
            let footprint: GeoJSON.Geometry | null = null;
            try {
              footprint = map.queryRenderedFeatures(event.point, { layers: ["building-3d", "building"] })[0]?.geometry ?? null;
            } catch {
              footprint = null;
            }
            scans.tap(event.lngLat, footprint);
            return;
          }
          if (lifeTap(event.point)) return; // NDU-UPG life: a walker/vehicle bubble card takes the tap
          const spot = { lat: event.lngLat.lat, lng: event.lngLat.lng, name: "the spot you tapped" };
          if (net && roadDistance(net, spot.lat, spot.lng) < 18) {
            void startTrip(spot);
            return;
          }
          try {
            const hits = map.queryRenderedFeatures(event.point, { layers: tappableBuildingLayers(map) }); // NDU-UPG 51
            if (hits.length) {
              if (inspectRt && inspectTapFirst()) {
                inspectRt.openBuilding(hits[0], event); // NDU-UPG inspect (#04): tap-first mode
                return;
              }
              const props = hits[0]?.properties ?? {};
              if (collide?.ready) {
                // NDU-UPG collide: walk to the building's door, enter on arrival
                const tileId = typeof hits[0]?.id === "number" ? Math.floor((hits[0].id as number) / 10) : null;
                const osm = Number.isSafeInteger(Number(props.osm)) ? Number(props.osm) : tileId;
                const target = collide.walkTarget({ osm, at: { lat: event.lngLat.lat, lng: event.lngLat.lng } }, { lat: you.lat, lng: you.lng });
                if (target?.goal) {
                  const c = collide;
                  void startTrip({ ...target.goal, name: target.name }).then((arrived) => {
                    if (arrived) c.armDoor(target.doorId);
                  });
                  return;
                }
              }
              enterRef.current({
                name: props.name || props["name:en"] || inspectLine(props as Record<string, unknown>) || "This building",
                lat: event.lngLat.lat,
                lng: event.lngLat.lng,
                feature: hits[0], // NDU-UPG empty-state: footprint + heights for the isometric shell
                bearing: map.getBearing(),
              });
              return;
            }
          } catch {
            // fall through
          }
          // No road network loaded (Overpass down): any open-ground tap still starts a trip.
          if (!net) void startTrip(spot);
        });
        const pastCrowd = (spot: Pt): { at: Pt; clear: boolean } => {
          const cos = Math.cos((you.lat * Math.PI) / 180) || 1;
          const metres = (p: Pt) => ({
            x: (p.lng - you.lng) * 111320 * cos,
            y: (p.lat - you.lat) * 111320,
          });
          const roads = net;
          const circles = roads
            ? actors.map((actor) => {
                const there = posePoint(roads, actor.pose);
                const m = metres(there);
                return { x: m.x, y: m.y, r: actor.speed >= 4 ? 2.4 : 0.9 };
              })
            : [];
          for (const body of lifeBodies()) {
            const m = metres(body);
            circles.push({ x: m.x, y: m.y, r: body.r });
          }
          const goal = metres(spot);
          const slid = slideMeters({ x: 0, y: 0 }, goal, circles, 0.45);
          return {
            at: { lat: you.lat + slid.y / 111320, lng: you.lng + slid.x / (111320 * cos) },
            clear: Math.hypot(slid.x - goal.x, slid.y - goal.y) < 0.05,
          };
        };
        const wallAt = (spot: Pt) => {
          if (!map) return false;
          try {
            const hits = map.queryRenderedFeatures(map.project([spot.lng, spot.lat]), { layers: tappableBuildingLayers(map) });
            if (doorWithin(spot.lng, spot.lat)) return false;
            return hits.some((hit) => blocksBuilding((hit.properties ?? {}) as Record<string, unknown>));
          } catch {
            return false;
          }
        };
        let last = performance.now();
        let walking = false;
        let rideCam = false;
        let stepClock = 0;
        const tickSteps = (dt: number, kind: string) => {
          if (rideCam || getPerson() !== "first") return;
          stepClock += dt;
          if (stepClock < 0.4) return;
          stepClock = 0;
          playFootstep(stepSurface(kind));
        };
        let stillFor = 0;
        const step = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          frame = requestAnimationFrame(step);
          if (!map) return;
          fit();
          if (net) {
            const hailed = takeRide();
            if (hailed) {
              rideCam = true;
              fpLazy?.posture("seat-keke"); // NDU-FP: transit rides are keke/bus seats
              setPerson("first");
              keepRideCam = tripRun != null;
              void startTrip({ lat: hailed.lat, lng: hailed.lng, name: "Next stop" });
            }
            robotTick(dt);
            for (const actor of actors) {
              const bot = actor.botId ? getBots().find((item) => item.id === actor.botId) : undefined;
              let speed = bot?.phase === "charge" ? 0 : actor.speed;
              if (speed >= 4) {
                const here = posePoint(net, actor.pose);
                const bearing = (poseBearing(net, actor.pose) * Math.PI) / 180;
                for (const other of actors) {
                  if (other === actor || other.speed < 4) continue;
                  const there = posePoint(net, other.pose);
                  const north = (there.lat - here.lat) * 111320;
                  const east = (there.lng - here.lng) * 111320 * Math.cos((here.lat * Math.PI) / 180);
                  const front = north * Math.cos(bearing) + east * Math.sin(bearing);
                  if (front > 0 && Math.hypot(north, east) < 16) {
                    const mine = bot?.vehicle;
                    const theirs = other.botId ? getBots().find((item) => item.id === other.botId)?.vehicle : undefined;
                    if (mine && theirs) {
                      if (yieldTo(mine, theirs) === mine) speed = 0;
                    } else speed = 0;
                  }
                }
              }
              actor.pose = cruise(net, actor.pose, speed * dt);
              const spot = posePoint(net, actor.pose);
              actor.marker.setLngLat([spot.lng, spot.lat]);
              if (actor.spin) actor.spin.style.transform = `rotate(${poseBearing(net, actor.pose) - map.getBearing()}deg)`;
              if (bot?.vehicle && bot.phase === "work" && getYard().power >= 10) bot.nextStop = aheadPoint(net, actor.pose, bot.vehicle === "bus" ? 160 : 90);
              else if (bot?.vehicle) bot.nextStop = undefined;
              if (actor.plate && bot) actor.plate.textContent = bot.phase === "charge" ? `${bot.name} charge` : bot.vehicle ? `${bot.name} · next` : bot.name;
            }
            if (fpLazy?.active()) {
              // NDU-FP: nearby vehicles for spatial hums (the controller throttles to 20 Hz)
              const list: { id: string; lng: number; lat: number; kind: "car" | "keke" | "bus" }[] = [];
              const n = net;
              actors.forEach((actor, i) => {
                if (actor.speed < 4) return;
                const bot = actor.botId ? getBots().find((item) => item.id === actor.botId) : undefined;
                const spot = posePoint(n, actor.pose);
                list.push({ id: actor.botId ?? `a${i}`, lng: spot.lng, lat: spot.lat, kind: bot?.vehicle === "bus" ? "bus" : bot?.vehicle === "keke" ? "keke" : "car" });
              });
              fpLazy.feedActors(list);
            }
          }
          const tag = document.activeElement?.tagName;
          const typing = tag === "INPUT" || tag === "TEXTAREA";
          const fpOn = Boolean(fpLazy?.active()); // NDU-FP
          const move = typing ? { x: 0, y: 0 } : fpOn ? readMoveFp() : readMove();
          if (tripRun && (move.x || move.y)) {
            stopTrip(false); // taking the stick cancels the trip
            collide?.armDoor(null); // NDU-UPG collide
          }
          if (tripRun) {
            const nextD = Math.min(tripRun.total, tripRun.d + tripRun.speed * dt);
            const stepAt = splitAt(tripRun.points, tripRun.cum, nextD).at;
            if (pastCrowd(stepAt).clear) {
              tripRun.d = nextD;
              placeRaw(stepAt);
              tickSteps(dt, net && pose ? wayLabel(net, pose).kind : "asphalt");
            }
            const arrived = tripRun.d >= tripRun.total;
            if (arrived || now - tripRun.lastUi > 120) {
              tripRun.lastUi = now;
              drawTrip();
              showTrip();
            }
            if (arrived) stopTrip(true);
            return;
          }
          if (collide?.ready) {
            // NDU-UPG collide: door trigger (KeyE / Act, or walking into the door)
            const look0 = (map.getBearing() * Math.PI) / 180;
            const vel = { x: move.y * Math.sin(look0) + move.x * Math.cos(look0), y: move.y * Math.cos(look0) - move.x * Math.sin(look0) };
            const t = collide.trigger({ you: { lat: you.lat, lng: you.lng }, vel, stickHeld: Boolean(move.x || move.y), eHeld: isKeyHeld("KeyE"), typing, dt });
            if (t.prompt.changed) setDoorPrompt(t.prompt.text ? { text: t.prompt.text, locked: t.prompt.locked } : null);
            const into = t.enter ?? t.peek;
            if (into) {
              if (t.enter) noteEnteredDoor(t.door);
              setDoorPrompt(null);
              enterRef.current(into as Parameters<typeof enterRef.current>[0]);
            }
          }
          if (!move.x && !move.y) {
            stepClock = 0;
            if (fpOn) fpLazy?.stepMetres(dt, "", move); // NDU-FP: let the gait slow down
            if (walking) {
              walking = false;
              report(true);
            }
            stillFor += dt;
            if (stillFor > 0.6) {
              stillFor = 0;
              window.dispatchEvent(new CustomEvent("ndu-stand", { detail: { lat: you.lat, lng: you.lng } }));
            }
            return;
          }
          stillFor = 0;
          const look = (map.getBearing() * Math.PI) / 180;
          const north = move.y * Math.cos(look) - move.x * Math.sin(look);
          const east = move.y * Math.sin(look) + move.x * Math.cos(look);
          walking = true;
          movedByUser = true;
          markWhere("moved");
          if (collide?.ready) {
            // NDU-UPG collide: free walk with collide-and-slide; the road net only guides (magnetism)
            const kind = net && pose ? wayLabel(net, pose).kind : "";
            let e = east;
            let n = north;
            if (net && pose && collide.nearestDoorDist(you) > 6) {
              const b = (poseBearing(net, pose) * Math.PI) / 180;
              const d = roadDistance(net, you.lat, you.lng);
              const m = magnetiseLite(e, n, { x: Math.sin(b), y: Math.cos(b) }, d);
              e = m.east;
              n = m.north;
            }
            placeRaw(collide.move(you, e, n, 16 * dt * (kind ? pace(kind) : 1)));
            pose = net ? snapPose(net, you.lat, you.lng, 6) : null;
            if (!viewing && !followAttached()) map.jumpTo({ center: [you.lng, you.lat] });
          } else if (net && pose) {
            const kind = wayLabel(net, pose).kind;
            const metres = fpOn && fpLazy ? fpLazy.stepMetres(dt, kind, move) : 16 * dt * pace(kind) * (readRun() ? 1.8 : 1); // NDU-FP: real walking speed in first person
            const next = walkPose(net, pose, east, north, metres);
            if (pastCrowd(posePoint(net, next)).clear) {
              placeYou(next);
              tickSteps(dt, kind);
              if (!viewing && !followAttached()) map.jumpTo({ center: [you.lng, you.lat] }); // NDU-UPG follow: the follow camera owns the view when attached
            }
          } else {
            // Off the loaded paths: walk the open ground, but not through a wall or a person.
            const meters = fpOn && fpLazy ? fpLazy.stepMetres(dt, "", move) : 16 * dt * (readRun() ? 1.8 : 1); // NDU-FP
            const raw = {
              lat: you.lat + (north * meters) / 111320,
              lng: you.lng + (east * meters) / (111320 * (Math.cos((you.lat * Math.PI) / 180) || 1)),
            };
            const held = pastCrowd(raw);
            if (held.clear && !wallAt(held.at)) {
              placeRaw(held.at);
              tickSteps(dt, "asphalt");
            }
          }
          report();
        };
        const turnRefLocal = (delta: number) => {
          if (!map) return;
          map.jumpTo({ bearing: map.getBearing() + delta });
        };
        turnRef.current = turnRefLocal;
        if (map) detachTurn = attachDragTurn(el, map); // sideways drag turns, like the Turn buttons
        if (map) stopFollow = attachFollow(map, ml.Marker, player); // NDU-UPG follow: nav-style camera on the avatar
        if (map && fpAllowed()) {
          // NDU-FP: first person, behind VITE_NDU_FP / ?fp=1 (never fetched otherwise)
          void import("@/world/fp/controller").then((mod) => {
            if (dead || !map) return;
            const h = mod.attachFirstPerson(map, player, ml);
            fpLazy = h;
            stopFp = () => {
              h.dispose();
              if (fpLazy === h) fpLazy = null;
            };
          });
        }
        frame = requestAnimationFrame(step);
        // Start where we best know: last saved spot, else the default spot (until GPS answers).
        const first = savedRef.current;
        if (first) relocate(first, "saved");
        else {
          placeRaw(you);
          markWhere("default");
          loadRoads(you);
          locate(false);
        }
      })
      .catch(() => setTripNote("The 3D map did not load. Check the connection and reload."));
    const unlockSteps = () => {
      if (getPerson() === "first") unlockStreetSteps();
    };
    window.addEventListener("pointerdown", unlockSteps);
    window.addEventListener("keydown", unlockSteps);
    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", unlockSteps);
      window.removeEventListener("keydown", unlockSteps);
      detachTurn();
      stopFp(); // NDU-FP (before follow, so it restores the camera first)
      stopFollow(); // NDU-UPG follow
      detachPerf(); // NDU-UPG 503
      stopScanGate(); // NDU-UPG 504
      stopRealism(); // NDU-UPG 5 51
      stopLife(); // NDU-UPG life
      stopProps(); // NDU-UPG props
      stopImmerse(); // NDU-UPG immerse
      stopInspect(); // NDU-UPG inspect (#04)
      inspectRt = null;
      inspectMod = null;
      stopExited(); // NDU-UPG collide
      collide?.dispose(); // NDU-UPG collide
      stopAssistant(); // NDU-AI assistant
      if (goRef) goRef.current = null;
      registerSearchMap(null); // NDU-AI search
      scanRef.current = null;
      setScanReady(false);
      map?.remove();
    };
    // goRef is a stable ref object; the map is built once per default spot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div className="absolute inset-0 z-[450] bg-bg">
      <div ref={host} className="h-full w-full" />
      <div data-ndu-overlay="tools" className="absolute top-20 left-3 z-10 flex flex-col gap-2">
        {/* NDU-UPG bubbles: Turn left/right + the rest of this column fold into one tools bubble */}
        <ToolCluster onTurn={(deg) => turnRef.current(deg)} alert={where === "default" || Boolean(tripNote)}>
        <ScanDesk ready={scanReady} mapRef={scanRef} />
        <TimeDial /> {/* NDU-UPG 7 */}
        <ImmerseSlot /> {/* NDU-UPG immerse */}
        <SpotNote where={where} tripNote={tripNote} defaultLabel={defaultLabel} onLocate={() => locateRef.current()} />
        </ToolCluster>
      </div>
      <AssistantSlot /> {/* NDU-AI assistant: lazy avatar-bot guide (flag: dev on, prod VITE_NDU_ASSISTANT=on) */}
      <InspectSlot /> {/* NDU-UPG inspect (#04): renders nothing until a long-press */}
      {trip ? (
        <div data-ndu-overlay="route" className="absolute top-20 right-3 z-10 w-[min(18rem,calc(100%-9rem))]">
          <RouteBubble eta={clock(trip.eta)} progress={1 - trip.left / (trip.total || 1)}>{/* NDU-UPG bubbles */}
          <div className="bg-surface/95 space-y-1.5 rounded-2xl px-3 py-2 shadow-lg" aria-live="polite">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">To {trip.name}</p>
              <p className="text-sm tabular-nums">{clock(trip.eta)}</p>
            </div>
            <div className="bg-bg h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full"
                style={{ width: `${Math.round(100 * (1 - trip.left / (trip.total || 1)))}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted min-w-0 truncate text-xs">
                {distanceLabel(trip.left)} left · {TRIP_NOTE[trip.source]}
              </p>
              <button type="button" className="bg-bg min-h-8 shrink-0 rounded-full px-3 text-xs" onClick={() => stopTripRef.current()}>
                Stop
              </button>
            </div>
          </div>
          </RouteBubble>
        </div>
      ) : null}
      {/* Dual thumb screen control on OpenStreetMap replicating 3D building office controls */}
      <MapTouchControls />
      {doorPrompt ? (
        <div className="pointer-events-none absolute bottom-40 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[#1a1511] bg-[#f6efe2] px-3 py-1 text-sm font-semibold text-[#1a1511] shadow" role="status" aria-live="polite">
          {doorPrompt.text} <span className="ml-1 rounded border border-[#1a1511] px-1 text-xs">{doorPrompt.locked ? "E · peek" : "E"}</span>
        </div>
      ) : null}
    </div>
  );
}

function SpotNote({
  where,
  tripNote,
  defaultLabel,
  onLocate,
}: {
  where: string;
  tripNote: string | null;
  defaultLabel: string;
  onLocate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const show = where === "default" || where === "saved" || Boolean(tripNote);
  if (!show) return null;
  if (!open) {
    const label = where === "saved" ? "Your last saved spot" : where === "default" ? "Default spot" : tripNote || "Location";
    return (
      <button
        type="button"
        className="bg-surface grid h-11 w-11 place-items-center rounded-full shadow"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
          <circle cx="12" cy="10" r="2" />
        </svg>
      </button>
    );
  }
  return (
    <div className="bg-surface/95 max-w-[13rem] space-y-1.5 rounded-2xl px-3 py-2 text-xs shadow">
      {where === "default" ? (
        <p>Default spot: {defaultLabel}. Location is off, so this is not where you are.</p>
      ) : where === "saved" ? (
        <p>Your last saved spot.</p>
      ) : null}
      {tripNote ? <p className="text-muted">{tripNote}</p> : null}
      <div className="flex gap-1">
        {where === "default" || where === "saved" ? (
          <button type="button" className="bg-bg min-h-9 flex-1 rounded-full px-3" onClick={onLocate}>
            Use my location
          </button>
        ) : null}
        <button type="button" className="bg-bg grid h-9 w-9 place-items-center rounded-full" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
    </div>
  );
}
