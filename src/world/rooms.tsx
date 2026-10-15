import { useEffect, useState } from "react";
import { liveAct } from "@/game/sim";
import { KidsDoor } from "@/world/kids/door"; // NDU-UPG kids

const KEY = "ndu-furnish";
const USE_KEY = "ndu-room-use";
const LINE_KEY = "ndu-hall-line";
const LOCK_KEY = "ndu-hall-lock";

const COLORS = ["#1a1511", "#2f6b45", "#3d5a80", "#e8843a"];
const PIECES = ["Sofa", "Table", "Lamp", "Rug"];
const GAP = 60_000;

function readFurnish(): { wall: string; pieces: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as { wall?: string; pieces?: unknown };
    const saved = Array.isArray(raw.pieces) ? raw.pieces.filter((item) => typeof item === "string").slice(0, 4) : [];
    const pieces = PIECES.map((name, index) => (typeof saved[index] === "string" && saved[index].trim() ? saved[index].trim().slice(0, 24) : name));
    return { wall: typeof raw.wall === "string" ? raw.wall : COLORS[0], pieces };
  } catch {
    return { wall: COLORS[0], pieces: [...PIECES] };
  }
}

function readUse(): { bed: number; bath: number; chair: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(USE_KEY) || "{}") as { bed?: number; bath?: number; chair?: number };
    return {
      bed: typeof raw.bed === "number" ? raw.bed : 0,
      bath: typeof raw.bath === "number" ? raw.bath : 0,
      chair: typeof raw.chair === "number" ? raw.chair : 0,
    };
  } catch {
    return { bed: 0, bath: 0, chair: 0 };
  }
}

export function StreetRoom({
  name,
  onLeave,
  onGo,
}: {
  name: "Bed" | "Bath" | "Hall";
  onLeave: () => void;
  onGo: (room: "Kitchen" | "Bed" | "Bath" | "Hall") => void;
}) {
  const [furnish, setFurnish] = useState(readFurnish());
  const [used, setUsed] = useState(readUse);
  const [line, setLine] = useState("");
  const [locked, setLocked] = useState(true);
  const [note, setNote] = useState("");
  const [cameFrom] = useState(() => {
    if (typeof sessionStorage === "undefined") return "";
    const value = sessionStorage.getItem("ndu-came-from") || "";
    sessionStorage.removeItem("ndu-came-from");
    return value;
  });
  const night = new Date().getHours() >= 19 || new Date().getHours() < 6;

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(furnish));
  }, [furnish]);

  useEffect(() => {
    setLine(localStorage.getItem(LINE_KEY) || "");
    setLocked(localStorage.getItem(LOCK_KEY) !== "open");
  }, []);

  function ready(kind: "bed" | "bath" | "chair") {
    return Date.now() - used[kind] >= GAP;
  }

  function mark(kind: "bed" | "bath" | "chair") {
    const next = { ...used, [kind]: Date.now() };
    setUsed(next);
    localStorage.setItem(USE_KEY, JSON.stringify(next));
  }

  function go(room: "Kitchen" | "Bed" | "Bath" | "Hall") {
    sessionStorage.setItem("ndu-came-from", name);
    onGo(room);
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className={`bg-surface relative max-h-[92dvh] w-full max-w-md overflow-auto rounded-3xl p-4 ${night ? "ring-1 ring-black/40" : ""}`}>
        {night ? <div className="pointer-events-none absolute inset-0 rounded-3xl bg-black/40" /> : null}
        <div className="relative">
          <h2 className="font-display text-2xl">{name === "Bed" ? "Bedroom" : name === "Bath" ? "Bathroom" : "Hall"}</h2>
          {cameFrom ? <p className="text-muted mt-1 text-sm">You came from the {cameFrom}.</p> : null}
          <p className="text-muted mt-1 text-sm">The street is outside this window. {night ? "The phone clock says it is night." : "The phone clock says it is day."}</p>
          <ul className="text-muted mt-2 space-y-1 text-xs">
            {["Hall", "Bed", "Bath", "Kitchen"].map((room) => (
              <li key={room}>{room}</li>
            ))}
          </ul>
          {name === "Hall" ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-2xl p-3" style={{ background: furnish.wall }}>
                <div className="flex flex-wrap gap-2">
                  {furnish.pieces.map((piece) => (
                    <span key={piece} className="bg-surface rounded-full px-3 py-2 text-sm">
                      {piece}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button key={color} type="button" className="size-10 rounded-full border border-white/30" style={{ background: color }} onClick={() => setFurnish({ ...furnish, wall: color })} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {furnish.pieces.map((piece, index) => (
                  <input
                    key={PIECES[index]}
                    value={piece}
                    aria-label={`Furniture ${index + 1}`}
                    className="bg-bg min-h-10 rounded-full px-3 text-sm"
                    onChange={(event) => {
                      const pieces = [...furnish.pieces];
                      pieces[index] = event.target.value.slice(0, 24);
                      setFurnish({ ...furnish, pieces });
                    }}
                    onBlur={() => {
                      setFurnish((current) => {
                        const pieces = current.pieces.map((item, i) => (item.trim() ? item.trim() : PIECES[i]));
                        return { ...current, pieces };
                      });
                    }}
                  />
                ))}
              </div>
              <label className="block text-sm">
                Wall line
                <input
                  value={line}
                  className="bg-bg mt-1 min-h-11 w-full rounded-full px-3 text-sm"
                  onChange={(event) => {
                    const next = event.target.value.slice(0, 80);
                    setLine(next);
                    localStorage.setItem(LINE_KEY, next);
                  }}
                />
              </label>
              {locked ? <p className="text-muted text-xs">The wall line is hidden from the street. It stays on this phone.</p> : <p className="text-sm">{line || "The wall is blank."}</p>}
              <button
                type="button"
                className="bg-bg min-h-11 w-full rounded-full text-sm"
                onClick={() => {
                  const next = !locked;
                  setLocked(next);
                  localStorage.setItem(LOCK_KEY, next ? "locked" : "open");
                }}
              >
                {locked ? "Unlock the wall line" : "Lock the wall line"}
              </button>
              <button
                type="button"
                className="bg-bg min-h-11 w-full rounded-full text-sm"
                onClick={() => {
                  if (!ready("chair")) {
                    setNote("You just sat. Wait a minute.");
                    return;
                  }
                  mark("chair");
                  setNote("You sit. Ease moves a little.");
                }}
              >
                Sit in the chair
              </button>
            </div>
          ) : null}
          {name === "Bed" ? (
            <button
              type="button"
              className="bg-accent text-bg mt-4 min-h-11 w-full rounded-full text-sm"
              onClick={() => {
                if (!ready("bed")) {
                  setNote("The bed was just used.");
                  return;
                }
                mark("bed");
                liveAct("rest", "Bedroom");
                setNote("You rest.");
              }}
            >
              Rest
            </button>
          ) : null}
          {name === "Bath" ? (
            <button
              type="button"
              className="bg-accent text-bg mt-4 min-h-11 w-full rounded-full text-sm"
              onClick={() => {
                if (!ready("bath")) {
                  setNote("The bath was just used.");
                  return;
                }
                mark("bath");
                liveAct("wash", "Bathroom");
                setNote("You wash.");
              }}
            >
              Wash
            </button>
          ) : null}
          {note ? <p className="mt-3 text-sm">{note}</p> : null}
          {name === "Hall" ? <KidsDoor /> : null} {/* NDU-UPG kids */}
          <div className="mt-4 flex gap-2">
            {(["Hall", "Kitchen", "Bed", "Bath"] as const)
              .filter((room) => room !== name)
              .map((room) => (
                <button key={room} type="button" className="bg-bg min-h-11 flex-1 rounded-full text-sm" onClick={() => go(room)}>
                  {room}
                </button>
              ))}
          </div>
          <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={onLeave}>
            Back to the street
          </button>
        </div>
      </div>
    </div>
  );
}
