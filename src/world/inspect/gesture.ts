// NDU-UPG inspect (#04): long-press / right-click gesture state machine. Pure (clock injected).
// idle → pressing → longpress | tap | cancel. A long-press swallows the trailing map click.

export type Pt = { x: number; y: number };
export type Clock = { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
export type PointerLike = { pointerId?: number; pointerType?: string; button?: number; clientX: number; clientY: number; preventDefault?: () => void };
type Listener = (e: never) => void;
export type ElLike = {
  addEventListener(t: string, fn: Listener, o?: unknown): void;
  removeEventListener(t: string, fn: Listener, o?: unknown): void;
  getBoundingClientRect?: () => { left: number; top: number };
  style: Record<string, string>;
};
export type MapLike = { on(t: string, fn: (ev?: { originalEvent?: unknown }) => void): void; off(t: string, fn: (ev?: { originalEvent?: unknown }) => void): void };

export type PressOpts = {
  holdMs: number;
  slopPx?: number;
  previewMs?: number;
  swallowMs?: number;
  clock?: Clock;
  onPreview?: (p: Pt) => void;
  onLongPress: (p: Pt) => void;
  onCancel?: () => void;
};

const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createPressTracker(opts: PressOpts) {
  const clock = opts.clock ?? realClock;
  const slop = opts.slopPx ?? 10;
  const previewMs = opts.previewMs ?? 200;
  const swallowMs = opts.swallowMs ?? 450;
  let state: "idle" | "pressing" = "idle";
  let p0: Pt = { x: 0, y: 0 };
  let id: number | undefined;
  let pointers = 0;
  let tPreview: unknown = null;
  let tHold: unknown = null;
  let previewed = false;
  let swallowUntil = -Infinity;
  let cameraMoved = false; // a right-drag rotate also ends in a contextmenu: don't inspect then
  let origin = () => ({ left: 0, top: 0 });

  const local = (e: PointerLike): Pt => {
    const o = origin();
    return { x: e.clientX - o.left, y: e.clientY - o.top };
  };
  const clear = () => {
    if (tPreview !== null) clock.clearTimeout(tPreview);
    if (tHold !== null) clock.clearTimeout(tHold);
    tPreview = tHold = null;
  };
  const fire = (p: Pt) => {
    clear();
    state = "idle";
    swallowUntil = clock.now() + swallowMs;
    opts.onLongPress(p);
  };
  const cancel = () => {
    const was = state === "pressing";
    clear();
    state = "idle";
    if (was && previewed) opts.onCancel?.();
    previewed = false;
  };

  const api = {
    down(e: PointerLike) {
      pointers += 1;
      cameraMoved = false;
      if (pointers > 1 || (e.pointerType === "mouse" && (e.button ?? 0) !== 0)) {
        cancel();
        return;
      }
      state = "pressing";
      previewed = false;
      cameraMoved = false;
      p0 = local(e);
      id = e.pointerId;
      tPreview = clock.setTimeout(() => {
        tPreview = null;
        if (state !== "pressing") return;
        previewed = true;
        opts.onPreview?.(p0);
      }, previewMs);
      tHold = clock.setTimeout(() => {
        tHold = null;
        if (state === "pressing") fire(p0);
      }, opts.holdMs);
    },
    move(e: PointerLike) {
      if (state !== "pressing" || (id !== undefined && e.pointerId !== undefined && e.pointerId !== id)) return;
      const p = local(e);
      if (Math.hypot(p.x - p0.x, p.y - p0.y) > slop) cancel();
    },
    up(_e?: PointerLike) {
      pointers = Math.max(0, pointers - 1);
      if (state === "pressing") cancel(); // a tap: MapLibre's click runs as before
    },
    cancel() {
      pointers = 0;
      cancel();
    },
    contextmenu(e: PointerLike) {
      e.preventDefault?.();
      pointers = 0;
      if (cameraMoved) {
        cameraMoved = false;
        return;
      }
      fire(local(e));
    },
    swallowClick(): boolean {
      return clock.now() < swallowUntil;
    },
    attach(el: ElLike, map?: MapLike | null): () => void {
      origin = () => el.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      const prev = { callout: el.style.webkitTouchCallout ?? "", select: el.style.userSelect ?? "" };
      el.style.webkitTouchCallout = "none";
      el.style.userSelect = "none";
      const on: [string, Listener, unknown][] = [
        ["pointerdown", ((e: PointerLike) => api.down(e)) as Listener, { passive: true }],
        ["pointermove", ((e: PointerLike) => api.move(e)) as Listener, { passive: true }],
        ["pointerup", ((e: PointerLike) => api.up(e)) as Listener, { passive: true }],
        ["pointercancel", (() => api.cancel()) as Listener, { passive: true }],
        ["contextmenu", ((e: PointerLike) => api.contextmenu(e)) as Listener, undefined],
      ];
      for (const [t, fn, o] of on) el.addEventListener(t, fn, o);
      // only user-driven camera moves cancel (the follow camera eases the map every frame)
      const stop = (ev?: { originalEvent?: unknown }) => {
        if (!ev || ev.originalEvent) {
          cameraMoved = true;
          api.cancel();
        }
      };
      const mapEvents = ["movestart", "zoomstart", "pitchstart", "rotatestart"];
      for (const t of mapEvents) map?.on(t, stop);
      return () => {
        api.cancel();
        for (const [t, fn, o] of on) el.removeEventListener(t, fn, o);
        for (const t of mapEvents) map?.off(t, stop);
        el.style.webkitTouchCallout = prev.callout;
        el.style.userSelect = prev.select;
      };
    },
  };
  return api;
}

export type PressTracker = ReturnType<typeof createPressTracker>;
