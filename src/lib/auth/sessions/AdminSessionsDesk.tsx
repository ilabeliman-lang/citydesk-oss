/**
 * NDU-UPG sessions: admin desk at /admin/sessions. Searchable active sessions + users, revoke one
 * session, sign a user out everywhere, suspend / unsuspend, and the audit log of admin actions.
 * Hidden unless admin (the page shows "nothing here"); every call is re-checked server-side (403).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, Monitor, RefreshCw, ScrollText, Search, ShieldCheck, Smartphone, Tablet, UserCheck, UserX } from "lucide-react";
import { adminSessionAction, adminSessionsBoard, amISessionAdmin, type AdminSessionAction } from "./api";
import { ago, when } from "./format";
import "./sessions.css";

type Board = Awaited<ReturnType<typeof adminSessionsBoard>>;

const ACTION_LABEL: Record<string, string> = {
  revoke_session: "Revoked a session",
  revoke_all_sessions: "Signed out everywhere",
  suspend_user: "Suspended",
  unsuspend_user: "Unsuspended",
  grant_manager: "Made manager",
  remove_manager: "Removed manager",
};

function Kind({ kind }: { kind: string }) {
  const s = { width: 15, height: 15, display: "inline", verticalAlign: -2, marginRight: 6 } as const;
  if (kind === "phone") return <Smartphone style={s} aria-hidden="true" />;
  if (kind === "tablet") return <Tablet style={s} aria-hidden="true" />;
  return <Monitor style={s} aria-hidden="true" />;
}

export function AdminSessionsDesk() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    amISessionAdmin()
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);
  if (admin === null) return <main className="ndu-desk" aria-busy="true" />;
  if (!admin)
    return (
      <main className="ndu-desk grid place-items-center">
        <div className="text-center">
          <p className="font-display text-3xl">Nothing here</p>
          <Link to="/" className="ndu-pill" style={{ marginTop: 16 }}>
            Back to the map
          </Link>
        </div>
      </main>
    );
  return <Desk />;
}

function Desk() {
  const [q, setQ] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const qRef = useRef(q);
  qRef.current = q;

  const load = useCallback(async () => {
    try {
      setBoard(await adminSessionsBoard({ data: { q: qRef.current } }));
      setErr("");
    } catch (e) {
      setErr((e as Error)?.message || "Couldn't load the desk");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function act(action: AdminSessionAction, id: string, confirmText: string, ask = false) {
    let reason = "";
    if (ask) {
      const r = window.prompt(`${confirmText}\nReason (optional, shown in the audit log):`, "");
      if (r === null) return;
      reason = r;
    } else if (!window.confirm(confirmText)) return;
    setBusy(`${action}:${id}`);
    try {
      await adminSessionAction({ data: { action, id, reason } });
      await load();
    } catch (e) {
      setErr((e as Error)?.message || "That didn't go through");
    } finally {
      setBusy(null);
    }
  }

  const sessions = board?.sessions ?? [];
  const users = board?.users ?? [];
  const suspended = users.filter((u) => u.suspended).length;
  const signedIn = new Set(sessions.map((s) => s.userId)).size;

  return (
    <main className="ndu-desk">
      <header className="ndu-desk__bar">
        <ShieldCheck aria-hidden="true" style={{ color: "var(--color-accent)" }} />
        <span className="ndu-desk__brand">Sessions desk</span>
        <label className="ndu-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name, email or id" aria-label="Search" />
        </label>
        <button type="button" className="ndu-pill" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </button>
        <Link to="/admin" className="ndu-pill">
          Managers
        </Link>
        <Link to="/" className="ndu-pill ndu-pill--hot">
          Map
        </Link>
      </header>

      {board && !board.schema ? (
        <p className="ndu-banner" role="status">
          Suspension, last-active, places and the audit log switch on once migration 0012 is applied to this database. Listing and revoking sessions work now.
        </p>
      ) : null}
      {err ? (
        <p className="ndu-banner" role="alert">
          {err}
        </p>
      ) : null}

      <section className="ndu-desk__stats" aria-label="Totals">
        <div className="ndu-stat">
          <b>{sessions.length}</b>
          <span>Active sessions</span>
        </div>
        <div className="ndu-stat">
          <b>{signedIn}</b>
          <span>People signed in</span>
        </div>
        <div className="ndu-stat">
          <b>{suspended}</b>
          <span>Suspended</span>
        </div>
        <div className="ndu-stat">
          <b>{board?.audit.length ?? 0}</b>
          <span>Recent admin actions</span>
        </div>
      </section>

      <div className="ndu-desk__grid">
        <section className="ndu-panel" aria-label="Active sessions">
          <h2>
            <Monitor aria-hidden="true" /> Active sessions
          </h2>
          <div className="ndu-panel__scroll">
            <table className="ndu-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Device</th>
                  <th>Place · network</th>
                  <th>Signed in</th>
                  <th>Last active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name || "—"}
                      <div className="muted">{s.email}</div>
                    </td>
                    <td>
                      <Kind kind={s.kind} />
                      {s.device}
                    </td>
                    <td>
                      {s.place ?? "Unknown"}
                      <div className="muted">{s.network ?? ""}</div>
                    </td>
                    <td className="muted">{when(s.signedInAt)}</td>
                    <td className="muted">{ago(s.lastActiveAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="ndu-pill ndu-pill--sm"
                        disabled={busy !== null}
                        onClick={() => void act("revoke_session", s.id, `Sign out ${s.email ?? "this person"} on ${s.device}?`)}
                      >
                        <LogOut aria-hidden="true" />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {board && sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No active sessions{q ? " match" : ""}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ndu-panel" aria-label="People">
          <h2>
            <UserCheck aria-hidden="true" /> People
          </h2>
          <div className="ndu-panel__scroll">
            {users.map((u) => (
              <div key={u.id} className="ndu-user">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }} className="truncate">
                    {u.name || u.email || u.id}
                  </p>
                  <p className="truncate" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                    {u.email} · {u.sessions} session{u.sessions === 1 ? "" : "s"} · active {ago(u.lastActiveAt)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
                  {u.admin ? <span className="ndu-tag ndu-tag--calm">Admin</span> : null}
                  {u.suspended ? <span className="ndu-tag ndu-tag--warn">Suspended</span> : null}
                </div>
                <div className="ndu-user__acts">
                  <button
                    type="button"
                    className="ndu-pill ndu-pill--sm"
                    disabled={busy !== null || u.sessions === 0}
                    onClick={() => void act("revoke_user", u.id, `Sign ${u.email ?? u.id} out on every device?`)}
                  >
                    <LogOut aria-hidden="true" />
                    Sign out everywhere
                  </button>
                  {u.suspended ? (
                    <button type="button" className="ndu-pill ndu-pill--sm" disabled={busy !== null} onClick={() => void act("unsuspend", u.id, `Let ${u.email ?? u.id} sign in again?`)}>
                      <UserCheck aria-hidden="true" />
                      Unsuspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ndu-pill ndu-pill--sm ndu-pill--danger"
                      disabled={busy !== null || !board?.schema}
                      title={board?.schema ? undefined : "Needs migration 0012"}
                      onClick={() => void act("suspend", u.id, `Suspend ${u.email ?? u.id}? They are signed out everywhere and can't sign in.`, true)}
                    >
                      <UserX aria-hidden="true" />
                      Suspend
                    </button>
                  )}
                </div>
                {u.suspendedReason ? <p style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-muted)" }}>Reason: {u.suspendedReason}</p> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ndu-panel" style={{ marginTop: 18 }} aria-label="Audit log">
        <h2>
          <ScrollText aria-hidden="true" /> Audit log
        </h2>
        {board?.audit.length ? (
          <ul className="ndu-audit">
            {board.audit.map((a) => (
              <li key={a.id}>
                <span className="muted">{when(a.at)}</span>
                <span>{a.actor}</span>
                <span>{ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="muted truncate">
                  {a.target ?? ""}
                  {a.detail ? ` · ${a.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-muted)", padding: "0 4px" }}>{board?.schema ? "No admin actions yet." : "Turns on with migration 0012."}</p>
        )}
      </section>
    </main>
  );
}
