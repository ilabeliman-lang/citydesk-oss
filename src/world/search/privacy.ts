/**
 * NDU-AI search privacy filter (item 3 of the semantic/voice track; 1000-list cat. 19).
 * Everything that reaches the search index — on the server or on the phone — passes through here.
 * Rules:
 *  - never index owner/contact fields (owner ids, user ids, emails, phones, wallet/claimant data);
 *  - never index unpublished property claims (anything that is not a published listing);
 *  - scans only when public (or when they belong to the person searching, on their own phone);
 *  - business listings only when open AND declared;
 *  - free text is scrubbed of e-mail addresses, phone numbers, URLs and long digit runs.
 * Pure and alias-free (node --experimental-strip-types tests it).
 */

import { canSee } from "../visibility/rules.ts";

/** Field names that must never be copied into a search document, whatever their value. */
const PRIVATE_FIELD = /^(owner|user|username|claimant|wallet|email|e_mail|phone|tel|telephone|mobile|contact|whatsapp|dek|kek|salt|storage|sha256|token|secret|password|sig|signature|label_enc|claim_message|claim_hash|google_place_id|verified_by)(_|$)/i;

export function isPrivateField(name: string): boolean {
  return PRIVATE_FIELD.test(name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, ""));
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// +234 803 123 4567, 0803-123-4567, (01) 234 5678, 08031234567 ... any 7+ digits with separators.
const PHONE = /(?:\+?\d[\d\s().-]{5,}\d)/g;
const HANDLE = /(^|\s)@[\w.]{3,}/g;

/** Remove contact details from free text (offers, names) before it is indexed or shown in results. */
export function redactText(text: string): string {
  return text
    .replace(EMAIL, " ")
    .replace(URL_RE, " ")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 7 ? " " : m))
    .replace(HANDLE, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(?:[,;:\s]+)/g, "$1 ")
    .replace(/(?:[,;:\s·-]|\b(?:or|and|on|at|via|call|email|mail)\b)+$/gi, (_m: string, off: number, all: string) => (off === 0 ? all : ""))
    .trim();
}

/** Property claim states that count as a published listing. Drafts and in-flight claims never do. */
export const PUBLISHED_CLAIM = new Set(["minted"]);

export type RawRecord = Record<string, unknown> & {
  source: "place" | "street" | "building" | "listing" | "scan" | "poi" | "property";
};

/** What a corpus record looks like on the wire (server fn result): plain JSON values only. */
export type WireRecord = { source: RawRecord["source"] } & { [k: string]: string | number | boolean | null | [number, number][] };

export type Verdict = { ok: true; record: Record<string, unknown> } | { ok: false; reason: string };

/**
 * Decide whether a raw record may be indexed, and strip it down to safe fields.
 * `viewerOwns` is true only for the signed-in person's own scans, indexed on their own phone.
 */
export function publicRecord(raw: RawRecord, viewerOwns = false): Verdict {
  if (raw.source === "listing") {
    if (raw.open === false) return { ok: false, reason: "closed listing" };
    if (raw.declared === false) return { ok: false, reason: "undeclared listing" };
  }
  if (raw.source === "scan") {
    const ownerId = "owner";
    const viewerId = viewerOwns ? ownerId : "stranger";
    const visibility = raw.visibility === "public" ? "public" : "private";
    if (!canSee(viewerId, { ownerId, visibility })) return { ok: false, reason: "private scan" };
    if (raw.status === "failed") return { ok: false, reason: "rejected scan" };
    if (raw.lat == null || raw.lng == null) return { ok: false, reason: "unplaced scan" };
  }
  if (raw.source === "property") {
    const status = String(raw.claimStatus ?? raw.claim_status ?? "draft");
    if (!PUBLISHED_CLAIM.has(status)) return { ok: false, reason: "unpublished claim" };
    if (String(raw.scope ?? "personal") !== "community") return { ok: false, reason: "not a public listing" };
  }
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isPrivateField(k)) continue;
    record[k] = typeof v === "string" ? redactText(v) : v;
  }
  return { ok: true, record };
}
