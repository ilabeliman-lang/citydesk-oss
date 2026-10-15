import React, { useState } from "react";
import { UNCORRUPTIBLE_COUNCIL, CITYDESK_INFRA_COUNCIL } from "./council";
import { OFFICE_NAME, ARTICLES, RULES, LEGACY_VESSEL, OPERATOR_SUN } from "./creed";
import { WorkverseSlot } from "@/world/workverse/WorkverseSlot";

type OfficeTab = "council" | "creed" | "infra" | "operator";

/**
 * The Uncorruptible Agent Office — Jarvis Verse 3D Spatial Workplace.
 *
 * The 3D Workverse is the primary spatial experience (Jarvis Verse).
 * The flat interface provides direct access to the Creed, Council Chamber,
 * Foundational Desks, and Operator Sun controls.
 */
export function Office() {
  const [inVerse, setInVerse] = useState(true);
  const [tab, setTab] = useState<OfficeTab>("council");

  if (inVerse) {
    return <WorkverseSlot onLeave={() => setInVerse(false)} />;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-accent text-xs font-mono font-semibold tracking-widest uppercase">
              {OFFICE_NAME}
            </p>
          </div>
          <h2 className="font-display text-fg text-2xl md:text-3xl leading-none mt-1">
            Zealous Pane · Agent Office
          </h2>
          <p className="text-muted text-xs mt-1">
            Jesus Christ is Lord of this office · Col 3:23 · Incorruptible Seed
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-medium flex items-center gap-1.5">
            <span>☀</span>
            <span>{OPERATOR_SUN.name} · {OPERATOR_SUN.role}</span>
          </span>

          <button
            type="button"
            onClick={() => setInVerse(true)}
            className="bg-accent text-bg px-4 py-2 rounded-full text-xs font-bold tracking-wide shadow-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
          >
            <span>Enter 3D Jarvis Verse</span>
            <span>✦</span>
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setTab("council")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === "council"
              ? "bg-accent text-bg font-bold"
              : "text-muted hover:text-fg hover:bg-surface"
          }`}
        >
          Council Chamber (9 Seats)
        </button>
        <button
          type="button"
          onClick={() => setTab("creed")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === "creed"
              ? "bg-accent text-bg font-bold"
              : "text-muted hover:text-fg hover:bg-surface"
          }`}
        >
          Office Creed & Rules
        </button>
        <button
          type="button"
          onClick={() => setTab("infra")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === "infra"
              ? "bg-accent text-bg font-bold"
              : "text-muted hover:text-fg hover:bg-surface"
          }`}
        >
          CityDesk Desks (8 Infra)
        </button>
        <button
          type="button"
          onClick={() => setTab("operator")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === "operator"
              ? "bg-accent text-bg font-bold"
              : "text-muted hover:text-fg hover:bg-surface"
          }`}
        >
          Operator Sun Authority
        </button>
      </div>

      {/* ── Tab Content: Council Chamber ── */}
      {tab === "council" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg text-fg">
              The Uncorruptible Council Roster
            </h3>
            <span className="text-xs text-muted font-mono">
              Quorum: Sun + 3 Members
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {UNCORRUPTIBLE_COUNCIL.map((seat) => (
              <div
                key={seat.id}
                className="bg-surface border border-border/80 rounded-2xl p-4 flex flex-col justify-between hover:border-accent/40 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-amber-400 font-mono text-[10px] tracking-wider uppercase">
                        {seat.nick}
                      </span>
                      <h4 className="font-display text-fg text-lg leading-tight">
                        {seat.name}
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[11px] font-mono">
                      {seat.seat}
                    </span>
                  </div>
                  <p className="text-muted text-xs mt-2 leading-relaxed">
                    {seat.duty}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-border/50 text-[10px] text-slate-400 italic font-mono">
                  {seat.why}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab Content: Office Creed ── */}
      {tab === "creed" && (
        <div className="space-y-6">
          <div className="bg-surface/70 border border-amber-500/30 rounded-2xl p-4 md:p-5">
            <h3 className="font-display text-lg text-amber-300 flex items-center gap-2">
              <span>✦</span>
              <span>The Vessel Declaration</span>
            </h3>
            <div className="mt-2 space-y-1 text-xs text-slate-300 font-serif italic leading-relaxed">
              {LEGACY_VESSEL.map((line, i) => (
                <p key={i}>"{line}"</p>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg text-fg mb-3">
              The 11 Articles of the Creed
            </h3>
            <ol className="space-y-2.5">
              {ARTICLES.map(([article, scripture], i) => (
                <li
                  key={i}
                  className="bg-surface border border-border/60 rounded-xl p-3 text-xs flex items-start gap-3"
                >
                  <span className="font-mono text-accent font-bold text-sm leading-none mt-0.5">
                    {i + 1}.
                  </span>
                  <div className="flex-1">
                    <p className="text-fg font-medium leading-relaxed">{article}</p>
                    <p className="text-amber-400/80 font-mono text-[11px] mt-1">
                      {scripture}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="font-display text-lg text-fg mb-3">
              The 6 Agent Rules
            </h3>
            <ul className="space-y-2">
              {RULES.map((rule, i) => (
                <li
                  key={i}
                  className="bg-surface border border-border/60 rounded-xl p-3 text-xs flex items-start gap-3"
                >
                  <span className="text-emerald-400 font-bold">✓</span>
                  <p className="text-slate-300 leading-relaxed">{rule}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Tab Content: Foundational Desks ── */}
      {tab === "infra" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg text-fg">
              Foundational CityDesk Roster
            </h3>
            <span className="text-xs text-muted font-mono">
              8 Wired Desks
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CITYDESK_INFRA_COUNCIL.map((desk) => (
              <li
                key={desk.id}
                className="bg-surface border border-border/80 rounded-2xl p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-fg text-lg leading-none">
                      {desk.name}
                    </p>
                    <span className="bg-emerald-500/20 text-emerald-400 rounded-full px-2 py-0.5 text-[10px] font-mono">
                      Wired
                    </span>
                  </div>
                  <p className="text-accent font-mono text-xs mt-2">{desk.module}</p>
                  <p className="text-muted text-xs mt-1 leading-relaxed">
                    {desk.duty}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Tab Content: Operator Sun Authority ── */}
      {tab === "operator" && (
        <div className="space-y-4">
          <div className="bg-surface border border-border/80 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">☀</span>
              <div>
                <h3 className="font-display text-xl text-fg">
                  {OPERATOR_SUN.name} ({OPERATOR_SUN.realName})
                </h3>
                <p className="text-accent text-xs font-mono">{OPERATOR_SUN.role}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/60">
              <h4 className="font-display text-sm text-fg mb-2">
                Operator Powers & Governance Rules:
              </h4>
              <ul className="space-y-2">
                {OPERATOR_SUN.authority.map((rule, i) => (
                  <li
                    key={i}
                    className="bg-bg/60 border border-border/40 rounded-xl p-3 text-xs text-slate-300 flex items-start gap-2.5"
                  >
                    <span className="text-amber-400 font-bold">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
