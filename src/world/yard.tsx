import { useEffect, useState } from "react";
import { payVouchers, vouchers } from "@/game/sim";
import { useSim } from "@/game/useSim";
import { buyFuel, getYard, saveYard, YARD_KINDS, type YardKind, type YardPiece } from "@/world/businesses";

const LABEL: Record<YardKind, string> = {
  pump: "Pump",
  canopy: "Canopy",
  shop: "Shop",
  office: "Office",
  wash: "Wash",
  gate: "Gate",
};

export function YardSheet({
  businessId,
  userId,
  onClose,
}: {
  businessId: string;
  userId: string | null;
  onClose: () => void;
}) {
  const snap = useSim();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [pieces, setPieces] = useState<YardPiece[]>([]);
  const [price, setPrice] = useState(12);
  const [tool, setTool] = useState<YardKind>("pump");
  const [design, setDesign] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getYard({ data: businessId }).then((yard) => {
      if (!yard) {
        setErr("This place is not open.");
        return;
      }
      setName(yard.name);
      setCategory(yard.category);
      setOwnerId(yard.ownerId);
      setPieces(yard.pieces);
      setPrice(yard.fuelPrice);
    });
  }, [businessId]);

  const mine = Boolean(userId && ownerId && userId === ownerId);
  const station = category === "station";

  function paint(x: number, y: number) {
    if (!design) return;
    setPieces((current) => {
      const without = current.filter((piece) => piece.x !== x || piece.y !== y);
      const occupied = current.find((piece) => piece.x === x && piece.y === y);
      if (occupied?.k === tool) return without;
      return [...without, { k: tool, x, y }];
    });
  }

  async function save() {
    setErr("");
    const result = await saveYard({ data: { id: businessId, pieces, fuelPrice: price } });
    setErr(result.ok ? "Yard saved." : result.reason);
  }

  async function fill() {
    if (busy) return;
    setBusy(true);
    setErr("");
    if (vouchers() < price) {
      setErr("Not enough game vouchers.");
      setBusy(false);
      return;
    }
    const result = await buyFuel({ data: businessId });
    if (!result.ok) {
      setErr(result.reason);
      setBusy(false);
      return;
    }
    payVouchers(`Fuel at ${result.name ?? name}`, result.price);
    setErr("Filled. Game vouchers only. This does not fuel a real car.");
    setBusy(false);
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface max-h-[86dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">{name || "Yard"}</h2>
          <button type="button" className="bg-bg min-h-11 rounded-xl px-3 text-sm" onClick={onClose}>
            Leave
          </button>
        </div>
        <p className="text-muted text-sm">
          Outside is the satellite map. This room is the inside, arranged by the owner.
          {station ? " A fill costs game vouchers." : ""}
        </p>
        <div className="bg-[#1a1511] grid grid-cols-6 gap-1 rounded-2xl p-2">
          {Array.from({ length: 24 }, (_, index) => {
            const x = index % 6;
            const y = Math.floor(index / 6);
            const piece = pieces.find((item) => item.x === x && item.y === y);
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                className={`min-h-11 rounded-lg text-[10px] ${piece ? "bg-accent text-bg" : "bg-[#2c241c] text-muted"}`}
                onClick={() => paint(x, y)}
              >
                {piece ? LABEL[piece.k] : ""}
              </button>
            );
          })}
        </div>
        {mine ? (
          <div className="space-y-2">
            <button type="button" className="bg-bg min-h-11 w-full rounded-full text-sm" onClick={() => setDesign((value) => !value)}>
              {design ? "Stop designing" : "Design this place"}
            </button>
            {design ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {YARD_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`min-h-10 rounded-full px-3 text-sm ${tool === kind ? "bg-accent text-bg" : "bg-bg"}`}
                      onClick={() => setTool(kind)}
                    >
                      {LABEL[kind]}
                    </button>
                  ))}
                </div>
                {station ? (
                  <div className="flex gap-2">
                    {[8, 12, 20].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className={`min-h-10 flex-1 rounded-full text-sm ${price === amount ? "bg-accent text-bg" : "bg-bg"}`}
                        onClick={() => setPrice(amount)}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="bg-accent text-bg min-h-11 w-full rounded-full text-sm" onClick={() => void save()}>
                  Save the yard
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {station && pieces.some((piece) => piece.k === "pump") && !design ? (
          <button type="button" className="bg-accent text-bg min-h-11 w-full rounded-full text-sm" disabled={busy} onClick={() => void fill()}>
            Buy a fill · {price} game vouchers · you have {vouchers(snap)}
          </button>
        ) : null}
        {err ? <p className="text-sm">{err}</p> : null}
      </div>
    </div>
  );
}
