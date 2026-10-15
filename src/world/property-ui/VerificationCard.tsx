// NDU-UPG property-ui
import { DisputePanel } from "./DisputePanel"; // NDU-34/35
import { AnchorButton } from "./AnchorButton"; // NDU devnet anchor
import { useEffect, useState } from "react";
import { PROPERTY_DISCLAIMER } from "@/config/neura";
import { verifyPropertyItem } from "@/world/property";
import { sealPublicRecord } from "@/world/net/pinRecord";
import type { ItemView, VerificationCard as Card } from "@/world/property";
import { verifyCard } from "@/world/verify/card";
import {
  cardTone,
  errMessage,
  evidenceLabel,
  scopeLabel,
  toneClass,
  toneLabel,
  truncateHash,
} from "./logic";
import "./property-ui.css";

function MintLine({ enabled }: { enabled?: boolean }) {
  return (
    <p className="mt-3 text-sm">
      Minting is off.
      {enabled === undefined ? null : (
        <span className="text-muted"> mintEnabled {enabled ? "true" : "false"}.</span>
      )}
    </p>
  );
}

function EvidenceLine({ name, evidence }: { name: string; evidence: ItemView["receipt"] }) {
  return (
    <p className="text-sm">
      {name}: {evidenceLabel(evidence.state)}
    </p>
  );
}

function HashLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-1 font-mono text-xs break-all" title={value}>
      <span className="text-muted">{label}</span> {truncateHash(value)}
    </p>
  );
}

/** Hash named by the metadata address this card already holds. Not a chain read. */
function hashFromUri(uri: string): string | null {
  const leaf = uri.split(/[?#]/, 1)[0]?.split("/").pop() ?? "";
  const bare = leaf.replace(/\.json$/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(bare) ? bare : null;
}

/**
 * Status for a check the card already lists.
 * The metadata-hash row uses verifyCard. The on-chain row reads only `chain`, which stays unavailable.
 * No wallet and no mint.
 */
function shownStatus(check: { key: string; status: string }, card: Card): string {
  if (check.key === "onchain") {
    return verifyCard({ hash: "", expected: "" }).chain;
  }
  if (check.key !== "uri" || !card.record) return check.status;
  const expected = hashFromUri(card.record.uri);
  if (!expected) return check.status;
  const local = verifyCard({ hash: card.record.metadataHash.trim().toLowerCase(), expected });
  if (local.status === "unmatched") return "fail";
  return check.status;
}

function CardBody({ card }: { card: Card }) {
  const [seal, setSeal] = useState<string | null>(null);
  const tone = cardTone(card.item.status, card.record?.status ?? null);
  const hashes: { key: string; label: string; value: string }[] = [];
  if (card.record?.metadataHash) {
    hashes.push({ key: "metadata", label: "Metadata", value: card.record.metadataHash });
  }
  for (const row of card.commitments) {
    if (row.commitment.trim())
      hashes.push({ key: row.kind, label: row.kind, value: row.commitment });
  }
  if (card.item.receipt.state === "stored") {
    hashes.push({ key: "receipt", label: "Receipt", value: card.item.receipt.sha256 });
  }
  if (card.item.photo.state === "stored") {
    hashes.push({ key: "photo", label: "Photo", value: card.item.photo.sha256 });
  }

  return (
    <article className={`${toneClass(tone)} mt-3`} data-record-tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-widest uppercase">{toneLabel(tone)}</p>
          <h3 className="font-display text-2xl leading-tight break-words">{card.item.label}</h3>
        </div>
        {tone === "verified" ? (
          <span className="ndu-seal" aria-hidden="true">
            NDU
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm">Scope: {scopeLabel(card.item.scope)}</p>
      <EvidenceLine name="Receipt" evidence={card.item.receipt} />
      <EvidenceLine name="Photo" evidence={card.item.photo} />
      <p className="mt-2 text-sm">Record status: {toneLabel(tone)}</p>
      <p className="text-muted text-xs">
        Item {card.item.status}
        {card.record ? ` · record ${card.record.status}` : " · no claim saved"}
      </p>
      {card.record?.contentId ? <HashLine label="Content id" value={card.record.contentId} /> : null}
      {card.record?.metadataHash ? (
        <button
          type="button"
          className="bg-bg mt-2 min-h-11 rounded-full px-4 text-sm"
          onClick={() => {
            void sealPublicRecord({ data: { hash: card.record!.metadataHash } })
              .then((r) => setSeal(r.reason))
              .catch(() => setSeal("Could not pin that receipt."));
          }}
        >
          Pin the receipt on this machine
        </button>
      ) : null}
      {seal ? <p className="text-muted mt-1 text-xs">{seal}</p> : null}
      <div className="mt-3">
        <p className="text-sm">Hashes</p>
        {hashes.length === 0 ? (
          <p className="text-muted text-xs">No hashes yet.</p>
        ) : (
          hashes.map((row) => <HashLine key={row.key} label={row.label} value={row.value} />)
        )}
      </div>
      <MintLine enabled={card.mintEnabled} />
      {card.checks.length ? (
        <ul className="mt-3 space-y-2">
          {card.checks.map((check) => (
            <li key={check.n} className="text-sm">
              <p>
                {check.n}. {check.title} <span className="text-muted">{shownStatus(check, card)}</span>
              </p>
              {check.detail ? <p className="text-muted text-xs">{check.detail}</p> : null}
              {check.doesNotProve ? (
                <p className="text-muted text-xs">Does not prove: {check.doesNotProve}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="ndu-rec-well mt-3 rounded-2xl px-3 py-2 text-xs">{card.disclaimer}</p>
    </article>
  );
}

/** Loads verifyPropertyItem and shows the record. No explorer link and no wallet signing. */
export function VerificationCard({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  // NDU-UPG property-ui
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setCard(null);
    setError("");
    verifyPropertyItem({ data: { itemId } })
      .then((next) => {
        if (live) setCard(next);
      })
      .catch((err) => {
        if (live) setError(errMessage(err, "Could not check that record."));
      });
    return () => {
      live = false;
    };
  }, [itemId, tick]);

  return (
    <section className="mt-4" data-verification-card={itemId} aria-label="Verification card">
      <button type="button" className="bg-bg min-h-11 rounded-full px-4 text-sm" onClick={onBack}>
        Back to items
      </button>
      {!card && !error ? (
        <div className="ndu-rec mt-3" role="status">
          <p className="font-display text-xl">Checking this record…</p>
          <MintLine />
          <p className="ndu-rec-well mt-3 rounded-2xl px-3 py-2 text-xs">{PROPERTY_DISCLAIMER}</p>
        </div>
      ) : null}
      {error ? (
        <div className="ndu-rec ndu-rec--other mt-3" role="alert">
          <p className="text-sm break-words">{error}</p>
          <MintLine />
          <p className="ndu-rec-well mt-3 rounded-2xl px-3 py-2 text-xs">{PROPERTY_DISCLAIMER}</p>
        </div>
      ) : null}
      {card ? <CardBody card={card} /> : null}
      {card && card.mintEnabled && card.record && card.item.isOwner && !card.record.mintSig && card.record.status === "awaiting_mint" ? (
        <AnchorButton itemId={itemId} onDone={() => setTick((n) => n + 1)} />
      ) : null}
      {card ? <DisputePanel itemId={itemId} /> : null}
    </section>
  );
}
