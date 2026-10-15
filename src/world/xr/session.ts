/**
 * NDU-UPG u-108: WebXR session lifecycle helper. Pure logic over an injected
 * XRSystem so it unit-tests with a mock session (no real headset needed).
 * Never starts a session on its own — the caller passes the system and decides.
 *
 * Semantics: enter() requests an "immersive-ar" session and returns the
 * session; exit() always ends it (idempotent). A refused/unsupported request
 * yields null, never throws.
 */

export type XrSessionLike = { end(): Promise<void>; addEventListener?: (t: string, f: () => void) => void };
export type XrSystemLike = {
  isSessionSupported?: (mode: string) => Promise<boolean>;
  requestSession?: (mode: string) => Promise<XrSessionLike>;
};

export type XrEnterResult =
  | { ok: true; session: XrSessionLike }
  | { ok: false; reason: "unsupported" | "refused" | "no-system" };

/** Request an immersive-ar session. Returns the session or a typed failure. */
export async function enterXr(system: XrSystemLike | null | undefined): Promise<XrEnterResult> {
  if (!system || typeof system.requestSession !== "function") return { ok: false, reason: "no-system" };
  if (typeof system.isSessionSupported === "function") {
    const supported = await system.isSessionSupported("immersive-ar");
    if (!supported) return { ok: false, reason: "unsupported" };
  }
  try {
    const session = await system.requestSession("immersive-ar");
    return { ok: true, session };
  } catch {
    return { ok: false, reason: "refused" };
  }
}

/** End a session. Idempotent: ending twice or ending null is a no-op. */
const endedSessions = new WeakSet<object>();

export async function exitXr(session: XrSessionLike | null | undefined): Promise<void> {
  if (!session || typeof session.end !== "function") return;
  if (endedSessions.has(session)) return; // already ended by us — do not double-end
  endedSessions.add(session);
  try {
    await session.end();
  } catch {
    // already ended or the runtime refuses a second end — exit is best-effort
  }
}
