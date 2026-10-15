// NDU-UPG drag360: one-finger / left-mouse drag now orbits the camera both ways (was: sideways turn only).
import { Orbit, prefersReducedMotion, YAW_PER_PX } from "@/world/orbit/orbitCore";
import { fpOwns } from "@/world/orbit/cameraOwner"; // NDU-FP
import { DEFAULT_ISO_PITCH, publishView, setViewReset } from "@/world/orbit/cameraBus";

/**
 * Drag on the 3D map to look around, 360°:
 * - one finger (or left mouse) sideways → turn, continuously, round and round with no stops;
 * - one finger up/down → a slow tilt, so the ground does not rush at you like a zoom;
 * The avatar stays in the centre while you drag. Two fingers still pinch to zoom.
 * - both at once, with a short spring while dragging and a glide after letting go (none with reduced motion).
 * The first ~8px decide it's a drag; under that nothing happens here, so a tap still reaches the street,
 * building, sign or person. Two fingers are always left to the map (pinch zoom, twist, move the view).
 * Desktop: right/middle drag or Ctrl+drag moves the view (left drag orbits like a finger).
 */
type OrbitEvent = { nduOrbit?: boolean; point?: unknown };
type OrbitMap = {
  getBearing: () => number;
  getPitch: () => number;
  jumpTo(options: { bearing?: number; pitch?: number; center?: [number, number] }, eventData?: Record<string, unknown>): void;
  dragPan: { disable: () => void; enable?: () => void; isEnabled?: () => boolean };
  getCenter?: () => { lng: number; lat: number };
  // Present on the real maplibre-gl Map (optional so the old hand-typed CityMap still fits).
  getMinPitch?: () => number;
  getMaxPitch?: () => number;
  easeTo?(options: { bearing?: number; pitch?: number; duration?: number }): void;
  panBy?(offset: [number, number], options?: { duration?: number }): void;
  dragRotate?: { disable: () => void; enable: () => void; isEnabled?: () => boolean };
  on?(event: string, fn: (e: OrbitEvent) => void): void;
  off?(event: string, fn: (e: OrbitEvent) => void): void;
};

/** Kept for callers of the old sideways-turn API. */
export const TURN_DEG_PER_PX = YAW_PER_PX;
const SLOP = 8;
const ORBIT = { nduOrbit: true };
// NDU-UPG follow (live bug): a drag must never end in a tap. Browsers may still fire a click after a short
// touch drag (it stayed inside their own tap slop), which opened "This building" at the end of an orbit.
const TAP_MAX_PX = 6;
const CLICK_AFTER_DRAG_MS = 400;

export function attachDragTurn(el: HTMLElement, map: OrbitMap): () => void {
  const down = new Set<number>();
  const travel = new Map<number, { x: number; y: number; far: boolean }>(); // NDU-UPG follow
  let swallowUntil = 0; // NDU-UPG follow
  const orbit = new Orbit({ reduced: prefersReducedMotion(), pitchPerPx: 0.07, yawPerPx: 0.22 });
  const mq = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
  const onMotionPref = () => (orbit.reduced = Boolean(mq?.matches));
  mq?.addEventListener?.("change", onMotionPref);
  let g: { id: number; x: number; y: number; center?: [number, number]; mode: "wait" | "orbit" | "pan"; pan: boolean; paused: boolean } | null = null;
  let raf = 0;
  let last = 0;
  // Right-drag is ours now (move the view); MapLibre's own right-drag rotate would fight it.
  const hadRotate = map.dragRotate?.isEnabled?.() ?? Boolean(map.dragRotate);
  map.dragRotate?.disable();

  const limits = () => ({ min: map.getMinPitch?.() ?? 0, max: map.getMaxPitch?.() ?? 85 });
  const avatarCenter = (): { center?: [number, number] } => {
    const you = (window as Window & { __nduFollow?: { state?: () => { you?: { lng: number; lat: number } } } }).__nduFollow?.state?.().you;
    return you ? { center: [you.lng, you.lat] } : {};
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const frame = (now: number) => {
    raf = 0;
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const more = orbit.step(dt, limits());
    map.jumpTo({ bearing: orbit.view.yaw, pitch: orbit.view.pitch, ...avatarCenter() }, ORBIT);
    if (more || orbit.dragging) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (orbit.reduced) {
      map.jumpTo({ bearing: orbit.view.yaw, pitch: orbit.view.pitch, ...avatarCenter() }, ORBIT);
      return;
    }
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  const halt = () => {
    stopLoop();
    orbit.halt();
  };

  const finish = (e?: PointerEvent) => {
    if (g?.paused) map.dragPan.enable?.();
    if (g?.mode === "orbit") {
      orbit.up(e ? e.timeStamp || performance.now() : performance.now());
      if (e) kick();
      else halt();
    }
    g = null;
  };
  const onDown = (e: PointerEvent) => {
    if (fpOwns()) return; // NDU-FP: FP has its own look
    down.add(e.pointerId);
    travel.set(e.pointerId, { x: e.clientX, y: e.clientY, far: false }); // NDU-UPG follow
    if (down.size > 1) travel.forEach((t) => (t.far = true)); // NDU-UPG follow: 2 fingers = never a tap
    halt(); // any new touch catches a gliding camera
    if (down.size > 1) {
      // second finger: hand the gesture back to the map's pinch/twist/move handlers
      finish();
      return;
    }
    const pan = e.pointerType === "mouse" && (e.button === 1 || e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey)));
    if (e.pointerType === "mouse" && e.button !== 0 && !pan) return;
    if (e.pointerType === "mouse" && e.button === 0 && e.shiftKey) return; // Shift+drag stays MapLibre's box zoom
    const target = e.target as Element | null;
    if (target?.closest?.("button, a, input, select, textarea, [role=button], .maplibregl-marker")) return; // signs, pins, people
    if (map.dragPan.isEnabled && !map.dragPan.isEnabled()) return; // something else (e.g. placing a scan) owns the drag
    const c = map.getCenter?.();
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, center: c ? [c.lng, c.lat] : undefined, mode: "wait", pan, paused: false };
  };
  const onMove = (e: PointerEvent) => {
    const t = travel.get(e.pointerId); // NDU-UPG follow
    if (t && !t.far && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_MAX_PX) t.far = true;
    if (!g || e.pointerId !== g.id) return;
    const now = e.timeStamp || performance.now();
    if (g.mode === "wait") {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < SLOP) return;
      map.dragPan.disable();
      g.paused = true;
      if (g.center) map.jumpTo({ center: g.center }, ORBIT); // undo the few pixels the pan moved before we decided
      g.x = e.clientX;
      g.y = e.clientY;
      if (g.pan) {
        g.mode = "pan";
        return;
      }
      g.mode = "orbit";
      orbit.down(e.clientX, e.clientY, now, { yaw: map.getBearing(), pitch: map.getPitch() });
      return;
    }
    if (g.mode === "pan") {
      map.panBy?.([g.x - e.clientX, g.y - e.clientY], { duration: 0 });
      g.x = e.clientX;
      g.y = e.clientY;
      return;
    }
    orbit.move(e.clientX, e.clientY, now, limits());
    kick();
  };
  const onUp = (e: PointerEvent) => {
    down.delete(e.pointerId);
    // NDU-UPG follow: after a drag (or any multi-finger gesture) swallow the click that may follow
    if (travel.get(e.pointerId)?.far || g?.mode === "orbit" || g?.mode === "pan") swallowUntil = performance.now() + CLICK_AFTER_DRAG_MS;
    travel.delete(e.pointerId);
    if (g && e.pointerId === g.id) finish(e);
  };
  const onWheel = () => halt();
  const onClick = (e: MouseEvent) => {
    // NDU-UPG follow: capture phase on the map container, so neither MapLibre's click (trip / building
    // sheet) nor a sign, pin or walker bubble sees the click that ends a drag.
    if (performance.now() < swallowUntil) {
      e.stopPropagation();
      e.preventDefault();
      swallowUntil = 0;
    }
  };
  const onMenu = (e: MouseEvent) => e.preventDefault(); // right-drag moves the view, no browser menu
  // Buttons, trips, pinch etc. move the camera too: stop a glide so it never fights them.
  const onMoveStart = (e: OrbitEvent) => {
    if (!e?.nduOrbit && raf && !orbit.dragging) halt();
  };
  let lastPub = { b: NaN, p: NaN };
  const publish = () => {
    const b = map.getBearing();
    const p = map.getPitch();
    if (Math.abs(b - lastPub.b) < 0.2 && Math.abs(p - lastPub.p) < 0.2) return;
    lastPub = { b, p };
    publishView({ bearing: b, pitch: p });
  };

  setViewReset(() => {
    halt();
    const to = { bearing: 0, pitch: Math.min(DEFAULT_ISO_PITCH, limits().max) };
    if (map.easeTo) map.easeTo({ ...to, duration: orbit.reduced ? 0 : 650 });
    else map.jumpTo(to);
  });
  publish();
  map.on?.("move", publish);
  map.on?.("movestart", onMoveStart);
  el.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  el.addEventListener("wheel", onWheel, { passive: true });
  el.addEventListener("click", onClick, { capture: true }); // NDU-UPG follow
  el.addEventListener("contextmenu", onMenu);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });
  // QA scripts read the gesture state through this handle.
  (window as Window & { __nduOrbit?: unknown }).__nduOrbit = { orbit, limits };
  return () => {
    finish();
    halt();
    setViewReset(null);
    if (hadRotate) map.dragRotate?.enable();
    mq?.removeEventListener?.("change", onMotionPref);
    map.off?.("move", publish);
    map.off?.("movestart", onMoveStart);
    el.removeEventListener("pointerdown", onDown, { capture: true });
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("click", onClick, { capture: true }); // NDU-UPG follow
    el.removeEventListener("contextmenu", onMenu);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}
