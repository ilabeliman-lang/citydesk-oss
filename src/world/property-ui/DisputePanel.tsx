// NDU-34/35 dispute screens: embossed amber panel under the verification card.
import { useEffect, useState } from "react";
import { actOnItemDispute, getItemDispute } from "@/world/property";
import type { DisputeView } from "@/world/disputes/disputes.server";
import { errMessage } from "./logic";

const LABEL = { open: "Disputed: waiting for the owner", challenged: "Owner answered: waiting for an admin", settled: "Settled" } as const;

export function DisputePanel({ itemId }: { itemId: string }) {
  const [view, setView] = useState<DisputeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    getItemDispute({ data: { itemId } })
      .then((v) => live && setView(v))
      .catch((err) => live && setNote(errMessage(err, "Could not load disputes.")));
    return () => {
      live = false;
    };
  }, [itemId]);

  async function act(action: "open" | "challenge" | "settle") {
    setBusy(true);
    setNote("");
    try {
      setView(await actOnItemDispute({ data: { itemId, action } }));
    } catch (err) {
      setNote(errMessage(err, "That didn't work."));
    } finally {
      setBusy(false);
    }
  }

  if (!view && !note) return null;
  const d = view?.dispute;
  const btn = "ndu-dispute-btn min-h-11 w-full rounded-full text-sm";
  return (
    <section className="ndu-rec ndu-rec--disputed mt-3" aria-label="Dispute" data-dispute-panel={itemId}>
      <p className="font-display text-lg">Dispute</p>
      <p className="text-sm" role="status">
        {d ? LABEL[d.status] : "No dispute on this record."}
      </p>
      <div className="mt-3 grid gap-2">
        {view?.canOpen ? (
          <button type="button" className={btn} disabled={busy} onClick={() => act("open")}>
            Dispute this record
          </button>
        ) : null}
        {view?.canChallenge ? (
          <button type="button" className={btn} disabled={busy} onClick={() => act("challenge")}>
            Answer the dispute
          </button>
        ) : null}
        {view?.canSettle ? (
          <button type="button" className={btn} disabled={busy} onClick={() => act("settle")}>
            Settle (admin)
          </button>
        ) : null}
      </div>
      {note ? (
        <p className="mt-2 text-sm" role="alert">
          {note}
        </p>
      ) : null}
      <p className="text-muted mt-2 text-xs">A dispute is a note between people. It doesn't decide legal ownership.</p>
    </section>
  );
}
