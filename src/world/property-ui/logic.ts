/**
 * NDU-UPG property-ui — pure helpers for the records desk.
 * No server, database, wallet, or network imports, so node:test can load this file directly.
 * ITEM_CAP matches PROPERTY.maxItemsPerScan in src/config/neura.ts (NDU-20).
 */

/** Hard cap of items on one scan. The server enforces the same number. */
export const ITEM_CAP = 3;

export type RecordTone = "draft" | "verified" | "disputed" | "other";

/**
 * Gold seal is only for a record that verified (minted / confirmed / finalized).
 * Off-chain claims stay grey: minting is off and they are not a seal.
 */
const VERIFIED = new Set(["verified", "minted", "confirmed", "finalized"]);

export function canAddItem(count: number, cap = ITEM_CAP): boolean {
  if (!Number.isFinite(count) || !Number.isFinite(cap)) return false;
  return Math.max(0, Math.floor(count)) < cap;
}

export function slotsLeft(count: number, cap = ITEM_CAP): number {
  if (!Number.isFinite(count) || !Number.isFinite(cap)) return 0;
  return Math.max(0, cap - Math.max(0, Math.floor(count)));
}

export function recordTone(status: string | null | undefined): RecordTone {
  const key = String(status ?? "")
    .trim()
    .toLowerCase();
  if (key === "draft") return "draft";
  if (key === "disputed") return "disputed";
  if (VERIFIED.has(key)) return "verified";
  return "other";
}

/** Draft wins over a claim, and a dispute wins over a gold seal. */
export function cardTone(
  itemStatus: string | null | undefined,
  recordStatus?: string | null,
): RecordTone {
  const item = recordTone(itemStatus);
  if (item === "draft" || item === "disputed" || item === "verified") return item;
  const record = recordTone(recordStatus);
  if (record === "disputed" || record === "verified") return record;
  return "other";
}

export function toneLabel(tone: RecordTone): "Draft" | "Verified" | "Disputed" | "Other" {
  if (tone === "draft") return "Draft";
  if (tone === "verified") return "Verified";
  if (tone === "disputed") return "Disputed";
  return "Other";
}

export function statusLabel(
  status: string | null | undefined,
): "Draft" | "Verified" | "Disputed" | "Other" {
  return toneLabel(recordTone(status));
}

export function toneClass(tone: RecordTone): string {
  return `ndu-rec ndu-rec--${tone}`;
}

export function scopeLabel(scope: string): string {
  if (scope === "personal") return "Personal";
  if (scope === "family") return "Family";
  if (scope === "community") return "Community";
  return "Other";
}

export function evidenceLabel(state: string): "On file" | "Withdrawn" | "None" | "Other" {
  if (state === "stored") return "On file";
  if (state === "withdrawn") return "Withdrawn";
  if (state === "none") return "None";
  return "Other";
}

/** First 8 and last 4 characters, with an ellipsis. Short values stay whole. */
export function truncateHash(hash: string): string {
  const value = hash.trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

/** Private item label: drop control characters, trim, cap at 80 (same bound as the server). */
export function cleanLabel(value: string, max = 80): string {
  return [...String(value ?? "")]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, max);
}

export function errMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg) return fallback;
  if (msg === "Unauthorized") return "Sign in to use records.";
  return msg;
}
