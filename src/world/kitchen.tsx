import { useEffect, useState } from "react";
import { drinkFromHome, liveAct, payVouchers } from "@/game/sim";

type ShelfId = "water" | "fruit" | "snack";
type Shelf = { id: ShelfId; name: string; left: number };

const DEFAULTS: Shelf[] = [
  { id: "water", name: "Water", left: 3 },
  { id: "fruit", name: "Fruit", left: 3 },
  { id: "snack", name: "Snack", left: 3 },
];
const KEY = "ndu-kitchen";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readKitchen(): { shelves: Shelf[]; day: string; cooked: number; opened: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "") as {
      shelves?: { id?: string; name?: string; left?: number }[];
      day?: string;
      cooked?: number;
      opened?: string;
    };
    const shelves = DEFAULTS.map((item) => {
      const saved = raw.shelves?.find((row) => row.id === item.id);
      const name = typeof saved?.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 24) : item.name;
      const left = typeof saved?.left === "number" ? Math.min(3, Math.max(0, Math.round(saved.left))) : item.left;
      return { id: item.id, name, left };
    });
    const day = typeof raw.day === "string" ? raw.day : today();
    if (day !== today()) return { shelves: shelves.map((item) => ({ ...item, left: 3 })), day: today(), cooked: 0, opened: "" };
    return {
      shelves,
      day,
      cooked: typeof raw.cooked === "number" ? Math.max(0, Math.round(raw.cooked)) : 0,
      opened: typeof raw.opened === "string" ? raw.opened : "",
    };
  } catch {
    return { shelves: DEFAULTS, day: today(), cooked: 0, opened: "" };
  }
}

function readBag(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem("ndu-bag") || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function writeBag(next: string[]) {
  localStorage.setItem("ndu-bag", JSON.stringify(next.slice(0, 12)));
}

function partnerNote() {
  try {
    const raw = JSON.parse(localStorage.getItem("ndu-partners") || "[]") as unknown;
    return Array.isArray(raw) && raw.length > 0;
  } catch {
    return false;
  }
}

export function KitchenRoom({ onLeave, onGo }: { onLeave: () => void; onGo: (room: "Bed" | "Bath" | "Hall") => void }) {
  const [open, setOpen] = useState(false);
  const [shelves, setShelves] = useState<Shelf[]>(DEFAULTS);
  const [cooked, setCooked] = useState(0);
  const [opened, setOpened] = useState("");
  const [note, setNote] = useState("");
  const [bag, setBag] = useState<string[]>([]);
  const [bin, setBin] = useState<number | null>(null);
  const [askWater, setAskWater] = useState(false);

  useEffect(() => {
    const saved = readKitchen();
    setShelves(saved.shelves);
    setCooked(saved.cooked);
    setOpened(saved.opened);
    setBag(readBag());
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ shelves, day: today(), cooked, opened }));
  }, [shelves, cooked, opened]);

  function take(id: ShelfId) {
    const row = shelves.find((item) => item.id === id);
    if (!row || row.left < 1) return null;
    setShelves(shelves.map((item) => (item.id === id ? { ...item, left: item.left - 1 } : item)));
    return row;
  }

  function eat(id: ShelfId) {
    const row = take(id);
    if (!row) return;
    drinkFromHome(row.name);
    setNote(`You ate ${row.name}.`);
    setAskWater(false);
  }

  function pack(id: ShelfId) {
    const row = shelves.find((item) => item.id === id);
    if (!row || row.left < 1) return;
    const next = readBag();
    if (next.length >= 12) {
      setNote("The bag is full.");
      return;
    }
    take(id);
    next.push(row.name);
    writeBag(next);
    setBag(next);
    setNote(`${row.name} is in the bag.`);
  }

  function cook() {
    if (!payVouchers("Fuel", 2)) {
      setNote("The purse is short. The pot stays cold.");
      return;
    }
    drinkFromHome("Fruit");
    setCooked((count) => count + 1);
    setNote("A cooked pot fills more than raw fruit.");
  }

  function leave() {
    setOpen(false);
    onLeave();
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface max-h-[92dvh] w-full max-w-md overflow-auto rounded-3xl p-4">
        <h2 className="font-display text-2xl">Kitchen</h2>
        <p className="text-muted mt-1 text-sm">One room. The shelf restocks in the morning. This is not a filmed house, and it is not a gas or wiring claim.</p>
        <p className="text-muted mt-1 text-sm">Kitchen kit · {cooked}</p>
        {partnerNote() ? <p className="mt-2 text-sm">A partner is in the kitchen as a note, not a second fridge.</p> : null}
        <button
          type="button"
          className="bg-bg mt-4 min-h-11 w-full rounded-2xl text-sm"
          onClick={() => {
            setOpen((value) => {
              const next = !value;
              if (next) setOpened(`You opened the fridge · ${new Date().toLocaleTimeString()}`);
              return next;
            });
          }}
        >
          {open ? "Close the fridge" : "Open the fridge"}
        </button>
        {opened ? <p className="text-muted mt-2 text-xs">{opened}</p> : null}
        <div className="perspective-[800px] mt-3">
          <div
            className="bg-bg grid min-h-40 grid-cols-3 gap-2 rounded-2xl p-3 transition-transform duration-500"
            style={{ transform: open ? "rotateY(-8deg)" : "rotateY(72deg)", transformOrigin: "left center" }}
          >
            {open
              ? shelves.map((item) => (
                  <div key={item.id} className="bg-surface rounded-xl p-2 text-sm">
                    <input
                      value={item.name}
                      aria-label={`Rename ${item.id}`}
                      className="bg-bg mb-1 w-full rounded-full px-2 py-1 text-xs"
                      onChange={(event) => {
                        const name = event.target.value.slice(0, 24);
                        setShelves(shelves.map((row) => (row.id === item.id ? { ...row, name } : row)));
                      }}
                      onBlur={() => {
                        setShelves((rows) =>
                          rows.map((row) =>
                            row.id === item.id && !row.name.trim()
                              ? { ...row, name: DEFAULTS.find((entry) => entry.id === item.id)?.name || row.name }
                              : row,
                          ),
                        );
                      }}
                    />
                    <span className="text-muted block text-xs">{item.left} left</span>
                    {item.id === "water" ? (
                      <button type="button" className="bg-bg mt-1 min-h-10 w-full rounded-full text-xs" disabled={item.left < 1} onClick={() => setAskWater(true)}>
                        Water
                      </button>
                    ) : (
                      <div className="mt-1 flex flex-col gap-1">
                        <button type="button" className="bg-bg min-h-10 rounded-full text-xs" disabled={item.left < 1} onClick={() => eat(item.id)}>
                          Eat
                        </button>
                        <button type="button" className="bg-bg min-h-10 rounded-full text-xs" disabled={item.left < 1} onClick={() => pack(item.id)}>
                          Pack
                        </button>
                      </div>
                    )}
                  </div>
                ))
              : null}
          </div>
        </div>
        {askWater ? (
          <div className="mt-3 flex gap-2">
            <button type="button" className="bg-bg min-h-11 flex-1 rounded-full text-sm" onClick={() => eat("water")}>
              Drink
            </button>
            <button
              type="button"
              className="bg-bg min-h-11 flex-1 rounded-full text-sm"
              onClick={() => {
                const row = take("water");
                if (!row) return;
                liveAct("wash", "Kitchen");
                setNote("You used the water to wash.");
                setAskWater(false);
              }}
            >
              Wash
            </button>
          </div>
        ) : null}
        <button type="button" className="bg-accent text-bg mt-3 min-h-11 w-full rounded-full text-sm" onClick={cook}>
          Heat the pot · 2 vouchers
        </button>
        <div className="mt-3">
          <p className="text-sm">Bag</p>
          {bag.length ? (
            bag.map((item, index) => (
              <div key={`${item}-${index}`} className="mt-1 flex gap-2">
                <span className="bg-bg min-h-10 flex-1 rounded-full px-3 py-2 text-sm">{item}</span>
                <button type="button" className="bg-bg min-h-10 rounded-full px-3 text-sm" onClick={() => setBin(index)}>
                  Bin
                </button>
              </div>
            ))
          ) : (
            <p className="text-muted mt-1 text-xs">Nothing packed.</p>
          )}
          {bin !== null ? (
            <button
              type="button"
              className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm"
              onClick={() => {
                const next = readBag().filter((_, index) => index !== bin);
                writeBag(next);
                setBag(next);
                setBin(null);
                setNote("Binned.");
              }}
            >
              Confirm. Drop that one thing.
            </button>
          ) : null}
        </div>
        {note ? <p className="mt-3 text-sm">{note}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="bg-bg min-h-11 flex-1 rounded-full text-sm" onClick={() => onGo("Hall")}>
            Hall
          </button>
          <button type="button" className="bg-bg min-h-11 flex-1 rounded-full text-sm" onClick={() => onGo("Bed")}>
            Bed
          </button>
          <button type="button" className="bg-bg min-h-11 flex-1 rounded-full text-sm" onClick={() => onGo("Bath")}>
            Bath
          </button>
        </div>
        <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={leave}>
          Back to the street
        </button>
      </div>
    </div>
  );
}
