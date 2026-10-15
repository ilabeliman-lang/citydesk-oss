// NDU-UPG property-ui
import { useState } from "react";
import { PROPERTY, PROPERTY_DISCLAIMER } from "@/config/neura";
import { acceptPropertyConsent } from "@/world/property";
import { errMessage, ITEM_CAP } from "./logic";
import "./property-ui.css";

/**
 * Embossed property-record notice. Posts the current consent version.
 * When the desk is not ready, says so and does not call the server.
 */
export function ConsentSheet({ ready, onAccepted }: { ready: boolean; onAccepted: () => void }) {
  // NDU-UPG property-ui
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await acceptPropertyConsent({ data: { version: PROPERTY.consentVersion } });
      onAccepted();
    } catch (err) {
      setError(errMessage(err, "Could not save that you read the notice."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <section className="ndu-rec ndu-rec--other mt-4" role="status" data-consent="off">
        <p className="text-xs tracking-widest uppercase">{PROPERTY.banner}</p>
        <h3 className="font-display mt-1 text-xl">Records desk is off</h3>
        <p className="mt-2 text-sm">
          The records desk is off on this server, so this notice cannot be accepted. Minting is off.
          Nothing was sent.
        </p>
      </section>
    );
  }

  return (
    <section className="ndu-rec mt-4" aria-labelledby="property-notice-title" data-consent="notice">
      <p className="text-muted text-xs tracking-widest uppercase">{PROPERTY.banner}</p>
      <h3 id="property-notice-title" className="font-display mt-1 text-xl">
        Property-record notice
      </h3>
      <div className="ndu-rec-well mt-3 space-y-2 rounded-2xl px-3 py-3 text-sm">
        <p>
          A property record is a note you write about something in a room scan. It is self-declared.
          It is not legal title and it is not real ownership.
        </p>
        <p>{PROPERTY_DISCLAIMER}</p>
        <p>
          Minting is off. Accepting this notice does not send anything to Solana, does not open a
          mainnet explorer, and does not ask a wallet to sign.
        </p>
        <p>
          The label stays private on the server. A room holds at most {ITEM_CAP} items in this test.
          You can remove your own items. A photo is not required.
        </p>
      </div>
      <p className="text-muted mt-3 text-xs">Notice {PROPERTY.consentVersion}</p>
      {error ? (
        <p className="mt-2 text-sm break-words" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="bg-accent text-bg mt-3 min-h-11 w-full rounded-full text-sm disabled:opacity-50"
        onClick={() => void accept()}
        disabled={busy}
      >
        {busy ? "Saving…" : "I have read this notice"}
      </button>
    </section>
  );
}
