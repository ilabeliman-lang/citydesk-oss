/**
 * NDU-AI safe ingest #4: server glue for the scam / impersonation check on listings and claims.
 * Flags are computed from the stored text whenever a manager looks (no new column, no migration) and logged
 * once at write time with ids + reason codes only (never the text). Nothing here bans anyone.
 */
import { serverFlags } from "./flags.ts";
import { scamCheck, type ScamCheck } from "./scam.ts";

export type PublicReview = { level: ScamCheck["level"]; reasons: string[] } | null;

/** For the manager board: null when the check is off or the listing reads fine. */
export function scamFor(...fields: (string | null | undefined)[]): PublicReview {
  if (!serverFlags(process.env).scamFlag) return null;
  const r = scamCheck(...fields);
  return r.level === "ok" ? null : { level: r.level, reasons: r.reasons.map((x) => x.why) };
}

/** At write time: log a review line, and say whether the OFF-by-default hold applies. */
export function listingReview(
  id: string,
  ...fields: (string | null | undefined)[]
): { hold: boolean; public: PublicReview } {
  const flags = serverFlags(process.env);
  if (!flags.scamFlag) return { hold: false, public: null };
  const r = scamCheck(...fields);
  if (r.level === "ok") return { hold: false, public: null };
  console.warn(
    `[ingest] review: listing ${id} ${r.level} score=${r.score} reasons=${r.reasons.map((x) => x.code).join(",")}`,
  );
  return {
    hold: flags.scamHold && r.level === "high",
    public: { level: r.level, reasons: r.reasons.map((x) => x.why) },
  };
}
