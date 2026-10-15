/**
 * Handoff Department (Agent Office reception) -> Workverse reception desk.
 * Pure sanitiser: keeps only counts + agent creed status from GET /reception/board.
 * Never carries tokens, briefs, notes or ledger text to the browser.
 */
export interface ReceptionAgent {
  id: string;
  role: string;
  state: string;
  verified: boolean;
  affirmed: boolean;
  claims: number;
}
export interface ReceptionSummary {
  ok: boolean;
  creedVersion: string;
  tasks: {
    total: number;
    open: number;
    inProgress: number;
    done: number;
    blockedOnSun: number;
    claimed: number;
  };
  agents: ReceptionAgent[];
  briefs: { general: number; private: number };
  at: string;
  error?: string;
}

const str = (v: unknown, n = 80) => String(v ?? "").slice(0, n);

export function summarizeBoard(board: unknown, now = new Date()): ReceptionSummary {
  const b = (board ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(b.tasks) ? (b.tasks as Record<string, unknown>[]) : [];
  const agents = Array.isArray(b.agents) ? (b.agents as Record<string, unknown>[]) : [];
  const briefs = Array.isArray(b.briefs) ? (b.briefs as Record<string, unknown>[]) : [];
  const by = (s: string) => tasks.filter((t) => t.status === s).length;
  return {
    ok: true,
    creedVersion: str(b.creedVersion, 32),
    tasks: {
      total: tasks.length,
      open: by("open"),
      inProgress: by("in_progress"),
      done: by("done"),
      blockedOnSun: tasks.filter((t) => t.kind === "blocked-on-sun").length,
      claimed: tasks.filter((t) => !!t.claim).length,
    },
    agents: agents.slice(0, 40).map((a) => {
      const aff = (a.affirmed ?? null) as { current?: boolean } | null;
      return {
        id: str(a.id),
        role: str(a.role, 40),
        state: str(a.state, 12),
        verified: a.registered === true,
        affirmed: !!(aff && aff.current),
        claims: Array.isArray(a.claims) ? a.claims.length : 0,
      };
    }),
    briefs: {
      general: briefs.filter((x) => x.kind === "general").length,
      private: briefs.filter((x) => x.kind === "private").length,
    },
    at: now.toISOString(),
  };
}

export function emptySummary(error: string): ReceptionSummary {
  return {
    ok: false,
    creedVersion: "",
    tasks: { total: 0, open: 0, inProgress: 0, done: 0, blockedOnSun: 0, claimed: 0 },
    agents: [],
    briefs: { general: 0, private: 0 },
    at: new Date().toISOString(),
    error: error.slice(0, 120),
  };
}

/** Flag: default ON; off with VITE_NDU_RECEPTION=off or ?reception=0 */
export function receptionEnabled(
  search = typeof location !== "undefined" ? location.search : "",
): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_NDU_RECEPTION;
  if (env === "off" || env === "0") return false;
  if (/[?&]reception=0\b/.test(search)) return false;
  return true;
}
