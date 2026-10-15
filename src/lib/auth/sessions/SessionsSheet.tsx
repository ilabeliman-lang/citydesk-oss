/**
 * NDU-UPG sessions: Account → Sessions. Lists where you are signed in (device, coarse place, signed-in
 * time, last active, "this device") with sign out one / sign out all other devices.
 * Opened from the top pill's ⋯ menu (bubbles) or the /account/sessions page (classic, deep link).
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { LogOut, MapPin, Monitor, ShieldCheck, Smartphone, Tablet, X } from "lucide-react";
import { Bubble } from "@/world/bubbles/Bubble";
import { tapBuzz } from "@/world/bubbles/mode";
import { signOut } from "../client";
import { mySessions, revokeMyOtherSessions, revokeMySession } from "./api";
import { ago, when } from "./format";
import { closeSessionsSheet, useSessionsSheetOpen } from "./open-store";
import "./sessions.css";

type Data = Awaited<ReturnType<typeof mySessions>>;
type Row = Data["sessions"][number];

/** Mount once (the top pill does). Renders the sheet in a portal while open. */
export function SessionsSheetHost() {
  const isOpen = useSessionsSheetOpen();
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSessionsSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);
  if (!isOpen || typeof document === "undefined") return null;
  return createPortal(
    <div className="ndu-acct-scrim" onPointerDown={(e) => e.target === e.currentTarget && closeSessionsSheet()}>
      <SessionsPanel onClose={closeSessionsSheet} />
    </div>,
    document.body,
  );
}

function DeviceIcon({ kind }: { kind: string }) {
  if (kind === "phone") return <Smartphone aria-hidden="true" />;
  if (kind === "tablet") return <Tablet aria-hidden="true" />;
  return <Monitor aria-hidden="true" />;
}

export function SessionsPanel({ onClose, page = false }: { onClose?: () => void; page?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await mySessions());
      setErr("");
    } catch (e) {
      setErr((e as Error)?.message === "Unauthorized" ? "Sign in to see your sessions." : "Couldn't load your sessions. Try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOutOne(row: Row) {
    tapBuzz();
    setBusy(row.id);
    try {
      if (row.current) {
        await signOut();
        return;
      }
      await revokeMySession({ data: { id: row.id } });
      await load();
    } catch {
      setErr("That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signOutOthers() {
    tapBuzz();
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setBusy("others");
    try {
      await revokeMyOtherSessions();
      setConfirmAll(false);
      await load();
    } catch {
      setErr("That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const rows = data?.sessions ?? [];
  const others = rows.filter((r) => !r.current).length;

  return (
    <section className={`ndu-acct${page ? " ndu-acct--page" : ""}`} role="dialog" aria-modal={!page} aria-label="Sessions">
      {page ? null : <span className="ndu-acct__grip" aria-hidden="true" />}
      <div className="ndu-acct__head">
        <div>
          <p className="ndu-acct__title">Sessions</p>
          <p className="ndu-acct__sub">
            {data ? `Signed in on ${rows.length} device${rows.length === 1 ? "" : "s"}` : err ? "" : "Looking up your devices…"}
          </p>
        </div>
        {onClose ? (
          <Bubble size="sm" className="ndu-acct__close" label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </Bubble>
        ) : null}
      </div>

      {err ? <p className="ndu-acct__note" role="alert">{err}</p> : null}

      <div className="ndu-acct__list">
        {rows.map((row, i) => (
          <article key={row.id} className={`ndu-sess${row.current ? " ndu-sess--current" : ""}`} style={{ animationDelay: `${i * 45}ms` }}>
            <span className="ndu-bub ndu-sess__icon" aria-hidden="true" aria-pressed={row.current}>
              <DeviceIcon kind={row.kind} />
            </span>
            <p className="ndu-sess__name">
              {row.device}
              {row.current ? <span className="ndu-tag">This device</span> : null}
            </p>
            <p className="ndu-sess__meta">
              <MapPin aria-hidden="true" style={{ display: "inline", width: 12, height: 12, marginRight: 3, verticalAlign: -1 }} />
              {row.place ?? "Place unknown"}
              <br />
              Signed in {when(row.signedInAt)} · Active {row.current ? "now" : ago(row.lastActiveAt)}
            </p>
            <div className="ndu-sess__actions">
              <button type="button" className="ndu-pill ndu-pill--sm" disabled={busy !== null} onClick={() => void signOutOne(row)}>
                <LogOut aria-hidden="true" />
                {busy === row.id ? "Signing out…" : row.current ? "Sign out here" : "Sign out"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="ndu-acct__foot">
        <button
          type="button"
          className={`ndu-pill ${confirmAll ? "ndu-pill--danger" : "ndu-pill--hot"}`}
          disabled={busy !== null || others === 0}
          onClick={() => void signOutOthers()}
        >
          <LogOut aria-hidden="true" />
          {busy === "others" ? "Signing out…" : confirmAll ? `Tap again: sign out ${others} other${others === 1 ? "" : "s"}` : "Sign out all other devices"}
        </button>
        {data?.admin ? (
          <Link to="/admin/sessions" className="ndu-pill" onClick={() => onClose?.()}>
            <ShieldCheck aria-hidden="true" />
            Admin · sessions desk
          </Link>
        ) : null}
        <p className="ndu-acct__note">
          {data
            ? `You're signed out after ${fmtDays(data.idleDays)} without use, and ${fmtDays(data.absoluteDays)} after signing in. Places are rough, from your network, never GPS.`
            : null}
        </p>
      </div>
    </section>
  );
}

function fmtDays(d: number) {
  if (d < 1) return `${Math.round(d * 24)} hours`;
  const n = Math.round(d);
  return `${n} day${n === 1 ? "" : "s"}`;
}
