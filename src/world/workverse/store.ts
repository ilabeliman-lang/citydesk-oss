import { create } from "zustand";
import { COUNCIL } from "@/studio/council";
import type { AgentState, CouncilMember, BuildingArchetype } from "./types";
import { getArchetypeLayout } from "./archetypes";
import { tickBehavior, type AgentBehaviorState } from "./behavior";

import type { Shape } from "@/world/empty-state/footprint";

interface WorkverseState {
  currentArchetype: BuildingArchetype;
  floorAreaM2: number;
  currentFloor: number;
  spotShape: Shape | null;
  selectedAgentId: string | null;
  agentStates: Record<string, AgentState>;
  agentTerminalOutputs: Record<string, string[]>;
  agentBehaviors: Record<string, AgentBehaviorState>;
  isDiving: boolean;
  diveTarget: [number, number, number] | null;
  companionFollowing: boolean;
  activeSessionPane: string | null;

  setArchetype: (archetype: BuildingArchetype, area?: number) => void;
  setSpotShape: (shape: Shape | null) => void;
  setFloor: (floor: number) => void;
  selectAgent: (id: string | null) => void;
  setAgentState: (id: string, state: AgentState) => void;
  appendTerminalOutput: (id: string, line: string) => void;
  triggerCameraDive: (target: [number, number, number], paneId?: string) => void;
  cancelCameraDive: () => void;
  toggleCompanion: () => void;
  tickAllBehaviors: (dt: number) => void;
}

const DEFAULT_STATES: Record<string, AgentState> = {
  pane: "working",
  warden: "working",
  street: "working",
  body: "idle",
  ledger: "working",
  signal: "idle",
  gate: "idle",
  navigator: "working",
  // Coding Floor 1
  "ide-agentic": "working",
  "ide-vite": "working",
  "ide-db": "working",
  "ide-sim": "working",
  "ide-map": "working",
  "ide-audio": "idle",
};

const DEFAULT_OUTPUTS: Record<string, string[]> = {
  pane: [
    "UNCORRUPTIBLE CREED: ACTIVE",
    "JESUS CHRIST IS LORD · COL 3:23",
    "CHIEF OF STAFF: IMAN AGENT",
    "COUNCIL ROSTER VERIFIED (9 SEATS)",
  ],
  warden: [
    "NEHEMIAH: STEWARD & ORGANIZER (NEH 2:4)",
    "SATURDAY LIST: VERIFIED",
    "PLATE: CHECK · SHIFT: CONFIRMED",
    "NO LAZINESS REFUSED (PROV 6:6)",
  ],
  street: [
    "BEZALEL: CRAFTSMAN FILLED WITH SKILL",
    "MAPLIBRE 3D TILES: STREAMING",
    "ROAD NET: 44 WAYS LOADED",
    "BUILDING WITH INTEGRITY (EXOD 31:3)",
  ],
  body: [
    "ANT: DILIGENT & STEADFAST (PROV 6:6)",
    "AVATAR RIG 1.75M READY",
    "HEIRS IN CHRIST: LACK NO GOOD THING",
    "IK STEP PHASE: 0.42",
  ],
  ledger: [
    "GIDEON: TESTS AND SIFTS BEFORE BATTLE",
    "VOUCHER BALANCE: 340 V",
    "INCORRUPTIBLE LOGS PRESERVED",
    "BLOCK HEIGHT: DEVNET #992811",
  ],
  signal: [
    "BOANERGES: SON OF THUNDER (MARK 3:17)",
    "SYNTH OSCILLATOR: 440HZ A4",
    "MISSION CHIME ENGINE ARMED",
    "WORK HEARTILY AS TO THE LORD",
  ],
  gate: [
    "SAMSON: COMPUTE STRENGTH (JUDG 16:28)",
    "AGE VERIFICATION: 18+ CONFIRMED",
    "SUN OPERATOR GATE: AUTHORIZED",
    "SANDBOX POLICY: STRICT",
  ],
  navigator: [
    "WATCHMAN: ROUTER & TIMEKEEPER (EZEK 33:7)",
    "HEADING: 358° N",
    "A/D STEER: POLAR SYNCHRONIZED",
    "DUTY BOUND UNTIL COMPLETED",
  ],
  // Coding Floor 1
  "ide-agentic": [
    "AGENTIC RUNNER: ACTIVE",
    "AST ANALYZER: PARSED 48 MODULES",
    "AUTONOMOUS REFACTOR: COMPLETED",
    "TYPE CHECK PASS: 0 ERRORS",
    "WATCHING WORKSPACE: READY",
  ],
  "ide-vite": [
    "VITE v6.0.0 DEV SERVER READY",
    "LOCAL: HTTP://0.0.0.0:8080",
    "HMR ENGINE: WEBSOCKET ACTIVE",
    "BUILD LATENCY: 142MS",
    "OPTIMIZED DEPS: THREE, ZUSTAND, REACT",
  ],
  "ide-db": [
    "PGLITE WASM DATABASE: IN-MEMORY",
    "MIGRATIONS APPLIED: 0001_INIT",
    "ACTIVE CONNECTIONS: 4",
    "QUERY RATE: 128 QPS",
    "STORED VOUCHERS: 4,120 ROWS",
  ],
  "ide-sim": [
    "IDM VEHICLE SIMULATOR: RUNNING",
    "SIMULATION RATE: 60 FPS (16.6MS)",
    "ROAD NODES: 86 CONNECTED",
    "COLLISION DETECTORS: OPTIMAL",
    "AGENT BOID FORCES COMPUTED",
  ],
  "ide-map": [
    "MAPLIBRE GL 3D: STREAMING",
    "TILES LOADED: 64 VECTOR TILES",
    "COORDINATES: LAGOS METRO CORE",
    "CAMERA FRUSTUM CULLING: ON",
    "RENDER PASS: 60.0 FPS",
  ],
  "ide-audio": [
    "SPATIAL SYNTHESIZER: ACTIVE",
    "AUDIO CONTEXT: 48000 HZ STEREO",
    "SPATIAL NODES: 6 EMITTERS",
    "SYNTH PRESET: AMBIENT DRONE A4",
    "HRTF PANNING: ENABLED",
  ],
};

const INITIAL_BEHAVIORS: Record<string, AgentBehaviorState> = {};
[0, 1].forEach((floorId) => {
  const layout = getArchetypeLayout("flagship_verse", 400, floorId);
  layout.desks.forEach((desk) => {
    const state = DEFAULT_STATES[desk.memberId] || "working";
    const deskPos: [number, number, number] = [
      desk.x,
      desk.y,
      desk.z + (desk.rotation === 0 ? 0.6 : -0.6),
    ];
    INITIAL_BEHAVIORS[desk.memberId] = {
      agentId: desk.memberId,
      currentState: state,
      currentPosition: deskPos,
      targetPosition: null,
      deskPosition: deskPos,
      activityTimer: 20 + Math.random() * 20,
      activity: "desk_work",
    };
  });
});

export const useWorkverseStore = create<WorkverseState>((set, get) => ({
  currentArchetype: "flagship_verse",
  floorAreaM2: 400,
  currentFloor: 0,
  spotShape: null,
  selectedAgentId: null,
  agentStates: DEFAULT_STATES,
  agentTerminalOutputs: DEFAULT_OUTPUTS,
  agentBehaviors: INITIAL_BEHAVIORS,
  isDiving: false,
  diveTarget: null,
  companionFollowing: true,
  activeSessionPane: null,

  setSpotShape: (shape) => set({ spotShape: shape }),
  setArchetype: (archetype, area = 400) => {
    // When archetype changes, reset behaviors for new desks
    const layout = getArchetypeLayout(archetype, area, 0);
    const newBehaviors: Record<string, AgentBehaviorState> = {};
    layout.desks.forEach((desk) => {
      const state = "working";
      const deskPos: [number, number, number] = [
        desk.x,
        desk.y,
        desk.z + (desk.rotation === 0 ? 0.6 : -0.6),
      ];
      newBehaviors[desk.memberId] = {
        agentId: desk.memberId,
        currentState: state,
        currentPosition: deskPos,
        targetPosition: null,
        deskPosition: deskPos,
        activityTimer: 20 + Math.random() * 20,
        activity: "desk_work",
      };
    });
    set({ currentArchetype: archetype, floorAreaM2: area, currentFloor: 0, agentBehaviors: newBehaviors });
  },
  setFloor: (floor) => set({ currentFloor: floor }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgentState: (id, state) =>
    set((s) => {
      // Sync behavior state immediately
      const behavior = s.agentBehaviors[id];
      const newBehavior = behavior ? { ...behavior, currentState: state } : behavior;
      return { 
        agentStates: { ...s.agentStates, [id]: state },
        ...(newBehavior ? { agentBehaviors: { ...s.agentBehaviors, [id]: newBehavior } } : {})
      };
    }),
  appendTerminalOutput: (id, line) =>
    set((s) => {
      const prev = s.agentTerminalOutputs[id] || [];
      return {
        agentTerminalOutputs: {
          ...s.agentTerminalOutputs,
          [id]: [...prev.slice(-15), line],
        },
      };
    }),
  triggerCameraDive: (target, paneId) =>
    set({ isDiving: true, diveTarget: target, activeSessionPane: paneId ?? null }),
  cancelCameraDive: () =>
    set({ isDiving: false, diveTarget: null, activeSessionPane: null }),
  toggleCompanion: () =>
    set((s) => ({ companionFollowing: !s.companionFollowing })),
  tickAllBehaviors: (dt) => set((s) => {
    const layout = getArchetypeLayout(s.currentArchetype, s.floorAreaM2, s.currentFloor);
    const nextBehaviors = { ...s.agentBehaviors };
    let statesChanged = false;
    const nextStates = { ...s.agentStates };

    for (const [id, behavior] of Object.entries(s.agentBehaviors)) {
      const nextB = tickBehavior(behavior, dt, layout);
      nextBehaviors[id] = nextB;
      if (nextB.currentState !== nextStates[id]) {
        nextStates[id] = nextB.currentState;
        statesChanged = true;
      }
    }
    
    return {
      agentBehaviors: nextBehaviors,
      ...(statesChanged ? { agentStates: nextStates } : {})
    };
  }),
}));
