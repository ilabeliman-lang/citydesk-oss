import { useEffect, useRef, useState } from "react";

/**
 * Floating dock that tucks the map's cards away. Each blocking card carries `data-ndu-overlay="<id>"`;
 * the dock sets `data-ndu-collapsed` on it (CSS slides/fades it out) and remembers the choice. The eye
 * button clears every card for a full map view. While the map is being dragged, open cards fade back
 * so the street stays visible, and return on release.
 */
const OVERLAYS = [
  { id: "top", label: "Top bar", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "tools", label: "Turn & scans", icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" },
  { id: "route", label: "Route", icon: "M5 19c4 0 4-14 8-14s4 14 8 14M5 19a2 2 0 1 0 0-.01M19 5a2 2 0 1 0 0-.01" },
  { id: "needs", label: "Needs", icon: "M12 21s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6.3 5.2 5.2 0 0 1 21.3 12C19 16.6 12 21 12 21z" },
] as const;
type OverlayId = (typeof OVERLAYS)[number]["id"];
type DockState = { hidden: boolean; collapsed: Partial<Record<OverlayId, boolean>> };

const KEY = "ndu.overlays.v1";
const EYE = "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF = "M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4.1M6.6 6.6C3.4 8.6 1 12 1 12s4 7 11 7c1.8 0 3.4-.5 4.8-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2";

const CSS = `
[data-ndu-overlay]{transition:opacity .28s ease,transform .34s cubic-bezier(.2,.8,.2,1)}
[data-ndu-overlay][data-ndu-collapsed="1"]{opacity:0!important}
[data-ndu-overlay][data-ndu-collapsed="1"],[data-ndu-overlay][data-ndu-collapsed="1"] *{pointer-events:none!important}
[data-ndu-overlay="top"][data-ndu-collapsed="1"]{transform:translateY(-130%)}
[data-ndu-overlay="needs"][data-ndu-collapsed="1"]{transform:translateY(130%)}
[data-ndu-overlay="tools"][data-ndu-collapsed="1"]{transform:translateX(-140%)}
[data-ndu-overlay="route"][data-ndu-collapsed="1"]{transform:translateX(140%)}
html[data-ndu-panning="1"] [data-ndu-overlay]:not([data-ndu-collapsed="1"]){opacity:.15}
html[data-ndu-panning="1"] [data-ndu-overlay],html[data-ndu-panning="1"] [data-ndu-overlay] *{pointer-events:none!important}
.ndu-dock{position:absolute;z-index:560;right:max(8px,env(safe-area-inset-right));top:44%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px}
.ndu-dock button{width:42px;height:42px;border-radius:999px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 0 rgba(0,0,0,.35),0 8px 18px rgba(0,0,0,.35);transition:transform .12s ease,box-shadow .12s ease,opacity .2s}
.ndu-dock button:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.35)}
.ndu-dock button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.ndu-dock svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ndu-dock .ndu-pill[aria-pressed="false"]{opacity:.72}
html[data-ndu-panning="1"] .ndu-dock{opacity:.35}
@media (prefers-reduced-motion: reduce){[data-ndu-overlay],.ndu-dock button{transition:none}}
`;

function readState(): DockState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<DockState>;
    return { hidden: Boolean(raw.hidden), collapsed: raw.collapsed && typeof raw.collapsed === "object" ? raw.collapsed : {} };
  } catch {
    return { hidden: false, collapsed: {} };
  }
}

export function OverlayDock({ bubbles = false }: { bubbles?: boolean } = {}) {
  const [state, setState] = useState<DockState>({ hidden: false, collapsed: {} });
  const [present, setPresent] = useState<string>("");
  const stateRef = useRef(state);
  stateRef.current = state;
  const bubblesRef = useRef(bubbles); // NDU-UPG bubbles
  bubblesRef.current = bubbles;

  useEffect(() => setState(readState()), []);

  // Apply the collapsed flags to whatever cards are on screen now, and again whenever cards mount.
  useEffect(() => {
    const apply = () => {
      const s = stateRef.current;
      const ids: string[] = [];
      const off = bubblesRef.current; // NDU-UPG bubbles: bubbles fold the cards themselves
      document.querySelectorAll<HTMLElement>("[data-ndu-overlay]").forEach((el) => {
        const id = el.dataset.nduOverlay as OverlayId;
        ids.push(id);
        const want = !off && (s.hidden || s.collapsed[id]) ? "1" : "0";
        if (el.dataset.nduCollapsed !== want) el.dataset.nduCollapsed = want;
      });
      const key = [...new Set(ids)].sort().join(",");
      setPresent((prev) => (prev === key ? prev : key));
    };
    apply();
    let raf = 0;
    const obs = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [state, bubbles]);

  // Fade the open cards while the map itself is dragged; bring them back on release.
  useEffect(() => {
    const root = document.documentElement;
    let start: { id: number; x: number; y: number } | null = null;
    let timer = 0;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest?.(".maplibregl-canvas-container") || t.closest("button, a, [role=button]")) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id || root.dataset.nduPanning === "1") return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
      window.clearTimeout(timer);
      root.dataset.nduPanning = "1";
    };
    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete root.dataset.nduPanning, 350);
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.clearTimeout(timer);
      delete root.dataset.nduPanning;
    };
  }, []);

  const save = (next: DockState) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private mode: the toggles still work for this visit
    }
    if (navigator.vibrate) navigator.vibrate(8);
  };
  const shown = OVERLAYS.filter((o) => present.split(",").includes(o.id));
  if (bubbles) return <style>{CSS}</style>; // NDU-UPG bubbles: the per-card toggles live in the bubbles now

  return (
    <div className="ndu-dock" aria-label="Map cards">
      <style>{CSS}</style>
      <button
        type="button"
        className={state.hidden ? "bg-accent text-bg" : "bg-surface text-fg"}
        aria-pressed={state.hidden}
        aria-label={state.hidden ? "Show the cards" : "Hide all cards for a full map"}
        title={state.hidden ? "Show the cards" : "Full map"}
        onClick={() => save({ ...state, hidden: !state.hidden })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={state.hidden ? EYE_OFF : EYE} />
        </svg>
      </button>
      {state.hidden
        ? null
        : shown.map((o) => {
            const open = !state.collapsed[o.id];
            return (
              <button
                key={o.id}
                type="button"
                className={`ndu-pill ${open ? "bg-surface text-fg" : "bg-accent text-bg"}`}
                aria-pressed={open}
                aria-label={`${open ? "Tuck away" : "Show"} ${o.label}`}
                title={`${open ? "Tuck away" : "Show"} ${o.label}`}
                onClick={() => save({ ...state, collapsed: { ...state.collapsed, [o.id]: open } })}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={o.icon} />
                </svg>
              </button>
            );
          })}
    </div>
  );
}
