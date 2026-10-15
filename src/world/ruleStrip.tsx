import { useEffect, useState } from "react";

const RULES: Record<string, string> = {
  road: "Stay on the mapped road. The line is the way. This does not change a land title.",
  junction: "At a junction the turn follows the road you are facing. No model picks it.",
  footway: "Feet stay on the foot way when the graph has one. Nothing is sold here.",
  keke: "A keke seat is 5 game vouchers, and only if one is free. Cancel before it starts and they come back.",
  bus: "The bus holds fewer, longer stops. A seat is 5 game vouchers. It is not a paper fare.",
  car: "The car is a stopped node you choose. It is not a vehicle paper.",
  kitchen: "The kitchen spends game vouchers only when you heat the pot. The fridge is not public.",
  fridge: "Fridge food moves hunger and nothing else. The photo stays on this phone.",
  hall: "The hall is a list of rooms, not a second map. The wall line stays on this phone.",
  bed: "The bed moves rest, once a game hour. It does not move the ledger.",
  bath: "The bath moves wash, once a game hour. It does not move the ledger.",
  room: "A receipt is a hash on this phone, not a Certificate of Occupancy.",
  yard: "The yard meters move from the crew's jobs. A model cannot pick a new job.",
  phone: "The phone lists people you tapped. A missed tap leaves no badge.",
  account: "Account notes can be cleared on this phone. That does not delete a server business.",
  tower: "A J2CS floor is a game stack, not a measured building and not a lease.",
  clock: "The clock is the game day. Rent here is a game due, not a bank debt.",
};

// NDU-UPG follow (Wei: screen cluttered): the rule is a small embossed bubble at the top right. It unfolds the
// line when the place changes (or on tap) and folds back by itself after a few seconds, so it never sits on
// the compass / N bubbles.
const RULE_SHOW_MS = 4500;

export function RuleStrip({ place }: { place: string }) {
  const line = RULES[place] ?? RULES.road;
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(true), [place]);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), RULE_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [open, place]);
  return (
    <div className="pointer-events-none flex items-start justify-end gap-2" data-ndu-rule={open ? "open" : "folded"}>
      {open ? (
        <p role="status" className="bg-surface/95 text-muted pointer-events-auto max-w-[min(17rem,70vw)] rounded-2xl px-3 py-2 text-xs leading-snug shadow" onClick={() => setOpen(false)}>
          {line}
        </p>
      ) : null}
      <button
        type="button"
        aria-label={open ? "Hide the rule for this place" : "Show the rule for this place"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto grid size-10 flex-none place-items-center rounded-full text-sm font-bold text-[#f6efe2] active:translate-y-0.5"
        style={{
          background: "radial-gradient(circle at 32% 26%,#4a3b2e 0%,#2c241c 58%,#201912 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.16),inset 0 -3px 6px rgba(0,0,0,.38),0 3px 0 #110d0a,0 8px 18px rgba(0,0,0,.3)",
        }}
      >
        §
      </button>
    </div>
  );
}

export function rulePlace(input: { inside?: string | null; account?: boolean; phone?: boolean; robotVehicle?: string | null }): string {
  if (input.account) return "account";
  if (input.phone) return "phone";
  const name = input.inside ?? "";
  if (name === "Kitchen") return "kitchen";
  if (name === "Bed") return "bed";
  if (name === "Bath") return "bath";
  if (name === "Hall") return "hall";
  if (name === "Room") return "room";
  if (name === "Yard") return "yard";
  if (name === "J2CS" || name === "Car") return name === "Car" ? "car" : "tower";
  if (input.robotVehicle === "keke") return "keke";
  if (input.robotVehicle === "bus") return "bus";
  return "road";
}
