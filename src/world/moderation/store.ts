// NDU-UPG 909: reports and blocks stay on this phone. No network and no server queue.

export type ModerationReport = {
  targetId: string;
  reason: string;
  at: string;
};

export type ModerationList = {
  reports: ModerationReport[];
  blocked: string[];
};

const KEY = "ndu.moderation.v1";
const CAP = 100;
const REASON_MAX = 280;

type State = {
  reports: ModerationReport[];
  blocked: string[];
};

function empty(): State {
  return { reports: [], blocked: [] };
}

function clean(raw: unknown): State {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty();
  const rec = raw as { reports?: unknown; blocked?: unknown };
  const reports: ModerationReport[] = [];
  if (Array.isArray(rec.reports)) {
    for (const row of rec.reports) {
      if (!row || typeof row !== "object") continue;
      const item = row as { targetId?: unknown; reason?: unknown; at?: unknown };
      if (typeof item.targetId !== "string" || item.targetId.length === 0) continue;
      if (typeof item.reason !== "string" || item.reason.length === 0) continue;
      if (typeof item.at !== "string" || item.at.length === 0) continue;
      reports.push({ targetId: item.targetId, reason: item.reason.slice(0, REASON_MAX), at: item.at });
    }
  }
  const blocked: string[] = [];
  if (Array.isArray(rec.blocked)) {
    for (const id of rec.blocked) {
      if (typeof id === "string" && id.length > 0 && !blocked.includes(id)) blocked.push(id);
    }
  }
  if (reports.length > CAP) reports.splice(0, reports.length - CAP);
  return { reports, blocked };
}

function read(): State {
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return clean(JSON.parse(raw) as unknown);
  } catch {
    return empty();
  }
}

function write(state: State) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify({ reports: state.reports.slice(-CAP), blocked: state.blocked }));
}

export function report(targetId: string, reason: string): ModerationReport {
  if (typeof targetId !== "string" || targetId.length === 0) throw new Error("missing target");
  if (typeof reason !== "string" || reason.trim().length === 0) throw new Error("empty reason");
  const row: ModerationReport = {
    targetId,
    reason: reason.trim().slice(0, REASON_MAX),
    at: new Date().toISOString(),
  };
  const state = read();
  state.reports.push(row);
  if (state.reports.length > CAP) state.reports.splice(0, state.reports.length - CAP);
  write(state);
  return row;
}

export function block(targetId: string) {
  if (typeof targetId !== "string" || targetId.length === 0) return;
  const state = read();
  if (!state.blocked.includes(targetId)) state.blocked.push(targetId);
  write(state);
}

export function unblock(targetId: string) {
  if (typeof targetId !== "string") return;
  const state = read();
  state.blocked = state.blocked.filter((id) => id !== targetId);
  write(state);
}

export function list(): ModerationList {
  const state = read();
  return {
    reports: state.reports.map((row) => ({ ...row })),
    blocked: [...state.blocked],
  };
}
