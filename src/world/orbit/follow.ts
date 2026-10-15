// NDU-UPG follow: Google-Maps-style follow camera for the player avatar (YOU marker).
import type { Map as MapLibreMap, Marker as MapLibreMarker, PaddingOptions } from "maplibre-gl";
import { readMove } from "@/game/input";
import { clamp, prefersReducedMotion, wrap180 } from "./orbitCore";
import { fpOwns } from "./cameraOwner"; // NDU-FP
import { getFollow, getPerson, setFollow, setFollowActions, type FollowMode } from "./followBus";
import { STREET_MAX_ZOOM, streetCamera, streetEnabled, streetFov, streetWhileHeld } from "./streetCam";
import { gyroLook, walkingBob } from "./viewRig";

/**
 * Default view (Wei, street level): the camera is a person's eye just behind the avatar, ~1.9 m up and
 * 4 m back, looking down the street to the horizon through a phone-like 64° lens (streetCam.ts; the low
 * tier sits a little higher). On load, on a relocation and on Recenter the camera goes there. While the
 * avatar moves (walk stick, tap-to-walk, route trip) it stays behind it, turning heading-up (or keeping
 * north up). Pinch / drag out to the isometric overview at any time. Any drag, pinch, wheel, twist or turn button pauses it and
 * the Recenter bubble appears; Recenter flies back and resumes. When the avatar stands still the camera
 * is left alone, so it never fights the player. A heading cone under the avatar shows where it faces.
 * Reduced motion: no animated turns or flights; the bearing snaps in steps and the fly is a jump.
 */
type MarkerCtor = new (opts: { element: HTMLElement; anchor?: "center"; rotationAlignment?: "map"; pitchAlignment?: "map" }) => MapLibreMarker;

const HEADING_MIN_M = 1; // ignore movement until it adds up to a metre: no jitter from tiny steps

const HEADING_S = 0.25; // heading smoothing
const BEARING_S = 0.55; // camera turn smoothing
const MAX_TURN = 120; // deg/s
const ENGAGE_S = 0.3; // centre/padding ease when follow (re)starts
const ZOOM_S = 0.45; // zoom / tilt ease back down to street level when follow (re)starts
const NO_PAD: PaddingOptions = { top: 0, bottom: 0, left: 0, right: 0 };
const MOVING_MS = 350; // still "moving" this long after the last step
const TELEPORT_M = 40; // a bigger jump in one frame is a relocation, not walking
const FOLLOW = { nduFollow: true };

const metres = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) =>
  Math.hypot((b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180), (b.lat - a.lat) * 111320);
const bearingOf = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) =>
  (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
const ease = (from: number, to: number, dt: number, tau: number) => from + (to - from) * (1 - Math.exp(-dt / tau));

function coneEl(): HTMLElement {
  const el = document.createElement("div");
  el.dataset.nduHeading = "1";
  el.setAttribute("aria-hidden", "true");
  // no inline position: MapLibre's .maplibregl-marker keeps it absolute (an in-flow cone would push the YOU figure down)
  el.style.cssText = "width:96px;height:96px;pointer-events:none;opacity:0;transition:opacity .3s";
  const wedge = document.createElement("div");
  wedge.style.cssText =
    "position:absolute;inset:0;border-radius:50%;" +
    "background:conic-gradient(from -30deg,rgba(232,132,58,.85),rgba(247,180,122,.45) 30deg,rgba(232,132,58,.85) 60deg,transparent 60deg);" +
    "-webkit-mask:radial-gradient(circle closest-side,#000 0 18%,rgba(0,0,0,.85) 30%,transparent 100%);mask:radial-gradient(circle closest-side,#000 0 18%,rgba(0,0,0,.85) 30%,transparent 100%)";
  // embossed arrow head at the front of the cone
  const tip = document.createElement("div");
  tip.style.cssText =
    "position:absolute;left:50%;top:10px;width:0;height:0;transform:translateX(-50%);border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:13px solid #e8843a;filter:drop-shadow(0 2px 0 #6e3612) drop-shadow(0 0 3px rgba(0,0,0,.35))";
  el.append(wedge, tip);
  return el;
}

export function attachFollow(map: MapLibreMap, Marker: MarkerCtor, player: MapLibreMarker): () => void {
  if (typeof window === "undefined") return () => undefined;
  let reduced = prefersReducedMotion();
  const cone = new Marker({ element: coneEl(), anchor: "center", rotationAlignment: "map", pitchAlignment: "map" })
    .setLngLat(player.getLngLat())
    .addTo(map);
  // Draw the cone under the figure (markers stack in DOM order).
  const pEl = player.getElement();
  if (pEl.parentNode) pEl.parentNode.insertBefore(cone.getElement(), pEl);

  // NDU-UPG follow (street default): a human-eye lens, and room to zoom in to eye level (MapLibre stops at 22).
  const streetOn = streetEnabled();
  const lens = () => {
    if (!streetOn || fpOwns()) return; // NDU-FP: FP sets its own lens
    const c = map.getContainer();
    const fov = streetFov(c.clientWidth || 390, c.clientHeight || 844);
    if (Math.abs(map.getVerticalFieldOfView() - fov) > 0.5) map.setVerticalFieldOfView(fov);
  };
  lens();
  if (streetOn && map.getMaxZoom() < STREET_MAX_ZOOM) map.setMaxZoom(STREET_MAX_ZOOM);
  window.addEventListener("resize", lens);
  const street = (at: { lng: number; lat: number }, bearing: number, stickHeld = false) =>
    streetCamera(at, bearing, {
      height: map.getContainer().clientHeight || 800,
      fov: map.getVerticalFieldOfView(),
      maxPitch: map.getMaxPitch(),
      maxZoom: map.getMaxZoom(),
      // Held stick stays on the street rig (first person included), never the 200 m overview.
      street: streetWhileHeld(streetOn, stickHeld),
      person: getPerson(),
    });
  let pendingStreet = true; // first frame: open at street level on the avatar

  let prev = player.getLngLat();
  let anchor = { lng: prev.lng, lat: prev.lat };
  let heading: number | null = null;
  let lastMoveAt = -1e9;
  let framesSinceMove = 99;
  let stickAt = -1e9; // last frame the walk stick / keys were held
  let framesSinceStick = 99; // slow phones: "moving" also holds for 2 frames, whatever their length
  let engaged = false; // follow is driving the camera right now (avatar moving)
  let offset = { x: 0, y: 0 }; // lng/lat offset of the camera centre from the avatar, eased to 0 on engage
  let flyUntil = 0;
  let raf = 0;
  let last = 0;

  // Wei (3:47 AM): one tap recenters behind the avatar, heading-up, so the Recenter bubble always shows.
  const showBriefly = () => setFollow({ showButton: true });

  const pause = () => {
    if (!getFollow().on && getFollow().showButton) return;
    engaged = false;
    setFollow({ on: false, showButton: true });
  };
  const recenter = (mode?: FollowMode) => {
    if (fpOwns()) {
      // NDU-FP: first person owns the camera; it faces the heading itself
      window.dispatchEvent(new CustomEvent("ndu:fp-recenter"));
      return;
    }
    const m = mode ?? getFollow().mode;
    const at = player.getLngLat();
    const bearing = m === "north" ? 0 : (heading ?? map.getBearing());
    const cam = street(at, bearing);
    const to = { center: cam.center, bearing, pitch: cam.pitch, zoom: cam.zoom, padding: NO_PAD };
    setFollow({ on: true, mode: m });
    showBriefly();
    engaged = false;
    offset = { x: 0, y: 0 };
    if (reduced) {
      map.jumpTo(to, FOLLOW);
      flyUntil = 0;
    } else {
      map.easeTo({ ...to, duration: 1000 }, FOLLOW);
      flyUntil = performance.now() + 1020;
    }
  };
  const northUp = () => {
    if (!getFollow().on) return false;
    recenter("north");
    return true;
  };
  const streetDefault = () => {
    if (!getFollow().on) return false;
    const at = player.getLngLat();
    const cam = street(at, getFollow().mode === "north" ? 0 : (heading ?? map.getBearing()));
    map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, padding: NO_PAD }, FOLLOW);
    prev = at;
    anchor = { lng: at.lng, lat: at.lat };
    cone.setLngLat(at);
    engaged = false;
    pendingStreet = false;
    return true;
  };
  setFollowActions({ recenter, pause, northUp, street: streetDefault });
  setFollow({ on: true, showButton: true });

  // Any camera move the player makes (MapLibre gestures carry originalEvent; the drag-orbit tags nduOrbit) pauses.
  type CamEvent = { originalEvent?: unknown; nduOrbit?: boolean; nduFollow?: boolean };
  const onUserMove = (e: CamEvent) => {
    if (e?.nduFollow) return;
    if (e?.originalEvent || e?.nduOrbit) {
      if (getFollow().on) pause();
      flyUntil = 0;
    }
  };
  const evs = ["movestart", "zoomstart", "rotatestart", "pitchstart"] as const;
  evs.forEach((ev) => map.on(ev, onUserMove));
  const onTilt = (ev: Event) => {
    if (getPerson() !== "first") return;
    const e = ev as DeviceOrientationEvent;
    const look = gyroLook(e.beta, e.gamma);
    if (!look || heading === null) return;
    heading += look.bearing * 0.02;
  };
  window.addEventListener("deviceorientation", onTilt);
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const onPref = () => (reduced = Boolean(mq?.matches));
  mq?.addEventListener?.("change", onPref);

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? clamp((now - last) / 1000, 0, 0.25) : 1 / 60;
    last = now;
    const at = player.getLngLat();
    const step = metres(prev, at);
    if (step > TELEPORT_M) {
      // relocation (GPS / saved spot / short hop): restart heading tracking, no camera chase
      anchor = { lng: at.lng, lat: at.lat };
      prev = at;
      cone.setLngLat(at);
      pendingStreet = getFollow().on; // and back to street level on the new spot
      return;
    }
    if (pendingStreet) {
      streetDefault();
      pendingStreet = false;
      return;
    }
    if (fpOwns()) return; // NDU-FP: first person drives the camera
    framesSinceMove += 1;
    framesSinceStick += 1;
    const held = readMove();
    const stickHeld = Boolean(held.x || held.y);
    if (stickHeld) {
      stickAt = now;
      framesSinceStick = 0;
      // The stick is the heading. Do not let the travel bearing overwrite it on the same frame.
      const stickHead = map.getBearing() + (Math.atan2(held.x, held.y) * 180) / Math.PI;
      heading = heading === null || reduced ? stickHead : heading + wrap180(stickHead - heading) * (1 - Math.exp(-dt / 0.18));
      cone.setRotation(heading);
      cone.getElement().style.opacity = "1";
      if (!getFollow().on) {
        setFollow({ on: true });
        flyUntil = 0;
      }
      // A saved overview must not finish flying into the 200 m rig while the stick is held.
      if (!streetOn) flyUntil = 0;
    }
    if (step > 0.005) {
      lastMoveAt = now;
      framesSinceMove = 0;
      cone.setLngLat(at);
    }
    prev = at;
    if (!stickHeld && metres(anchor, at) >= HEADING_MIN_M) {
      const raw = bearingOf(anchor, at);
      heading = heading === null || reduced ? raw : heading + wrap180(raw - heading) * (1 - Math.exp(-dt / HEADING_S));
      anchor = { lng: at.lng, lat: at.lat };
      cone.setRotation(heading);
      cone.getElement().style.opacity = "1";
    }
    const moving = stickHeld || now - lastMoveAt < MOVING_MS || framesSinceMove <= 2;
    const st = getFollow();
    if (!st.on || !moving || now < flyUntil) {
      if (!moving) engaged = false;
      return;
    }
    if (!engaged) {
      // (re)start: ease from wherever the camera is, so nothing jumps
      engaged = true;
      const c = map.getCenter();
      const t = street(at, map.getBearing(), stickHeld).center;
      offset = reduced ? { x: 0, y: 0 } : { x: c.lng - t[0], y: c.lat - t[1] };
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt / ENGAGE_S);
    offset = { x: offset.x * (1 - k), y: offset.y * (1 - k) };
    const pad = map.getPadding();
    const p0 = { top: pad.top ?? 0, bottom: pad.bottom ?? 0, left: pad.left ?? 0, right: pad.right ?? 0 };
    const padding = reduced ? NO_PAD : { top: p0.top * (1 - k), bottom: p0.bottom * (1 - k), left: p0.left * (1 - k), right: p0.right * (1 - k) };
    let bearing = map.getBearing();
    let target = st.mode === "north" ? 0 : heading;
    if (target !== null && st.mode === "heading") {
      // Stick directions are relative to the camera. Holding the stick turns the view to match it.
      const stickWalk = now - stickAt < 600 || framesSinceStick <= 3;
      if (stickWalk) target = heading;
    }
    if (target !== null) {
      const diff = wrap180(target - bearing);
      const stickWalk = now - stickAt < 600 || framesSinceStick <= 3;
      if (reduced) {
        if (Math.abs(diff) > 15) bearing = target; // snap, no animated turn
      } else {
        const tau = stickWalk ? 0.2 : BEARING_S;
        const cap = stickWalk ? 240 : MAX_TURN;
        bearing += clamp(diff * (1 - Math.exp(-dt / tau)), -cap * dt, cap * dt);
      }
    }
    const cam = street(at, bearing, stickHeld);
    let pitch = reduced ? cam.pitch : ease(map.getPitch(), cam.pitch, dt, ZOOM_S);
    if (!reduced && getPerson() === "first" && now - lastMoveAt < 400) {
      const bob = walkingBob(now / 1000, 1.4);
      pitch = clamp(pitch + bob.yBobM * 8, 0, 80);
    }
    const zoom = reduced ? cam.zoom : ease(map.getZoom(), cam.zoom, dt, ZOOM_S);
    map.jumpTo({ center: [cam.center[0] + offset.x, cam.center[1] + offset.y], zoom, bearing, pitch, padding }, FOLLOW);
  };
  raf = requestAnimationFrame(frame);

  // QA scripts read the follow state (and the map, which main no longer exposes) through this handle.
  (window as Window & { __nduFollow?: unknown }).__nduFollow = {
    map,
    state: () => ({ ...getFollow(), street: streetOn, person: getPerson(), heading, fov: map.getVerticalFieldOfView(), engaged, moving: performance.now() - lastMoveAt < MOVING_MS || framesSinceMove <= 2, you: player.getLngLat() }),
  };
  return () => {
    cancelAnimationFrame(raf);
    evs.forEach((ev) => map.off(ev, onUserMove));
    window.removeEventListener("resize", lens);
    window.removeEventListener("deviceorientation", onTilt);
    mq?.removeEventListener?.("change", onPref);
    setFollowActions(null);
    setFollow({ showButton: false });
    cone.remove();
  };
}
