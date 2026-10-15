// NDU-FP (FPXR-11): one-finger 1:1 look (deg/px = vFov / viewportH x touchScale), two-finger binocular zoom.
// Capture-phase on the map container, active only while FP owns the camera (dragTurn early-returns then).
import { fpOwns } from "../../orbit/cameraOwner.ts";

export const touchDegPerPx = (vFovDeg: number, viewportH: number, touchScale = 1) => (vFovDeg / Math.max(1, viewportH)) * touchScale;
const SLOP = 8;
const CLICK_AFTER_DRAG_MS = 400;

export function attachTouchLook(
  el: HTMLElement,
  degPerPx: () => number,
  onLook: (dYaw: number, dPitch: number) => void,
  onZoom: (scale: number | null) => void,
): () => void {
  const pts = new Map<number, { x: number; y: number }>();
  let drag = false;
  let start = { x: 0, y: 0 };
  let pinch0 = 0;
  let draggedAt = 0;
  const down = (e: PointerEvent) => {
    if (!fpOwns() || e.pointerType === "mouse") return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY };
      drag = false;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p || !fpOwns()) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      if (pinch0 > 0) onZoom(Math.hypot(a.x - b.x, a.y - b.y) / pinch0);
      e.stopPropagation();
      return;
    }
    if (!drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) < SLOP) return;
    drag = true;
    const k = degPerPx();
    // drag left -> look right (the scene stays under the finger)
    onLook(-dx * k, dy * k);
    e.stopPropagation();
  };
  const up = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (drag) draggedAt = performance.now();
    if (pts.size < 2) pinch0 = 0;
  };
  const click = (e: MouseEvent) => {
    if (performance.now() - draggedAt < CLICK_AFTER_DRAG_MS) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  el.addEventListener("pointerdown", down, { capture: true, passive: true });
  el.addEventListener("pointermove", move, { capture: true });
  el.addEventListener("pointerup", up, { capture: true, passive: true });
  el.addEventListener("pointercancel", up, { capture: true, passive: true });
  el.addEventListener("click", click, { capture: true });
  return () => {
    el.removeEventListener("pointerdown", down, { capture: true });
    el.removeEventListener("pointermove", move, { capture: true });
    el.removeEventListener("pointerup", up, { capture: true });
    el.removeEventListener("pointercancel", up, { capture: true });
    el.removeEventListener("click", click, { capture: true });
  };
}
