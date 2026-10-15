/**
 * NDU-AI avatar-bot assistant: in-process rate limits for the gateway proxy (no DB, no migration).
 * Per-client sliding minute + day windows, plus one global hourly cap so a crowd can't run up the
 * gateway. Memory is bounded: idle clients are swept.
 */
export type LimitConfig = {
  perMinute: number;
  perDay: number;
  globalPerHour: number;
  maxClients?: number;
};
export type LimitResult =
  { ok: true } | { ok: false; retryAfterS: number; scope: "minute" | "day" | "global" };

export const DEFAULT_LIMITS: LimitConfig = {
  perMinute: 8,
  perDay: 120,
  globalPerHour: 600,
  maxClients: 5000,
};

export function createLimiter(cfg: LimitConfig = DEFAULT_LIMITS) {
  const clients = new Map<string, number[]>();
  let global: number[] = [];
  const MIN = 60_000;
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  return {
    check(key: string, now = Date.now()): LimitResult {
      const k = (key || "anon").slice(0, 80);
      global = global.filter((t) => now - t < HOUR);
      if (global.length >= cfg.globalPerHour)
        return {
          ok: false,
          retryAfterS: Math.ceil((HOUR - (now - global[0])) / 1000),
          scope: "global",
        };
      const hits = (clients.get(k) ?? []).filter((t) => now - t < DAY);
      const lastMinute = hits.filter((t) => now - t < MIN);
      if (lastMinute.length >= cfg.perMinute)
        return {
          ok: false,
          retryAfterS: Math.ceil((MIN - (now - lastMinute[0])) / 1000),
          scope: "minute",
        };
      if (hits.length >= cfg.perDay)
        return { ok: false, retryAfterS: Math.ceil((DAY - (now - hits[0])) / 1000), scope: "day" };
      hits.push(now);
      global.push(now);
      clients.delete(k);
      clients.set(k, hits);
      const max = cfg.maxClients ?? 5000;
      while (clients.size > max) clients.delete(clients.keys().next().value as string);
      return { ok: true };
    },
    size: () => clients.size,
  };
}
