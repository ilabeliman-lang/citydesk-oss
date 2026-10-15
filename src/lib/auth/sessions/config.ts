/**
 * NDU-UPG sessions: session-management settings, read from env (names only; all optional).
 *
 *   NDU_SESSION_IDLE_DAYS       idle timeout, default 7   (no activity for this long -> signed out)
 *   NDU_SESSION_ABSOLUTE_DAYS   absolute timeout, default 30 (sign in again after this, active or not)
 *   NDU_AUDIT_RETENTION_DAYS    keep admin audit rows this long, default 180
 *   NDU_ADMIN_EMAILS            comma list of emails that are admins (in addition to app_admins)
 *   NDU_ADMIN_USER_IDS          comma list of user ids that are admins
 *   NDU_SIGNIN_RATE_PER_MIN     sign-in attempts per IP per minute, default 10
 *
 * Pure (no server imports) so tests and the Better Auth config can share it.
 */
export type SessionConfig = {
  idleSec: number;
  absoluteSec: number;
  /** How often Better Auth slides the idle window forward (<= idle / 2, max 1 day). */
  updateAgeSec: number;
  auditRetentionDays: number;
  adminEmails: ReadonlySet<string>;
  adminIds: ReadonlySet<string>;
  signinPerMin: number;
  /** Throttle for "last active" writes. */
  touchEverySec: number;
};

const DAY = 86_400;

function num(raw: string | undefined, fallback: number, min: number, max: number): number {
  const v = Number(String(raw ?? "").trim());
  if (!raw || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function list(raw: string | undefined, lower: boolean): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(/[,\s]+/)
      .map((s) => (lower ? s.trim().toLowerCase() : s.trim()))
      .filter(Boolean),
  );
}

export function readSessionConfig(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): SessionConfig {
  const idleSec = Math.round(num(env.NDU_SESSION_IDLE_DAYS, 7, 1 / 24, 365) * DAY);
  const absoluteSec = Math.max(idleSec, Math.round(num(env.NDU_SESSION_ABSOLUTE_DAYS, 30, 1 / 24, 3650) * DAY));
  return {
    idleSec,
    absoluteSec,
    updateAgeSec: Math.max(60, Math.min(DAY, Math.floor(idleSec / 2))),
    auditRetentionDays: num(env.NDU_AUDIT_RETENTION_DAYS, 180, 1, 3650),
    adminEmails: list(env.NDU_ADMIN_EMAILS, true),
    adminIds: list(env.NDU_ADMIN_USER_IDS, false),
    signinPerMin: Math.round(num(env.NDU_SIGNIN_RATE_PER_MIN, 10, 1, 1000)),
    touchEverySec: 300,
  };
}

/** Why a session is no longer valid, or null when it is fine. */
export type EndReason = "expired" | "idle" | "absolute";

export function sessionEndReason(
  s: { createdAt: Date | string; expiresAt: Date | string; lastSeenAt?: Date | string | null },
  now: number,
  cfg: Pick<SessionConfig, "idleSec" | "absoluteSec">,
): EndReason | null {
  const created = new Date(s.createdAt).getTime();
  const expires = new Date(s.expiresAt).getTime();
  if (Number.isFinite(expires) && expires <= now) return "expired";
  if (Number.isFinite(created) && now - created >= cfg.absoluteSec * 1000) return "absolute";
  if (s.lastSeenAt) {
    const seen = new Date(s.lastSeenAt).getTime();
    if (Number.isFinite(seen) && now - seen >= cfg.idleSec * 1000) return "idle";
  }
  return null;
}
