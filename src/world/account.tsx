import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router"; // NDU-UPG sessions
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { listMine, savePlace } from "@/world/businesses";
import { wipeCrewMemory } from "@/world/robotLife";
import { A11yPrefs } from "@/world/a11y/A11yPrefs"; // NDU cat 12 basics
import { PropertyDesk } from "@/world/property-ui/PropertyDesk"; // NDU-UPG property-ui
import { SessionAuthForm } from "@/components/auth/SessionAuthForm";

type Place = { id: string; name: string; category: string; offer: string; open: boolean };

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser();
  const [places, setPlaces] = useState<Place[]>([]);
  const [note, setNote] = useState("");
  const [confirmNotes, setConfirmNotes] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false); // NDU-UPG property-ui

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    void listMine()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [user]);

  return (
    <div className="bg-bg/80 fixed inset-0 z-[680] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface max-h-[90dvh] w-full max-w-md overflow-auto rounded-3xl p-4">
        <h2 className="font-display text-2xl">Account</h2>
        {user && !user.isDevFallback ? (
          <>
            <p className="text-muted mt-1 text-sm">{user.primaryEmail || user.displayName}</p>
            <ul className="mt-4 space-y-3">
              {places.length ? null : <li className="text-muted text-sm">You have no place yet. Register one from Needs.</li>}
              {places.map((place) => (
                <PlaceRow key={place.id} place={place} onSaved={setNote} />
              ))}
            </ul>
            {/* NDU-UPG sessions: where this account is signed in */}
            <Link to="/account/sessions" className="bg-bg mt-4 grid min-h-11 w-full place-items-center rounded-full text-sm" onClick={onClose}>
              Sessions and devices
            </Link>
            {/* NDU-UPG property-ui */}
            <button type="button" className="bg-bg mt-2 grid min-h-11 w-full place-items-center rounded-full text-sm" onClick={() => setRecordsOpen(true)}>
              Records
            </button>
            <A11yPrefs />
          </>
        ) : (
          <div className="mt-4">
            <SessionAuthForm compact onSuccess={onClose} />
          </div>
        )}
        {note ? <p className="text-muted mt-3 text-sm">{note}</p> : null}
        <button
          type="button"
          className="bg-bg mt-4 min-h-11 w-full rounded-full text-sm"
          onClick={() => {
            for (const key of ["ndu-room", "ndu-room-challenges", "ndu-room-salt", "ndu-partners", "ndu-floors", "ndu-bag", "ndu-furnish", "ndu-met", "ndu-apps"]) {
              localStorage.removeItem(key);
            }
            setPlaces([]);
            setNote("Cleared on this phone. Server listings stay until you close them.");
          }}
        >
          Clear this phone
        </button>
        <p className="text-muted mt-4 text-sm">Clearing notes on this phone does not delete a server business and it is not a land title.</p>
        {confirmNotes ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="bg-bg min-h-11 flex-1 rounded-full text-sm"
              onClick={() => {
                for (const key of [
                  "ndu-crew",
                  "ndu-partners",
                  "ndu-bag",
                  "ndu-kitchen",
                  "ndu-hall-line",
                  "ndu-furnish",
                  "ndu-room-use",
                  "ndu-room",
                  "ndu-room-challenges",
                  "ndu-room-deletions",
                  "ndu-floors",
                  "ndu-room-hop",
                  "ndu-came-from",
                ]) {
                  localStorage.removeItem(key);
                }
                sessionStorage.removeItem("ndu-came-from");
                wipeCrewMemory();
                setConfirmNotes(false);
                setNote("Notes cleared on this phone.");
              }}
            >
              Confirm clear notes
            </button>
            <button type="button" className="bg-bg min-h-11 flex-1 rounded-full text-sm" onClick={() => setConfirmNotes(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={() => setConfirmNotes(true)}>
            Clear notes on this phone
          </button>
        )}
        <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {recordsOpen ? <PropertyDesk onClose={() => setRecordsOpen(false)} /> : null}
    </div>
  );
}

function PlaceRow({ place, onSaved }: { place: Place; onSaved: (text: string) => void }) {
  const [offer, setOffer] = useState(place.offer);
  return (
    <li className="bg-bg rounded-2xl p-3">
      <p className="text-sm font-medium">
        {place.name} · {place.category}
        {place.open ? "" : " · application"}
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void savePlace({ data: { id: place.id, offer } })
            .then((result) => onSaved(result.reason))
            .catch(() => onSaved("Could not save."));
        }}
      >
        <input value={offer} onChange={(event) => setOffer(event.target.value)} className="bg-surface min-h-10 min-w-0 flex-1 rounded-full px-3 text-sm" />
        <button type="submit" className="bg-accent text-bg min-h-10 rounded-full px-3 text-sm">
          Save
        </button>
      </form>
    </li>
  );
}
