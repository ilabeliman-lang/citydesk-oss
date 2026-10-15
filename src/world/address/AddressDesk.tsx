import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useWorkverseStore } from "@/world/workverse/store";
import { clearPortrait, readPortrait, savePortrait, shrinkFace } from "./portrait";
import { myRole } from "./addressRole";
import { claimAddressHold, kickExpireAddressHolds, listAddressHolds, revokeAddressHold, type AddressHold } from "./addressHolds";
import { OfficeFloor } from "@/world/office/OfficeFloor";

type HoldKind = AddressHold["kind"];

/** Who is holding this address. The council is not offered here. Holds live in the database. */
export function AddressDesk({ flagship }: { flagship: boolean }) {
  const { user } = useCurrentUserState();
  const shape = useWorkverseStore((s) => s.spotShape);
  const floor = useWorkverseStore((s) => s.currentFloor) + 1;
  const [rows, setRows] = useState<AddressHold[]>([]);
  const [unit, setUnit] = useState("A");
  const [note, setNote] = useState<string | null>(null);
  const [operator, setOperator] = useState(false);
  const [face, setFace] = useState<string | null>(null);

  const addressId = shape?.type === "building" ? shape.key : null;
  const levels = shape?.type === "building" ? shape.levels : 1;
  const label = shape?.type === "building" ? shape.name || "This address" : "This place";

  useEffect(() => {
    if (!addressId) {
      setRows([]);
      return;
    }
    let dead = false;
    // NDU-UPG u-046: sweep expired holds whenever the desk opens (idempotent,
    // fire-and-forget, never throws). The desk is the natural cron tick — it is
    // the surface that shows hold occupancy, so stale rows must be cleared here.
    void kickExpireAddressHolds().catch(() => undefined);
    void listAddressHolds({ data: { addressId } })
      .then((r) => { if (!dead) setRows(r.holds); })
      .catch(() => { if (!dead) setNote("The address book did not load."); });
    return () => { dead = true; };
  }, [addressId]);

  useEffect(() => setFace(readPortrait()), []);
  useEffect(() => {
    let dead = false;
    void myRole().then((r) => { if (!dead) setOperator(r.role === "operator"); }).catch(() => undefined);
    return () => { dead = true; };
  }, [user?.id]);

  const take = (kind: HoldKind) => {
    if (!user || !addressId) {
      setNote("Register and sign in to hold an address.");
      return;
    }
    const flat = unit.trim().slice(0, 6).toUpperCase();
    void claimAddressHold({
      data: { addressId, label, storeys: levels, kind, floor: kind === "title" ? 0 : floor, unit: kind === "flat" ? flat : "" },
    }).then((r) => {
      setRows(r.holds);
      setNote(r.ok ? "Saved to this address." : r.reason);
    }).catch(() => setNote("Could not save the hold."));
  };

  const remove = (h: AddressHold) => {
    if (!addressId) return;
    void revokeAddressHold({ data: { addressId, userId: h.userId, kind: h.kind, floor: h.floor, unit: h.unit } })
      .then((r) => setRows(r.holds))
      .catch(() => setNote("Could not remove that hold."));
  };

  const dressed = Boolean(user && rows.some((h) => h.userId === user.id && (h.kind === "title" || (h.floor === floor && (h.kind === "floor" || h.kind === "flat")))));

  return (
    <aside className="pointer-events-auto absolute bottom-4 left-3 z-[640] w-[min(18rem,calc(100%-1.5rem))] rounded-2xl bg-[#14110e]/92 p-3 text-xs text-[#f6efe2] shadow-lg">
      {flagship ? (
        <>
          <p className="text-sm font-medium">Council office. The desks here belong to the operator. Other buildings are addresses, not another agent office.</p>
          <OfficeFloor />
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-[#d9cbb8]">{levels} storey{levels === 1 ? "" : "s"}. Title can be shared. One renter to a floor. Flats split a storey.</p>
          <ul className="mt-2 space-y-1">
            {rows.length === 0 ? <li className="text-[#d9cbb8]">No one holds this address yet.</li> : null}
            {rows.map((h) => (
              <li key={`${h.userId}-${h.kind}-${h.floor}-${h.unit}`} className="flex items-center justify-between gap-2">
                <span>{h.name} · {h.kind === "title" ? "title" : h.kind === "floor" ? `floor ${h.floor}` : `flat ${h.unit}`}</span>
                {user && (operator || user.id === h.userId) ? (
                  <button type="button" className="min-h-8 rounded-full bg-white/10 px-2" onClick={() => remove(h)}>Remove</button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            <button type="button" className="min-h-9 rounded-full bg-[#e8843a] px-3 text-[#1a1511]" onClick={() => take("title")}>Share title</button>
            <button type="button" className="min-h-9 rounded-full bg-white/10 px-3" onClick={() => take("floor")}>Rent floor {floor}</button>
            <button type="button" className="min-h-9 rounded-full bg-white/10 px-3" onClick={() => take("flat")}>Flat</button>
            <input aria-label="Flat letter" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9 w-12 rounded-full bg-black/30 px-2 text-center" />
          </div>
          {dressed ? <p className="mt-2 text-[#d9cbb8]">You can dress floor {floor}.</p> : null}
        </>
      )}
      <label className="mt-3 block">
        <span className="text-[#d9cbb8]">Your photo, on your figure only</span>
        <input
          type="file"
          accept="image/*"
          className="mt-1 block w-full text-[11px]"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void shrinkFace(file).then((url) => {
              if (url.length > 140_000 || !savePortrait(url)) setNote("That photo is too large.");
              else setFace(url);
            }).catch(() => setNote("That photo could not be used."));
          }}
        />
      </label>
      {face ? <button type="button" className="mt-1 underline" onClick={() => { clearPortrait(); setFace(null); }}>Remove photo</button> : null}
      {operator ? <p className="mt-2 text-[#e8c9a4]">Operator. You can remove a hold. The council is not copied into this building.</p> : null}
      {note ? <p className="mt-1">{note}</p> : null}
    </aside>
  );
}
