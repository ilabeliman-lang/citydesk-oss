import { useState } from "react";
import { allowMessage } from "./guard";
import { block, report } from "./store";

// NDU-UPG 909
export function ReportButton({ targetId, onBlocked }: { targetId: string; onBlocked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="bg-bg min-h-11 flex-1 rounded-full text-sm"
          onClick={() => {
            setNote("");
            setOpen((value) => !value);
          }}
        >
          Report
        </button>
        <button
          type="button"
          className="bg-bg min-h-11 flex-1 rounded-full text-sm"
          onClick={() => {
            block(targetId);
            onBlocked?.();
          }}
        >
          Block
        </button>
      </div>
      {open ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (reason.trim().length > 0 && !allowMessage(targetId, Date.now())) {
                setNote("Wait a moment.");
                return;
              }
              report(targetId, reason);
              setReason("");
              setOpen(false);
              setNote("Saved on this phone.");
            } catch (err) {
              setNote(err instanceof Error && err.message === "empty reason" ? "Write a short reason." : "Could not save on this phone.");
            }
          }}
        >
          <textarea
            value={reason}
            maxLength={280}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What happened"
            className="bg-bg min-h-20 w-full rounded-xl px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-accent text-bg min-h-11 w-full rounded-full text-sm">
            Save report
          </button>
        </form>
      ) : null}
      {note ? <p className="text-muted text-xs">{note}</p> : null}
    </div>
  );
}
