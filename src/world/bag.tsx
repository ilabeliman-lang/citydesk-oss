import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Bubble } from "@/world/bubbles/Bubble"; // NDU-UPG bubbles

const KEY = "ndu-bag";

function readBag(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string").slice(0, 12);
  } catch {
    return [];
  }
}

/** NDU-UPG inspect (#04): put one thing in the bag (same list and 12-item cap as BagButton). */
export function addToBag(name: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const items = readBag();
  if (items.length >= 12) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify([...items, name.slice(0, 60)]));
    return true;
  } catch {
    return false;
  }
}

export function BagButton({ bubble = false }: { bubble?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    setItems(readBag());
  }, []);

  function save(next: string[]) {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  return (
    <>
      {bubble ? (
        // NDU-UPG bubbles: same bag, as a small bubble with the item count
        <Bubble size="sm" label={items.length ? `Bag, ${items.length} things` : "Bag"} badge={items.length} onClick={() => setOpen(true)}>
          <ShoppingBag aria-hidden="true" />
        </Bubble>
      ) : (
        <button type="button" className="bg-bg min-h-10 rounded-full px-3 text-sm" onClick={() => setOpen(true)}>
          Bag{items.length ? ` ${items.length}` : ""}
        </button>
      )}
      {open ? (
        <div className="bg-bg/80 fixed inset-0 z-[650] grid place-items-end p-3 sm:place-items-center">
          <div className="bg-surface w-full max-w-md rounded-3xl p-4">
            <h2 className="font-display text-2xl">Bag</h2>
            <p className="text-muted mt-1 text-sm">Things you are carrying. They stay on this phone.</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = text.trim().slice(0, 40);
                if (!name || items.length >= 12) return;
                save([...items, name]);
                setText("");
              }}
            >
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Name a thing"
                className="bg-bg min-h-11 flex-1 rounded-full px-4 text-sm"
              />
              <button type="submit" className="bg-accent text-bg min-h-11 rounded-full px-4 text-sm">
                Put in
              </button>
            </form>
            <ul className="mt-3 space-y-2">
              {items.length ? null : <li className="text-muted text-sm">The bag is empty.</li>}
              {items.map((item, index) => (
                <li key={`${item}-${index}`} className="bg-bg flex items-center gap-2 rounded-2xl px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm">{item}</span>
                  <button
                    type="button"
                    className="min-h-10 rounded-full px-3 text-sm"
                    onClick={() => save(items.filter((_, i) => i !== index))}
                  >
                    Take out
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="bg-bg mt-4 min-h-11 w-full rounded-full text-sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
