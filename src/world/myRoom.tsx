import { lazy, Suspense, useEffect, useState } from "react";
import { KidsDoor } from "@/world/kids/door"; // NDU-UPG kids

// NDU-AI safe-ingest #1/#2/#4: lazy so onnxruntime and the checks never ride in the map's first download.
const SafePhotoSheet = lazy(() => import("@/world/ingest/SafePhotoSheet"));
const ListingCheckHint = lazy(() => import("@/world/ingest/ListingCheckHint"));
/** Room photos stay on this phone as a data URL; 130 kB of JPEG keeps it under the old 180 kB cap. */
const ROOM_PHOTO_BYTES = 130000;

type Scope = "Personal" | "Family";
type Item = { id: string; name: string; scope: Scope; photo: string; receipt: string; at: string; hash: string };
type Challenge = { id: string; itemId: string; text: string; at: string };

const KEY = "ndu-room";
const SALT = "ndu-room-salt";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "") as T;
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

async function digest(text: string) {
  let salt = localStorage.getItem(SALT);
  if (!salt) {
    salt = crypto.randomUUID();
    localStorage.setItem(SALT, salt);
  }
  const bytes = new TextEncoder().encode(`${salt}:${text}`);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((n) => n.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function MyRoom({ onLeave }: { onLeave: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("Personal");
  const [receipt, setReceipt] = useState("");
  const [photo, setPhoto] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [challenge, setChallenge] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<File | null>(null); // NDU-AI safe-ingest

  useEffect(() => {
    setItems(read<Item[]>(KEY, []));
    setChallenges(read<Challenge[]>("ndu-room-challenges", []));
  }, []);

  function save(next: Item[]) {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  async function add() {
    const clean = name.trim().slice(0, 40);
    const proof = receipt.trim().slice(0, 240);
    if (!clean || !proof) return;
    if (items.length >= 3) {
      setNote("Three things is the limit in this room.");
      return;
    }
    const row: Item = {
      id: crypto.randomUUID(),
      name: clean,
      scope,
      photo,
      receipt: proof,
      at: new Date().toISOString(),
      hash: await digest(proof),
    };
    save([row, ...items]);
    setName("");
    setReceipt("");
    setPhoto("");
    setNote("Saved on this phone only. This is not a title.");
  }

  function fileChallenge(itemId: string) {
    const text = challenge.trim().slice(0, 180);
    if (!text) return;
    const next = [{ id: crypto.randomUUID(), itemId, text, at: new Date().toISOString() }, ...challenges].slice(0, 12);
    setChallenges(next);
    localStorage.setItem("ndu-room-challenges", JSON.stringify(next));
    setChallenge("");
    setNote("Challenge saved. It does not decide who owns the thing.");
  }

  function removeItem(item: Item) {
    save(items.filter((row) => row.id !== item.id));
    const prior = read<{ at: string; hash: string }[]>("ndu-room-deletions", []);
    const next = [{ at: new Date().toISOString(), hash: item.hash }, ...prior].slice(0, 20);
    localStorage.setItem("ndu-room-deletions", JSON.stringify(next));
    if (open === item.id) setOpen(null);
    setNote("Deleted on this phone. The receipt text is gone. The log keeps the short hash only.");
  }

  function exportRoom() {
    const blob = new Blob([JSON.stringify({ items, note: "Not a title." }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-room.json";
    link.click();
    URL.revokeObjectURL(url);
    setNote("Downloaded. This file is not a title.");
  }

  const shown = items.find((item) => item.id === open);

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end overflow-auto p-3 sm:place-items-center">
      <div className="bg-surface max-h-[92dvh] w-full max-w-md overflow-auto rounded-3xl p-4">
        <h2 className="font-display text-2xl">My room</h2>
        <p className="text-muted mt-1 text-sm">
          Tag up to three things as Personal or Family. The receipt stays on this phone. The card shows a short hash, not the receipt, and not the address. This is not land title and it cannot be sold here.
        </p>
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="What is it" className="bg-bg min-h-11 w-full rounded-full px-4 text-sm" />
          <div className="flex gap-2">
            {(["Personal", "Family"] as const).map((kind) => (
              <button key={kind} type="button" className={`min-h-10 flex-1 rounded-full text-sm ${scope === kind ? "bg-accent text-bg" : "bg-bg"}`} onClick={() => setScope(kind)}>
                {kind}
              </button>
            ))}
          </div>
          <textarea value={receipt} onChange={(event) => setReceipt(event.target.value)} placeholder="Receipt or note" className="bg-bg min-h-20 w-full rounded-2xl px-4 py-3 text-sm" />
          <input
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={(event) => {
              // NDU-AI safe-ingest: every photo goes through the on-device check (strip, NSFW gate, face blur, resize)
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setPicked(file);
            }}
          />
          {photo ? <img src={photo} alt="" className="h-16 w-16 rounded-xl object-cover" /> : null}
          <Suspense fallback={null}>
            <ListingCheckHint text={`${name}\n${receipt}`} what="claim" />
          </Suspense>
          <button type="submit" className="bg-accent text-bg min-h-11 w-full rounded-full text-sm">
            Keep in this room
          </button>
        </form>
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="bg-bg min-h-11 w-full rounded-2xl px-3 text-left text-sm" onClick={() => setOpen(item.id)}>
                {item.name} · {item.scope}
              </button>
            </li>
          ))}
        </ul>
        {shown ? (
          <div className="bg-bg mt-3 rounded-2xl p-3">
            {shown.photo ? <img src={shown.photo} alt="" className="mb-2 h-28 w-full rounded-xl object-cover" /> : null}
            <p className="text-sm font-medium">{shown.name}</p>
            <p className="text-muted mt-1 text-sm">Claimed {new Date(shown.at).toLocaleString()}. Hash {shown.hash}.</p>
            <p className="mt-2 text-sm">{shown.receipt}</p>
            <p className="text-muted mt-2 text-xs">Not land title. Not a vehicle paper. The registry is the registry. This challenge does not decide ownership.</p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                fileChallenge(shown.id);
              }}
            >
              <input value={challenge} onChange={(event) => setChallenge(event.target.value)} placeholder="Challenge this claim" className="bg-surface min-h-10 min-w-0 flex-1 rounded-full px-3 text-sm" />
              <button type="submit" className="bg-surface min-h-10 rounded-full px-3 text-sm">
                File
              </button>
            </form>
            <button type="button" className="bg-surface mt-2 min-h-10 rounded-full px-3 text-sm" onClick={() => removeItem(shown)}>
              Delete this thing
            </button>
            <ul className="mt-2 space-y-1">
              {challenges
                .filter((row) => row.itemId === shown.id)
                .map((row) => (
                  <li key={row.id} className="text-muted text-xs">
                    Open challenge · {row.text}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {note ? <p className="text-muted mt-3 text-sm">{note}</p> : null}
        {picked ? (
          <Suspense fallback={null}>
            <SafePhotoSheet
              file={picked}
              maxBytes={ROOM_PHOTO_BYTES}
              maxSide={1024}
              onCancel={() => setPicked(null)}
              onDone={(blob, summary) => {
                setPicked(null);
                const reader = new FileReader();
                reader.onload = () => {
                  const data = typeof reader.result === "string" ? reader.result : "";
                  if (data.length > 180000) {
                    setNote("That photo is too large for this phone.");
                    return;
                  }
                  setPhoto(data);
                  setNote(summary.removed.length ? `Photo ready. Removed: ${[...new Set(summary.removed)].join(", ")}.` : "Photo ready.");
                };
                reader.readAsDataURL(blob);
              }}
            />
          </Suspense>
        ) : null}
        <KidsDoor /> {/* NDU-UPG kids */}
        <button type="button" className="bg-bg mt-4 min-h-11 w-full rounded-full text-sm" onClick={exportRoom}>
          Download a file. Not a title.
        </button>
        <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={onLeave}>
          Back to the street
        </button>
      </div>
    </div>
  );
}
