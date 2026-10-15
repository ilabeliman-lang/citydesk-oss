import { useEffect, useState } from "react";
import { liveAct, payVouchers, vouchers } from "@/game/sim";

const KEY = "ndu-floors";

type Floor = { n: number; tower: "East" | "West"; use: "Studio" | "Office" | "Condo" | "Club" };

function floors(): Floor[] {
  const rows: Floor[] = [{ n: 0, tower: "East", use: "Club" }];
  for (let n = 1; n <= 120; n += 1) {
    rows.push({ n, tower: n % 2 ? "East" : "West", use: n === 1 ? "Studio" : n < 60 ? "Office" : "Condo" });
  }
  return rows;
}

function readHeld(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((n) => typeof n === "number").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function Tower({ onLeave, onStudio }: { onLeave: () => void; onStudio: () => void }) {
  const all = floors();
  const [pick, setPick] = useState<Floor>(all[1]);
  const [held, setHeld] = useState<number[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    setHeld(readHeld());
  }, []);

  function takeFloor(floor: Floor) {
    if (held.includes(floor.n)) {
      setNote(`You already hold floor ${floor.n}.`);
      return;
    }
    if (vouchers() < 40) {
      setNote("A floor costs 40 game vouchers.");
      return;
    }
    if (!payVouchers("Floor", 40)) return;
    const next = [...held, floor.n];
    localStorage.setItem(KEY, JSON.stringify(next));
    setHeld(next);
    setNote(`Floor ${floor.n} is yours in this game. It is not a real lease.`);
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface flex max-h-[92dvh] w-full max-w-lg flex-col rounded-3xl p-4">
        <h2 className="font-display text-2xl">J2CS towers</h2>
        <p className="text-muted mt-1 text-sm">East and West. 120 floors, plus the club under the street. Open all day.</p>
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-[112px_1fr] gap-3">
          <ul className="max-h-[50dvh] space-y-1 overflow-auto">
            {all.map((floor) => (
              <li key={`${floor.tower}-${floor.n}`}>
                <button
                  type="button"
                  className={`min-h-10 w-full rounded-full px-2 text-left text-xs ${pick.n === floor.n ? "bg-accent text-bg" : "bg-bg"}`}
                  onClick={() => setPick(floor)}
                >
                  {floor.n === 0 ? "Club" : `F${floor.n}`} · {floor.tower[0]}
                </button>
              </li>
            ))}
          </ul>
          <FloorRoom floor={pick} held={held.includes(pick.n)} onStudio={onStudio} onTake={() => takeFloor(pick)} />
        </div>
        {note ? <p className="text-muted mt-2 text-sm">{note}</p> : null}
        <button type="button" className="bg-bg mt-3 min-h-11 w-full rounded-full text-sm" onClick={onLeave}>
          Back to the street
        </button>
      </div>
    </div>
  );
}

function FloorRoom({
  floor,
  held,
  onStudio,
  onTake,
}: {
  floor: Floor;
  held: boolean;
  onStudio: () => void;
  onTake: () => void;
}) {
  if (floor.use === "Studio") {
    return (
      <div className="bg-bg flex flex-col justify-between rounded-2xl p-3">
        <div>
          <p className="text-sm font-medium">Street studio</p>
          <p className="text-muted mt-1 text-sm">Record and draw live here. The towers rise above this floor.</p>
        </div>
        <button type="button" className="bg-accent text-bg mt-4 min-h-11 rounded-full text-sm" onClick={onStudio}>
          Enter studio
        </button>
      </div>
    );
  }
  if (floor.use === "Club") {
    return (
      <div className="bg-bg rounded-2xl p-3">
        <p className="text-sm font-medium">Basement club</p>
        <p className="text-muted mt-1 text-sm">Open. The floor is dark, the booth is lit, three robots are on the floor.</p>
        <div className="mt-3 flex gap-2">
          {["DJ", "Dancer", "Door"].map((name) => (
            <button key={name} type="button" className="bg-surface min-h-16 flex-1 rounded-2xl text-xs" onClick={() => liveAct("greet", name)}>
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="bg-bg flex flex-col justify-between rounded-2xl p-3">
      <div>
        <p className="text-sm font-medium">
          {floor.tower} tower · floor {floor.n} · {floor.use}
        </p>
        <p className="text-muted mt-1 text-sm">{held ? "You hold this floor in the game." : "Empty. Take it with 40 vouchers."}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="bg-surface min-h-20 rounded-2xl text-sm" onClick={() => liveAct(floor.use === "Condo" ? "rest" : "shift", `Floor ${floor.n}`)}>
            {floor.use === "Condo" ? "Rest" : "Work the desk"}
          </button>
          <button type="button" className="bg-surface min-h-20 rounded-2xl text-sm" onClick={() => liveAct("wash", `Floor ${floor.n}`)}>
            Washroom
          </button>
        </div>
      </div>
      {held ? null : (
        <button type="button" className="bg-accent text-bg mt-4 min-h-11 rounded-full text-sm" onClick={onTake}>
          Take this floor · 40
        </button>
      )}
    </div>
  );
}
