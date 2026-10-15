/**
 * NDU-UPG u-088: PII redaction for server logs. Anything logged through
 * redact() has emails, phone numbers, card-like numbers, IBANs, national-ID-like
 * numbers, coordinates, IPs, and key/token-shaped strings replaced before they
 * reach stdout/stderr. Pure + dependency-free so it unit-tests in node.
 */

const REDACTIONS: [RegExp, string][] = [
  // Order matters: specific patterns (iban, card, ssn) before the generic phone,
  // or the phone regex eats their digit groups.
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]"],
  [/\b[A-Z]{2}\d{2}[ ]?[A-Z0-9]{4}(?:[ ]?[A-Z0-9]{2,4}){2,6}\b/g, "[iban]"],
  // card: 13-19 digits with NO spaces, or space/dash-separated in 4-group form
  [/\b\d{13,19}\b/g, "[card]"],
  [/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}\b/g, "[card]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]"],
  // phone: optional +country, then digit groups; the + must attach to the match
  [/\+?\b\d{1,3}[\s(]?\d{2,4}[\s)-]?\d{3,4}[\s-]?\d{3,4}\b/g, "[phone]"],
  [/\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g, "[coords]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/\b(?:rag_|rcpt_|gfy_|sk-|pk_|Bearer\s+)[A-Za-z0-9._-]{8,}/g, "[key]"],
];

/** Replace PII-shaped substrings in a string. Non-strings pass through. */
export function redact(value: unknown): string {
  if (typeof value !== "string") {
    if (value instanceof Error) return redact(`${value.name}: ${value.message}`);
    return String(value ?? "");
  }
  let out = value;
  for (const [re, tag] of REDACTIONS) out = out.replace(re, tag);
  return out;
}

/** Redact every string in a list of log arguments. */
export function redactArgs(args: unknown[]): unknown[] {
  return args.map((a) => {
    if (typeof a === "string") return redact(a);
    if (a instanceof Error) return redact(`${a.name}: ${a.message}`);
    if (a && typeof a === "object") {
      try {
        return redact(JSON.stringify(a));
      } catch {
        return "[object]";
      }
    }
    return a;
  });
}

/** PII-safe console.* wrappers for server-side logging. */
export const log = {
  info: (...args: unknown[]) => console.info(...redactArgs(args)),
  warn: (...args: unknown[]) => console.warn(...redactArgs(args)),
  error: (...args: unknown[]) => console.error(...redactArgs(args)),
};
