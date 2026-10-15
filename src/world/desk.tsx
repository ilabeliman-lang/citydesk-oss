import { useEffect, useState } from "react";
import {
  bookSeat,
  checkIn,
  listAppointments,
  listForReview,
  listSeats,
  setVerified,
  type Appt,
  type Seat,
} from "@/world/businesses";

function when(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function BookSheet({ businessId, name, onClose }: { businessId: string; name: string; onClose: () => void }) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () => {
      void listSeats({ data: businessId }).then((rows) => {
        if (!stop) setSeats(rows);
      });
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [businessId]);

  async function take(startsAt: string) {
    setErr("");
    const result = await bookSeat({ data: { id: businessId, startsAt, note } });
    if (!result.ok) {
      setErr(result.reason);
      return;
    }
    setErr("Booked. Check in from My appointments when you arrive.");
    const rows = await listSeats({ data: businessId });
    setSeats(rows);
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface max-h-[80dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Book {name}</h2>
          <button type="button" className="bg-bg min-h-11 rounded-xl px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-muted text-sm">Verified places only. Times refresh every few seconds. One seat each.</p>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What you need"
          className="bg-bg min-h-11 w-full rounded-xl px-3"
        />
        <div className="grid gap-2">
          {seats.map((seat) => (
            <button
              key={seat.startsAt}
              type="button"
              disabled={seat.taken}
              className="bg-bg min-h-11 rounded-full px-3 text-sm disabled:opacity-40"
              onClick={() => void take(seat.startsAt)}
            >
              {when(seat.startsAt)}
              {seat.taken ? " · taken" : ""}
            </button>
          ))}
        </div>
        {err ? <p className="text-sm">{err}</p> : null}
      </div>
    </div>
  );
}

export function Appointments({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Appt[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () => {
      void listAppointments().then((next) => {
        if (!stop) setRows(next);
      });
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  async function arrive(id: string) {
    setErr("");
    const result = await checkIn({ data: id });
    if (!result.ok) setErr(result.reason);
    setRows(await listAppointments());
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface max-h-[80dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Appointments</h2>
          <button type="button" className="bg-bg min-h-11 rounded-xl px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-muted text-sm">You, the owner, and a manager see a check-in as soon as it lands.</p>
        {rows.length === 0 ? <p className="text-sm">None open.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="bg-bg rounded-xl px-3 py-2">
            <p className="text-sm">{row.businessName}</p>
            <p className="text-muted text-xs">
              {when(row.startsAt)} · {row.guest} · {row.status === "checked_in" ? "Checked in" : "Booked"}
              {row.note ? ` · ${row.note}` : ""}
            </p>
            {row.status === "booked" ? (
              <button type="button" className="bg-accent text-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={() => void arrive(row.id)}>
                Check in
              </button>
            ) : null}
          </div>
        ))}
        {err ? <p className="text-sm">{err}</p> : null}
      </div>
    </div>
  );
}

export function ManageSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<{ id: string; name: string; category: string; offer: string; listing: string; verified: boolean }[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setRows(await listForReview());
    } catch {
      setErr("Managers only.");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, []);

  async function mark(id: string, verified: boolean) {
    setErr("");
    await setVerified({ data: { id, verified } });
    await load();
    onChanged();
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface max-h-[80dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Verify</h2>
          <button type="button" className="bg-bg min-h-11 rounded-xl px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-muted text-sm">A badge is a manager’s word. It is not a Google pin, and it is what opens booking.</p>
        {rows.map((row) => (
          <div key={row.id} className="bg-bg rounded-xl px-3 py-2">
            <p className="text-sm">
              {row.name} · {row.category}
              {row.verified ? " · Verified" : ""}
            </p>
            <p className="text-muted text-xs">
              {row.listing === "pin_checked" ? "Pin checked" : "Self-listed"} · {row.offer}
            </p>
            <button
              type="button"
              className="bg-accent text-bg mt-2 min-h-11 w-full rounded-full text-sm"
              onClick={() => void mark(row.id, !row.verified)}
            >
              {row.verified ? "Remove badge" : "Give verified badge"}
            </button>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm">No open listings.</p> : null}
        {err ? <p className="text-sm">{err}</p> : null}
      </div>
    </div>
  );
}
