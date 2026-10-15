// NDU-UPG property-ui
import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { PROPERTY } from "@/config/neura";
import { getPropertyStatus } from "@/world/property";
import type { PropertyStatus } from "@/world/property";
import { ConsentSheet } from "./ConsentSheet";
import { ItemPicker } from "./ItemPicker";
import { VerificationCard } from "./VerificationCard";
import { errMessage } from "./logic";
import { listMyScans, type ScanAsset } from "@/world/scans"; // NDU-1: pick a scan instead of pasting its id
import "./property-ui.css";

/**
 * Records sheet: consent first, then a pasted scan id and its items.
 * A selected item opens the verification card. Minting stays off.
 */
export function PropertyDesk({ onClose }: { onClose: () => void }) {
  // NDU-UPG property-ui
  const [status, setStatus] = useState<PropertyStatus | null>(null);
  const [error, setError] = useState("");
  const [scanDraft, setScanDraft] = useState("");
  const [scanNote, setScanNote] = useState("");
  const [scanId, setScanId] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [myScans, setMyScans] = useState<ScanAsset[] | null>(null);

  useEffect(() => {
    let live = true;
    getPropertyStatus()
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch((err) => {
        if (live) setError(errMessage(err, "Could not open the records desk."));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (itemId) {
        setItemId(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemId, onClose]);

  function showScan(event: FormEvent) {
    event.preventDefault();
    const next = scanDraft.trim();
    if (!next) {
      setScanNote("Paste a scan id.");
      return;
    }
    setScanNote("");
    setItemId(null);
    setScanId(next);
  }

  const open = status?.ready === true && status.consented;

  // NDU-1: once consent is in, list the owner's own scans as tap chips.
  useEffect(() => {
    if (!open || myScans) return;
    let live = true;
    listMyScans()
      .then((rows) => {
        if (live) setMyScans(rows.filter((r) => r.status !== "failed"));
      })
      .catch(() => {
        if (live) setMyScans([]);
      });
    return () => {
      live = false;
    };
  }, [open, myScans]);

  const sheet = (
    <div
      className="bg-bg/80 fixed inset-0 z-[760] grid place-items-end p-3 sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-desk-title"
      data-property-desk=""
    >
      <div className="bg-surface max-h-[90dvh] w-full max-w-md overflow-auto rounded-3xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted text-xs tracking-widest uppercase">{PROPERTY.banner}</p>
            <h2 id="property-desk-title" className="font-display text-2xl">
              Records
            </h2>
          </div>
          <button
            type="button"
            className="bg-bg min-h-11 rounded-full px-4 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="text-muted mt-2 text-sm">Minting is off. Nothing here is sent to Solana.</p>
        {!status && !error ? (
          <p className="text-muted mt-4 text-sm">Checking the records desk…</p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm break-words" role="alert">
            {error}
          </p>
        ) : null}
        {status && !open ? (
          <ConsentSheet
            ready={status.ready}
            onAccepted={() => setStatus((prev) => (prev ? { ...prev, consented: true } : prev))}
          />
        ) : null}
        {status?.ready && status.consented ? (
          <p className="text-muted mt-4 text-sm">
            You accepted the property-record notice ({PROPERTY.consentVersion}). Minting is off.
          </p>
        ) : null}
        {open ? (
          <>
            {myScans && myScans.length ? (
              <div className="mt-4" data-property-scans="">
                <p className="text-sm">Your scans</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {myScans.map((scan) => (
                    <button
                      key={scan.id}
                      type="button"
                      aria-pressed={scanId === scan.id}
                      className="property-chip bg-bg min-h-11 rounded-full px-4 text-sm"
                      onClick={() => {
                        setScanNote("");
                        setItemId(null);
                        setScanDraft(scan.id);
                        setScanId(scan.id);
                      }}
                    >
                      {scan.name || "Scan"}
                    </button>
                  ))}
                </div>
              </div>
            ) : myScans ? (
              <p className="text-muted mt-4 text-sm">No scans yet. Upload one from the Scan desk, or paste an id.</p>
            ) : null}
            <form className="mt-4 space-y-2" onSubmit={showScan}>
              <label className="text-sm" htmlFor="property-scan-id">
                Scan id
              </label>
              <input
                id="property-scan-id"
                value={scanDraft}
                onChange={(event) => setScanDraft(event.target.value)}
                placeholder="Paste a scan id"
                spellCheck={false}
                autoComplete="off"
                className="bg-bg min-h-11 w-full rounded-full px-4 text-sm"
              />
              <button
                type="submit"
                className="bg-accent text-bg min-h-11 w-full rounded-full text-sm"
              >
                Show items
              </button>
            </form>
            {scanNote ? <p className="text-muted mt-2 text-sm">{scanNote}</p> : null}
            {scanId && !itemId ? (
              <ItemPicker
                scanId={scanId}
                selectedId={itemId}
                onOpen={setItemId}
                onRemoved={(id) => {
                  if (itemId === id) setItemId(null);
                }}
              />
            ) : null}
            {itemId ? <VerificationCard itemId={itemId} onBack={() => setItemId(null)} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}
