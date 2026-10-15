// NDU devnet anchor: the owner signs one memo transaction in their own wallet. Embossed gold pill.
import { useState } from "react";
import { prepareRecordAnchor, submitRecordAnchor } from "@/world/property";
import { connectWallet, signDevnetTransaction, solanaWallets } from "@/lib/solana/wallet";
import { errMessage } from "./logic";

export function AnchorButton({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function go() {
    setBusy(true);
    setNote("");
    try {
      const wallet = solanaWallets()[0];
      if (!wallet) throw new Error("Open this page in a Solana wallet browser (or install one) to sign.");
      const prep = await prepareRecordAnchor({ data: { itemId } });
      const account = await connectWallet(wallet);
      if (account.address !== prep.claimant) throw new Error("Switch your wallet to the address you claimed with.");
      const signed = await signDevnetTransaction(wallet, account, prep.tx);
      const out = await submitRecordAnchor({ data: { itemId, signed } });
      setNote(`Sent to devnet. ${out.explorer}`);
      onDone();
    } catch (err) {
      setNote(errMessage(err, "Couldn't anchor it."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3" data-anchor={itemId}>
      <button type="button" className="ndu-anchor-btn min-h-11 w-full rounded-full text-sm" disabled={busy} onClick={go}>
        {busy ? "Waiting for your wallet…" : "Anchor on Solana devnet"}
      </button>
      <p className="text-muted mt-1 text-xs">Test network only. You sign in your own wallet; the fee is a tiny amount of free devnet SOL.</p>
      {note ? <p className="mt-1 text-xs break-all" role="status">{note}</p> : null}
    </div>
  );
}
