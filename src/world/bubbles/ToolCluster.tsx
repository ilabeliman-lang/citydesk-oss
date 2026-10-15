import { useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, Navigation } from "lucide-react";
import { isDefaultView, onView, resetView } from "@/world/orbit/cameraBus"; // NDU-UPG drag360
import { followNorthUp, onFollow, onPerson, pauseFollow, recenter, togglePerson, type FollowState } from "@/world/orbit/followBus"; // NDU-UPG follow
import type { PersonView } from "@/world/orbit/streetCam";
import { OPEN_SCANS_EVENT } from "@/world/assistant/bridgeStore"; // NDU-AI assistant
import { fpAllowed } from "@/world/fp/flag"; // NDU-FP
import { Bubble } from "./Bubble";
import { useBubbleMode } from "./mode";

/**
 * NDU-UPG bubbles: the left tool column (Turn left / Turn right / Scans / location note, plus anything later
 * tracks drop in, like the light-map chip or the time dial) folds into one compass bubble. Tap it and the
 * tools spring out underneath; tap again or tap the map to fold them. Children stay mounted while folded so
 * open panels (scan placing) keep their state. Classic mode renders the original pill buttons unchanged.
 */
export function ToolCluster({ onTurn: turnCamera, alert, children }: { onTurn: (deg: number) => void; alert?: boolean; children?: ReactNode }) {
  const bubbles = useBubbleMode();
  // NDU-UPG follow: turning by hand pauses the follow camera (Recenter resumes it).
  const onTurn = (deg: number) => {
    pauseFollow();
    turnCamera(deg);
  };
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLDivElement>(null);
  // NDU-UPG drag360: the compass needle follows the map bearing; the N bubble beside it resets the view.
  const needle = useRef<HTMLSpanElement>(null);
  const [atDefault, setAtDefault] = useState(true);
  useEffect(
    () =>
      onView((v) => {
        if (needle.current) needle.current.style.transform = `rotate(${-v.bearing}deg)`;
        setAtDefault(isDefaultView(v));
      }),
    [bubbles],
  );

  // NDU-AI assistant: unfold the tools when the guide bot opens the scan panel inside them.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SCANS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SCANS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      // Keep it open while a tool panel with inputs (e.g. scan placing) is in use.
      if (items.current?.querySelector("input, select, textarea")) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, [open]);

  if (!bubbles) {
    // Walk pills are gone. The stick drives you and the camera follows it.
    return (
      <>
        <PersonButton />
        {children}
      </>
    );
  }

  return (
    <div ref={box} className="ndu-cluster" data-ndu-bubble-hideable="">
      <Bubble
        label={open ? "Fold the tools" : alert ? "Tools: turn, scans, location" : "Tools: turn, scans"}
        aria-expanded={open}
        badge={alert && !open ? "!" : null}
        badgeTone="pulse"
        onClick={() => setOpen((v) => !v)}
      >
        <span ref={needle} className="ndu-needle" aria-hidden="true">
          <Compass />
        </span>
      </Bubble>
      {/* NDU-UPG drag360 */}
      <button
        type="button"
        className={`ndu-north${atDefault ? " is-home" : ""}`}
        aria-label="Face north, isometric view"
        title="Face north, isometric view"
        onClick={() => {
          if (!followNorthUp()) resetView(); // NDU-UPG follow: while following, N = north-up follow
        }}
      >
        N
      </button>
      <RecenterButton /> {/* NDU-UPG follow */}
      <PersonButton />
      <div ref={items} className="ndu-cluster__items" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * NDU-UPG follow: appears when the follow camera is paused (you dragged, pinched or turned). Tap: fly back
 * to you and follow again. Tap again while it is still showing (or long-press): switch heading-up / north-up.
 */
function RecenterButton({ classic = false }: { classic?: boolean }) {
  const [f, setF] = useState<FollowState | null>(null);
  useEffect(() => onFollow(setF), []);
  const press = useRef<{ timer: number; long: boolean }>({ timer: 0, long: false });
  useEffect(() => () => window.clearTimeout(press.current.timer), []);
  if (!f?.showButton) return null;
  const other = f.mode === "heading" ? "north" : "heading";
  // NDU-UPG follow (Wei 3:47 AM): one tap = back behind your avatar, heading up (Google-Maps recenter).
  // Hold = switch heading-up / north-up.
  const label = !f.on
    ? "Recenter behind you, heading up. Hold for north up"
    : f.mode === "heading"
      ? "Following you, heading up. Tap to snap behind you, hold for north up"
      : "Following you, north up. Tap for heading up behind you";
  const handlers = {
    onPointerDown: () => {
      press.current.long = false;
      window.clearTimeout(press.current.timer);
      press.current.timer = window.setTimeout(() => {
        press.current.long = true;
        recenter(other);
      }, 550);
    },
    onPointerUp: () => window.clearTimeout(press.current.timer),
    onPointerLeave: () => window.clearTimeout(press.current.timer),
    onClick: () => {
      if (press.current.long) return; // the long-press already switched mode
      recenter("heading");
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
  if (classic) {
    return (
      <button type="button" className="bg-surface min-h-11 rounded-full px-3 text-sm shadow" aria-label={label} title={label} {...handlers}>
        {!f.on ? "Recenter" : f.mode === "heading" ? "Heading up" : "North up"}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`ndu-recenter${f.on ? " is-on" : ""}${f.mode === "north" ? " is-north" : ""}`}
      aria-label={label}
      title={label}
      data-ndu-recenter={f.on ? f.mode : "paused"}
      {...handlers}
    >
      {f.on && f.mode === "north" ? <span className="ndu-recenter__n">N</span> : <Navigation aria-hidden="true" />}
    </button>
  );
}

/** Third person is behind you. Second person stands in front and looks back at your face. */
function PersonButton() {
  const [person, setPerson] = useState<PersonView>("third");
  useEffect(() => onPerson(setPerson), []);
  const fp = useRef(false); // NDU-FP: real first person behind its flag
  const hold = useRef<{ timer: number; long: boolean }>({ timer: 0, long: false });
  useEffect(() => {
    fp.current = fpAllowed();
    return () => window.clearTimeout(hold.current.timer);
  }, []);
  const label =
    person === "first"
      ? fp.current
        ? "First person (walk). Tap for third person"
        : "First person. Tap for third person"
      : person === "second"
        ? "Second person. Tap for first person"
        : "Third person. Tap for second person";
  const text = person === "third" ? "3" : person === "second" ? "2" : "1";
  return (
    <button
      type="button"
      className="ndu-person bg-surface grid h-11 w-11 place-items-center rounded-full text-sm shadow"
      aria-label={label}
      title={label}
      data-ndu-person={person}
      onPointerDown={() => {
        // NDU-FP: hold the bubble (>= 500 ms) for first-person settings
        if (!fp.current) return;
        hold.current.long = false;
        window.clearTimeout(hold.current.timer);
        hold.current.timer = window.setTimeout(() => {
          hold.current.long = true;
          window.dispatchEvent(new CustomEvent("ndu:fp-settings"));
        }, 500);
      }}
      onPointerUp={() => window.clearTimeout(hold.current.timer)}
      onPointerLeave={() => window.clearTimeout(hold.current.timer)}
      onClick={() => {
        if (hold.current.long) {
          hold.current.long = false;
          return;
        }
        togglePerson();
      }}
    >
      {text}
    </button>
  );
}
