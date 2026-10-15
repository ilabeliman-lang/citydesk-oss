import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LOCK_KEY } from "./store";

/**
 * NDU-UPG kids: the door into the Kids room and the one host that shows it.
 * This file is in the first-map bundle, so it stays tiny: the room, its CSS and three.js load only
 * when the door is tapped. While the room is open a local lock flag is set, so a reload lands back
 * inside it; only the parent gate (inside the room) clears it.
 */
const KidsRoom = lazy(() => import("./KidsRoom"));
const OPEN_EVENT = "ndu:kids-open";

/** Kill switch (same pattern as ?life=0): ?kids=0 or localStorage ndu.kids.off = "1" hides the door and the room. */
function kidsOff(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(location.search).get("kids") === "0")
      localStorage.setItem("ndu.kids.off", "1");
    if (new URLSearchParams(location.search).get("kids") === "1")
      localStorage.removeItem("ndu.kids.off");
    return localStorage.getItem("ndu.kids.off") === "1";
  } catch {
    return false;
  }
}

function locked(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function openKids() {
  try {
    localStorage.setItem(LOCK_KEY, "1");
  } catch {
    // private mode: the room still opens, it just will not survive a reload
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Embossed pill used in My room and the Hall. */
export function KidsDoor() {
  if (kidsOff()) return null;
  return (
    <button
      type="button"
      data-ndu-kids-door=""
      onClick={openKids}
      className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-[#3a2416]"
      style={{
        background: "radial-gradient(circle at 30% 20%, #ffe3b8 0%, #f7b47a 55%, #e8843a 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.5), inset 0 -3px 6px rgba(0,0,0,.2), 0 3px 0 #9c4f1c, 0 8px 18px rgba(0,0,0,.35)",
      }}
    >
      <span aria-hidden="true">♥</span> Kids room · play together
    </button>
  );
}

/** Mounted once (WorldMap). Opens on the door event, on a kept lock, or with ?kids=1. */
export function KidsHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      if (kidsOff()) return;
      if (locked() || new URLSearchParams(location.search).get("kids") === "1") setOpen(true);
    };
    check();
    window.addEventListener(OPEN_EVENT, check);
    return () => window.removeEventListener(OPEN_EVENT, check);
  }, []);
  if (!open || typeof document === "undefined") return null;
  const exit = () => {
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
    const url = new URL(location.href);
    if (url.searchParams.has("kids")) {
      url.searchParams.delete("kids");
      history.replaceState(history.state, "", url.toString());
    }
    setOpen(false);
  };
  return createPortal(
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[2000] grid place-items-center bg-[#f6e7cf] text-[#3a2416]">
          <p className="font-display text-2xl">Opening the Kids room…</p>
        </div>
      }
    >
      <KidsRoom onExit={exit} />
    </Suspense>,
    document.body,
  );
}
