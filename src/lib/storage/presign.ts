/**
 * Local scan put. A safe key is letters, numbers, a dot, or a dash.
 * This does not call AWS and does not read env secrets.
 */

const SAFE_KEY = /^[A-Za-z0-9.-]+$/;

export type LocalPutResult = { ok: true; url: string } | { ok: false };

/** `/scans/local/<key>` for a safe key. Empty keys, `..`, and slashes are rejected. */
export function localPut(key: string): LocalPutResult {
  if (typeof key !== "string" || key.length === 0) return { ok: false };
  if (key.includes("..")) return { ok: false };
  if (key.includes("/") || key.includes("\\")) return { ok: false };
  if (!SAFE_KEY.test(key)) return { ok: false };
  return { ok: true, url: "/scans/local/" + key };
}
