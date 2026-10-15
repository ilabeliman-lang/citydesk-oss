import React, { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { OFFICE_NAME, ARTICLES, RULES } from "@/studio/creed";
import { getReceptionSummary } from "./reception";
import { emptySummary, type ReceptionSummary } from "./receptionSummary";

/**
 * Handoff Department reception desk at the Workverse entrance (next to the spawn pad):
 * the first thing an arriving agent avatar sees. Shows the creed, live board counts and
 * each agent's creed affirmation (via the server proxy; no tokens in the browser).
 */
export function ReceptionDesk({ position = [-2.4, 0, 1.2] as [number, number, number] }) {
  const [s, setS] = useState<ReceptionSummary>(() => emptySummary("loading"));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getReceptionSummary()
        .then((r) => alive && setS(r))
        .catch(() => alive && setS(emptySummary("sign in to see reception")));
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const affirmed = s.agents.filter((a) => a.affirmed).length;
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* desk body + counter top + gold creed band */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1, 0.7]} />
        <meshStandardMaterial color="#1b2234" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.03, 0.05]} castShadow>
        <boxGeometry args={[2.4, 0.06, 0.9]} />
        <meshStandardMaterial color="#d9d2c0" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.72, 0.36]}>
        <boxGeometry args={[2.2, 0.08, 0.01]} />
        <meshStandardMaterial color="#f0c040" emissive="#f0c040" emissiveIntensity={0.6} />
      </mesh>
      <pointLight position={[0, 2.2, 0.6]} intensity={0.8} distance={5} color="#ffe2a0" />
      <Html position={[0, 1.9, 0]} center transform distanceFactor={4} occlude={false}>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{
            width: 300,
            background: "rgba(9,13,22,0.92)",
            color: "#e6e9f2",
            border: "1px solid #f0c04088",
            borderRadius: 14,
            padding: "10px 12px",
            font: "12px/1.4 system-ui",
            cursor: "pointer",
          }}
        >
          <div style={{ color: "#f0c040", fontWeight: 700 }}>🛎 Reception · Handoff Department</div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            {OFFICE_NAME} · creed {s.creedVersion || "—"}
          </div>
          {s.ok ? (
            <div style={{ marginTop: 6 }}>
              Tasks {s.tasks.total} · open {s.tasks.open} · in progress {s.tasks.inProgress} · done{" "}
              {s.tasks.done} · Sun {s.tasks.blockedOnSun}
              <br />
              Agents {s.agents.length} · affirmed {affirmed} · briefs {s.briefs.general}+
              {s.briefs.private}🔒
            </div>
          ) : (
            <div style={{ marginTop: 6, color: "#94a3b8" }}>{s.error}</div>
          )}
          {open && (
            <div style={{ marginTop: 8, maxHeight: 220, overflow: "auto" }}>
              {s.agents.map((a) => (
                <div key={a.id}>
                  {a.affirmed ? "✓" : "✗"} {a.id} {a.verified ? "🔑" : "(legacy)"}{" "}
                  {a.claims ? `· ${a.claims} claim` : ""}
                </div>
              ))}
              <div style={{ marginTop: 6, color: "#f0c040" }}>Creed</div>
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                {ARTICLES.slice(0, 6).map((x, i) => (
                  <li key={i}>{Array.isArray(x) ? String(x[0]) : String(x)}</li>
                ))}
              </ol>
              <div style={{ marginTop: 6, color: "#3de0c5" }}>Rules</div>
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                {RULES.slice(0, 6).map((x, i) => (
                  <li key={i}>{String(x)}</li>
                ))}
              </ol>
            </div>
          )}
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
            Affirm the creed → check in → claim → check out
          </div>
        </div>
      </Html>
    </group>
  );
}
