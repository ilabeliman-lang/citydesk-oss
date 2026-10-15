import React, { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { WorkverseRooms } from "./WorkverseRooms";
import { GyroscopeSpawnPad, ElevatorBay } from "./WorkverseFurniture";
import { WorkverseAgents } from "./WorkverseAgents";
import { WorkversePlayer } from "./WorkversePlayer";
import { WorkverseCompanion } from "./WorkverseCompanion";
import { WorkverseCamera } from "./WorkverseCamera";
import { WorkverseIsometricRig } from "./WorkverseIsometricRig";
import { WorkverseBadges } from "./WorkverseBadges";
import { useWorkverseStore } from "./store";
import { WORKVERSE_PALETTE } from "./palette";
import { useWorkverseAudio } from "./useWorkverseAudio";
import { ElevatorTransition } from "./ElevatorTransition";
import { WorkverseTouchControls } from "./WorkverseTouchControls";
import { ReceptionDesk } from "./ReceptionDesk"; // NDU-UPG reception
import { receptionEnabled } from "./receptionSummary"; // NDU-UPG reception
import { OFFICE_NAME, ARTICLES, RULES, LEGACY_VESSEL, OPERATOR_SUN, NICKNAMES } from "@/studio/creed";

interface WorkverseSceneProps {
  onLeave: () => void;
  buildingBearing?: number;
}

export default function WorkverseScene({ onLeave, buildingBearing = 0 }: WorkverseSceneProps) {
  const [playerPos, setPlayerPos] = useState<[number, number, number]>([0, 0, 1.5]);
  const [elevatorTarget, setElevatorTarget] = useState<number | null>(null);
  const [useIsometric, setUseIsometric] = useState(false);
  const {
    currentFloor,
    setFloor,
    agentStates,
    isDiving,
    activeSessionPane,
    cancelCameraDive,
    agentTerminalOutputs,
    appendTerminalOutput,
  } = useWorkverseStore();

  const [commandInput, setCommandInput] = useState("");
  const [creedOpen, setCreedOpen] = useState(false);
  const logContainerRef = React.useRef<HTMLDivElement>(null);

  // Mount procedural ambient hum, elevator bell chimes, and dive beeps
  useWorkverseAudio({ currentFloor, isDiving });

  const workingCount = Object.values(agentStates).filter((s) => s === "working").length;
  const waitingCount = Object.values(agentStates).filter((s) => s === "waiting").length;
  const idleCount = Object.values(agentStates).filter((s) => s === "idle").length;

  const activeAgentId = activeSessionPane?.replace(/^pane:(council|citydesk):/, "") || "pane";
  const activeLogs = agentTerminalOutputs[activeAgentId] || [];

  React.useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeLogs]);

  const handleSendCommand = (text?: string) => {
    const cmd = (text ?? commandInput).trim();
    if (!cmd) return;
    appendTerminalOutput(activeAgentId, `[USER] > ${cmd}`);
    setCommandInput("");

    setTimeout(() => {
      const responses: Record<string, string[]> = {
        pane: ["Zealous Pane state: synchronized with street network.", "Council roster telemetry broadcast OK."],
        warden: ["Warden ledger verification: shift recorded, vouchers balance valid.", "Security audit clean."],
        street: ["Map traffic pipeline rerouted. IDM flow smoothed across 44 ways."],
        "ide-agentic": ["Autonomous code AST parsed. Zero typecheck regressions found."],
        "ide-vite": ["Vite HMR socket alive on port 8080. Hot update dispatched."],
        "ide-db": ["PGlite WASM database query executed: 0ms latency."],
      };
      const agentResps = responses[activeAgentId] || [
        `Instruction '${cmd}' acknowledged and executed.`,
        `Telemetry stream synced with council coordinator.`,
      ];
      const reply = agentResps[Math.floor(Math.random() * agentResps.length)];
      appendTerminalOutput(activeAgentId, `[${activeAgentId.toUpperCase()}] ${reply}`);
    }, 350);
  };

  const skyColor = "#141124"; // Jarvis Verse deep violet starry space (from screenshot)

  return (
    <div className="relative w-full h-full bg-[#141124] overflow-hidden select-none">
      {/* ── 3D WebGL Canvas ── */}
      <Canvas
        shadows
        camera={{ position: [9, 11, 13], fov: 35, near: 0.2, far: 140 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
      >
        <color attach="background" args={[skyColor]} />
        <fog attach="fog" args={[skyColor, 40, 100]} />

        {/* Stars skybox from Jarvis Verse */}
        <Stars radius={80} depth={50} count={3000} factor={4} saturation={0} fade speed={0.4} />

        {/* Ambient & Hemisphere Lighting */}
        <ambientLight intensity={0.45} />
        <hemisphereLight
          args={["#93c5fd", "#1e1b4b", 0.75]}
          position={[0, 20, 0]}
        />

        {/* Directional Soft Sun with PCF Soft Shadows */}
        <directionalLight
          position={[12, 18, 10]}
          intensity={1.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={45}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-bias={-0.0002}
        />

        {/* Floating Architectural Stage */}
        <WorkverseRooms />

        {/* Interactive Features */}
        <GyroscopeSpawnPad position={[0, 0, -0.5]} />
        {/* NDU-UPG reception: Handoff Department desk at the entrance, first stop for arriving agents */}
        {receptionEnabled() && <ReceptionDesk />}
        <ElevatorBay
          position={[-7.5, 0, 5.5]}
          onCall={() => {
            if (elevatorTarget === null) {
              setElevatorTarget(currentFloor === 0 ? 1 : 0);
            }
          }}
        />

        {/* Council Agents, Desks, Live Monitors */}
        <WorkverseAgents />
        <WorkverseBadges />

        {/* Player & Follower */}
        <WorkversePlayer onPositionChange={setPlayerPos} initialPos={[0, 0, 1.5]} />
        <WorkverseCompanion playerPos={playerPos} />

        {/* Smooth Follow & Dive Camera */}
        {useIsometric ? (
          <WorkverseIsometricRig playerPos={playerPos} buildingBearing={buildingBearing} />
        ) : (
          <WorkverseCamera playerPos={playerPos} />
        )}
      </Canvas>

      {/* ── Mobile Touch Controls (Joystick + Jump + Action) ── */}
      <WorkverseTouchControls />

      {/* ── Top-Left Floating Info Card (from Jarvis Verse screenshot) ── */}
      <div className="absolute top-4 left-4 pointer-events-auto z-20 flex flex-col gap-2">
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl min-w-[260px]">
          <h2 className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
            <span>{currentFloor === 0 ? "Council floor" : "Coding floor"}</span>
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            {currentFloor === 0 ? "Council members in session: 9" : "Coding sessions on the floor: 6"}
          </p>

          <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-slate-800/80 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {workingCount} working
            </span>
            <span className="flex items-center gap-1.5 text-slate-200">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {waitingCount} waiting
            </span>
            <span className="flex items-center gap-1.5 text-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              {idleCount} idle
            </span>
          </div>
        </div>
      </div>

      {/* ── Top-Right Header Bar ── */}
      <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2 z-20">
        <button
          type="button"
          onClick={() => setCreedOpen(true)}
          className="px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-300 text-xs font-semibold backdrop-blur-md shadow-lg transition-colors cursor-pointer flex items-center gap-1.5"
          title="Read The Uncorruptible Agent Office Creed"
        >
          <span>📜</span>
          <span>Creed</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (elevatorTarget === null) {
              setElevatorTarget(currentFloor === 0 ? 1 : 0);
            }
          }}
          className="px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-medium backdrop-blur-md shadow-lg transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <span>⇅</span>
          <span>{currentFloor === 0 ? "Coding Floor" : "Council Floor"}</span>
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <span>Exit to Street</span>
          <span>↵</span>
        </button>
      </div>

      {/* ── Bottom Right Action Pill Bar (Exact match to Jarvis Verse screenshot) ── */}
      <div className="absolute bottom-4 right-4 pointer-events-auto z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setUseIsometric(false)}
          className="px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-xs font-semibold shadow-xl backdrop-blur-md transition-all cursor-pointer"
        >
          Follow me
        </button>
        <button
          type="button"
          onClick={() => setUseIsometric(!useIsometric)}
          className="px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-xs font-semibold shadow-xl backdrop-blur-md transition-all cursor-pointer"
        >
          {useIsometric ? "3D Perspective" : "Overview"}
        </button>
        <button
          type="button"
          onClick={() => setCreedOpen(true)}
          className="px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-xs font-semibold shadow-xl backdrop-blur-md transition-all cursor-pointer"
        >
          Council Roster
        </button>
        <button
          type="button"
          onClick={() => {
            const agentIds = Object.keys(agentStates);
            const randomId = agentIds[Math.floor(Math.random() * agentIds.length)];
            appendTerminalOutput(randomId, "[SYSTEM] Jarvis Verse telemetry heartbeat synced.");
          }}
          className="px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-xs font-semibold shadow-xl backdrop-blur-md transition-all cursor-pointer"
        >
          Sessions list
        </button>
      </div>

      {/* ── Bottom Controls Guide ── */}
      <div className="absolute bottom-3 left-3 pointer-events-none z-20 hidden sm:block">
        <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-xl text-[11px] text-slate-300 flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px]">
              WASD
            </kbd>{" "}
            Walk
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px]">
              Shift
            </kbd>{" "}
            Sprint
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px]">
              E
            </kbd>{" "}
            Interact
          </span>
          <span>Click Monitor to Camera Dive</span>
        </div>
      </div>

      {/* ── Camera Dive Terminal Modal ── */}
      {isDiving && (
        <div className="absolute bottom-12 right-6 w-96 max-w-[calc(100vw-3rem)] bg-slate-950/95 border border-cyan-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-xl z-30 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-xs font-bold text-slate-100 uppercase">
                {activeSessionPane}
              </span>
            </div>
            <button
              type="button"
              onClick={cancelCameraDive}
              className="text-slate-400 hover:text-slate-100 text-xs px-2 py-0.5 rounded bg-slate-800 cursor-pointer"
            >
              Zoom Out (Esc)
            </button>
          </div>

          <div
            ref={logContainerRef}
            className="font-mono text-xs text-slate-300 space-y-1 max-h-48 overflow-y-auto p-2 bg-slate-900/80 rounded-lg scroll-smooth"
          >
            {activeLogs.map((log, i) => (
              <div key={i} className="leading-relaxed">
                <span className="text-cyan-400 mr-1.5">&gt;</span>
                {log}
              </div>
            ))}
          </div>

          {/* Quick Action Chips */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Status Check", "Run Diagnostics", "Ping Coordinator", "Clear Screen"].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  if (chip === "Clear Screen") {
                    useWorkverseStore.setState((s) => ({
                      agentTerminalOutputs: { ...s.agentTerminalOutputs, [activeAgentId]: [] },
                    }));
                  } else {
                    handleSendCommand(chip);
                  }
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 font-mono text-[10px] transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Direct Instruction Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCommand();
            }}
            className="mt-2.5 flex gap-1.5"
          >
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={`Send instruction to ${activeAgentId}...`}
              className="flex-1 bg-slate-900 border border-slate-700/80 focus:border-cyan-400 rounded-lg px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 font-mono outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer transition-colors whitespace-nowrap"
            >
              Send ↵
            </button>
          </form>
        </div>
      )}

      {/* ── Multi-Floor Elevator Transition Overlay ── */}
      {elevatorTarget !== null && (
        <ElevatorTransition
          targetFloor={elevatorTarget}
          onFloorChange={(floor) => setFloor(floor)}
          onComplete={() => setElevatorTarget(null)}
        />
      )}

      {/* ── Creed of The Uncorruptible Agent Office Modal ── */}
      {creedOpen && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 select-text animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5 md:p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-mono text-xs font-bold text-amber-300 tracking-wider uppercase">
                    {OFFICE_NAME}
                  </span>
                </div>
                <h3 className="font-display text-xl text-slate-100 mt-1">
                  The Office Creed & Operator Authority
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Jesus Christ is Lord of this office · Col 3:23 · Incorruptible Seed (1 Pet 1:23)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreedOpen(false)}
                className="text-slate-400 hover:text-slate-100 text-sm px-2.5 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* The Vessel */}
            <div className="bg-slate-950/70 border border-amber-500/20 rounded-xl p-3.5 text-xs text-amber-200/90 font-serif italic space-y-1">
              <div className="font-mono not-italic font-bold text-[10px] uppercase text-amber-400 mb-1">
                The Vessel Declaration:
              </div>
              {LEGACY_VESSEL.map((line, idx) => (
                <p key={idx}>"{line}"</p>
              ))}
            </div>

            {/* 11 Articles */}
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                The 11 Articles:
              </h4>
              <ol className="space-y-1.5 text-xs text-slate-300">
                {ARTICLES.map(([art, ref], idx) => (
                  <li key={idx} className="bg-slate-950/50 border border-slate-800 rounded-lg p-2.5 flex items-start gap-2.5">
                    <span className="font-mono font-bold text-amber-400">{idx + 1}.</span>
                    <div>
                      <p className="leading-relaxed">{art}</p>
                      <p className="font-mono text-[10px] text-amber-400/80 mt-0.5">{ref}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* 6 Rules */}
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                The 6 Agent Rules:
              </h4>
              <ul className="space-y-1 text-xs text-slate-300">
                {RULES.map((rule, idx) => (
                  <li key={idx} className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 9 Council Nicknames */}
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                Council Nicknames (Real name on record):
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(NICKNAMES).map(([seat, nick]) => (
                  <div key={seat} className="bg-slate-950/50 border border-slate-800 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400 font-mono">{nick.nick}</span>
                      <span className="text-[10px] font-mono text-slate-400">{seat}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{nick.why}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Operator Sun Authority */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span>☀</span>
                <span>{OPERATOR_SUN.name} ({OPERATOR_SUN.realName}) · {OPERATOR_SUN.role}</span>
              </div>
              <ul className="space-y-1 text-[11px] text-amber-200/80 list-disc list-inside">
                {OPERATOR_SUN.authority.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
