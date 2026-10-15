/**
 * HMAC-SHA256 for a serial payload.
 * Hex only. The caller supplies the secret; this module does not read one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Hex HMAC-SHA256 of payload under secret. */
export function signSerial(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** True only when mac is the hex HMAC-SHA256 of this exact payload. */
export function verifySerial(secret: string, payload: string, mac: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (typeof mac !== "string" || !/^[0-9a-f]+$/i.test(mac)) return false;
  if (mac.length !== expected.length * 2) return false;
  const given = Buffer.from(mac, "hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(expected, given);
}
