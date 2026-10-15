import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SessionAuthForm } from "@/components/auth/SessionAuthForm";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { adminBoard, adminSetManager, adminSetOpen } from "@/world/admin";
import { checkIn, setVerified } from "@/world/businesses";
import "@/world/ingest/ingest.css"; // NDU-AI safe-ingest #4 review flags

export const Route = createFileRoute("/admin")({ component: AdminPortal });

type Board = Awaited<ReturnType<typeof adminBoard>>;
type Tab = "places" | "bookings" | "fuel" | "managers";

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function AdminPortal() {
  return (
    <main className="bg-bg text-fg min-h-dvh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-3xl">Managers</h1>
          <Link to="/" className="bg-surface min-h-11 rounded-full px-4 py-2 text-sm">
            Map
          </Link>
        </div>
        <p className="text-muted text-sm">Reports stay on each phone. There is no server queue.</p>
        <SignedOut>
          <div className="space-y-3">
            <p className="text-muted text-sm">Sign in with your manager account to run the city.</p>
            <SessionAuthForm callbackURL="/admin" compact />
          </div>
        </SignedOut>
        <SignedIn>
          <Desk />
        </SignedIn>
      </div>
    </main>
  );
}

function Desk() {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("places");
  const [email, setEmail] = useState("");

  async function load() {
    try {
      setBoard(await adminBoard());
      setErr("");
    } catch {
      setErr("Managers only. This account is not on the list.");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, []);

  if (!board && !err) return <p className="text-sm">Opening the desk.</p>;
  if (!board) return <p className="text-sm">{err}</p>;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Open places" value={String(board.open)} />
        <Stat label="Verified" value={String(board.verified)} />
        <Stat label="Appointments" value={String(board.bookings)} />
        <Stat label="Fills" value={`${board.fills} · ${board.fuelVouchers}`} />
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {(
          [
            ["places", "Places"],
            ["bookings", "Bookings"],
            ["fuel", "Fuel"],
            ["managers", "Managers"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${tab === id ? "bg-accent text-bg" : "bg-surface"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "places"
        ? board.places.map((place) => (
            <article key={place.id} className="bg-surface space-y-2 rounded-2xl p-3">
              <p className="text-sm">
                {place.name} · {place.category}
                {place.verified ? " · Verified" : ""}
                {place.open ? "" : " · Closed"}
              </p>
              <p className="text-muted text-xs">
                {place.listing === "pin_checked" ? "Pin checked" : "Self-listed"} · {place.offer}
                {place.category === "station" ? ` · fill ${place.fuelPrice}` : ""}
              </p>
              {/* NDU-AI safe-ingest #4: scam / impersonation review flag (a manager decides; nothing is banned) */}
              {place.review ? (
                <p className={`ndu-review-flag ndu-review-flag--${place.review.level}`} role="note">
                  <span aria-hidden="true">⚑</span> Check this listing: {place.review.reasons.join(" · ")}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="bg-accent text-bg min-h-11 flex-1 rounded-full text-sm"
                  onClick={() => void setVerified({ data: { id: place.id, verified: !place.verified } }).then(load)}
                >
                  {place.verified ? "Remove badge" : "Give badge"}
                </button>
                <button
                  type="button"
                  className="bg-bg min-h-11 flex-1 rounded-full text-sm"
                  onClick={() => void adminSetOpen({ data: { id: place.id, open: !place.open } }).then(load)}
                >
                  {place.open ? "Close" : "Reopen"}
                </button>
              </div>
            </article>
          ))
        : null}
      {tab === "bookings"
        ? board.visits.map((visit) => (
            <article key={visit.id} className="bg-surface space-y-2 rounded-2xl p-3">
              <p className="text-sm">{visit.businessName}</p>
              <p className="text-muted text-xs">
                {when(visit.startsAt)} · {visit.guest} · {visit.status === "checked_in" ? "Checked in" : visit.status}
                {visit.note ? ` · ${visit.note}` : ""}
              </p>
              {visit.status === "booked" ? (
                <button type="button" className="bg-accent text-bg min-h-11 w-full rounded-full text-sm" onClick={() => void checkIn({ data: visit.id }).then(load)}>
                  Check in
                </button>
              ) : null}
            </article>
          ))
        : null}
      {tab === "bookings" && board.visits.length === 0 ? <p className="text-sm">No appointments in the last day.</p> : null}
      {tab === "fuel"
        ? board.sales.map((sale) => (
            <article key={sale.id} className="bg-surface rounded-2xl p-3">
              <p className="text-sm">{sale.businessName}</p>
              <p className="text-muted text-xs">
                {sale.guest} · {sale.vouchers} game vouchers · {when(sale.at)}
              </p>
            </article>
          ))
        : null}
      {tab === "fuel" && board.sales.length === 0 ? <p className="text-sm">No fills yet.</p> : null}
      {tab === "managers" ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void adminSetManager({ data: { email, allow: true } }).then(() => {
              setEmail("");
              return load();
            });
          }}
        >
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Manager email"
            className="bg-surface min-h-11 flex-1 rounded-xl px-3"
          />
          <button type="submit" className="bg-accent text-bg min-h-11 rounded-full px-4 text-sm">
            Add
          </button>
        </form>
      ) : null}
      {tab === "managers"
        ? board.managers.map((manager) => (
            <div key={manager} className="bg-surface flex items-center justify-between gap-2 rounded-2xl px-3 py-2">
              <p className="truncate text-sm">{manager}</p>
              <button
                type="button"
                className="bg-bg min-h-11 rounded-full px-3 text-sm"
                onClick={() => void adminSetManager({ data: { email: manager, allow: false } }).then(load)}
              >
                Remove
              </button>
            </div>
          ))
        : null}
      {err ? <p className="text-sm">{err}</p> : null}
      <p className="text-muted text-xs">This desk refreshes on its own. A badge is a manager’s word. Fuel numbers are game vouchers, not cash.</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-2xl px-3 py-3">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-display text-2xl">{value}</p>
    </div>
  );
}
