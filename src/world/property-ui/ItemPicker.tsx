// NDU-UPG property-ui
import { useEffect, useState, type FormEvent } from "react";
import { addPropertyItem, deletePropertyItem, listScanItems } from "@/world/property";
import type { ItemView } from "@/world/property";
import { pickItem } from "@/world/picker/items";
import {
  ITEM_CAP,
  canAddItem,
  cleanLabel,
  errMessage,
  scopeLabel,
  slotsLeft,
  statusLabel,
} from "./logic";

/**
 * Items on one scan. Adds a short Personal label, refuses a 4th item in the UI,
 * and deletes an item the owner owns. No photo upload in this pass.
 */
export function ItemPicker({
  scanId,
  selectedId,
  onOpen,
  onRemoved,
}: {
  scanId: string;
  selectedId: string | null;
  onOpen: (itemId: string) => void;
  onRemoved: (itemId: string) => void;
}) {
  // NDU-UPG property-ui
  const [items, setItems] = useState<ItemView[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    setLoadError("");
    setNote("");
    listScanItems({ data: { scanId } })
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch((err) => {
        if (!live) return;
        setItems(null);
        setLoadError(errMessage(err, "Could not load items for that scan."));
      });
    return () => {
      live = false;
    };
  }, [scanId]);

  const full = items !== null && !canAddItem(items.length);
  const label = cleanLabel(draft);
  const listed = items === null ? null : items.filter((item) => pickItem(items, item.id) === item);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (items === null || pending) return;
    if (!label) {
      setNote("Give the item a short label.");
      return;
    }
    if (!canAddItem(items.length)) {
      setNote(`A room holds ${ITEM_CAP} items in this test. Remove one before adding another.`);
      return;
    }
    setPending("add");
    setNote("");
    try {
      const created = await addPropertyItem({
        data: { scanId, label, assetClass: "household", scope: "personal" },
      });
      setItems((prev) => (prev ? [...prev, created] : [created]));
      setDraft("");
    } catch (err) {
      setNote(errMessage(err, "Could not add that item."));
    } finally {
      setPending(null);
    }
  }

  async function remove(item: ItemView) {
    if (!item.isOwner || pending) return;
    setPending(item.id);
    setNote("");
    try {
      await deletePropertyItem({ data: { id: item.id } });
      setItems((prev) => (prev ? prev.filter((row) => row.id !== item.id) : prev));
      onRemoved(item.id);
    } catch (err) {
      setNote(errMessage(err, "Could not remove that item."));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="mt-4" data-item-picker={scanId} aria-label="Items in this scan">
      {items === null && !loadError ? <p className="text-muted text-sm">Loading items…</p> : null}
      {loadError ? (
        <p className="text-sm break-words" role="alert">
          {loadError}
        </p>
      ) : null}
      {listed && listed.length === 0 ? (
        <p className="text-muted text-sm">No items yet. Add a short personal label.</p>
      ) : null}
      {listed && listed.length > 0 ? (
        <ul className="space-y-2">
          {listed.map((item) => (
            <li key={item.id} className="bg-bg flex items-center gap-2 rounded-2xl p-2">
              <button
                type="button"
                className="min-h-11 min-w-0 flex-1 rounded-full px-3 text-left text-sm"
                aria-pressed={selectedId === item.id}
                onClick={() => onOpen(item.id)}
              >
                <span className="block truncate font-medium">{item.label}</span>
                <span className="text-muted block truncate text-xs">
                  {scopeLabel(item.scope)} · {statusLabel(item.status)}
                </span>
              </button>
              {item.isOwner ? (
                <button
                  type="button"
                  className="bg-surface min-h-11 shrink-0 rounded-full px-3 text-sm disabled:opacity-50"
                  onClick={() => void remove(item)}
                  disabled={pending !== null}
                >
                  {pending === item.id ? "Removing…" : "Remove"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {items ? (
        <form className="mt-3 space-y-2" onSubmit={(event) => void add(event)}>
          <p className="text-muted text-xs">
            {full
              ? `This room already has ${ITEM_CAP} items.`
              : `${slotsLeft(items.length)} of ${ITEM_CAP} left in this room.`}{" "}
            Personal · household. A photo is not required.
          </p>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={80}
            placeholder="Short label, only you see it"
            aria-label="Item label"
            disabled={full || pending !== null}
            className="bg-bg min-h-11 w-full rounded-full px-4 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            className="bg-accent text-bg min-h-11 w-full rounded-full text-sm disabled:opacity-50"
            disabled={full || pending !== null || !label}
          >
            {pending === "add" ? "Adding…" : "Add item"}
          </button>
        </form>
      ) : null}
      {note ? (
        <p className="text-muted mt-2 text-sm break-words" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}
