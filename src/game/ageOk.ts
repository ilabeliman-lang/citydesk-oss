// Phone-only age attestation. Not an ID check and not a server record.
const AGE_KEY = "ndu.age.ok";

/** Timestamp this phone stored, or null when the value is missing or unreadable. */
export function readAgeOk(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rec = parsed as { ok?: unknown; at?: unknown };
    if (rec.ok !== true || typeof rec.at !== "string") return null;
    if (!Number.isFinite(Date.parse(rec.at))) return null;
    return rec.at;
  } catch {
    return null;
  }
}

/** setAgeOk(true) writes `{ ok: true, at }`. A false value clears this phone. */
export function writeAgeOk(ok: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (!ok) {
      localStorage.removeItem(AGE_KEY);
      return;
    }
    localStorage.setItem(AGE_KEY, JSON.stringify({ ok: true, at: new Date().toISOString() }));
  } catch {
    /* a blocked store must not break the street */
  }
}
