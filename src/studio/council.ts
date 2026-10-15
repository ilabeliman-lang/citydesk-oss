import { NICKNAMES } from "./creed";

export interface CouncilDesk {
  id: string;
  name: string;
  module: string;
  duty: string;
  nick?: string;
  seat?: string;
  role?: string;
  why?: string;
}

/** The 9 Seats of The Uncorruptible Agent Office Council */
export const UNCORRUPTIBLE_COUNCIL: CouncilDesk[] = [
  {
    id: "iman",
    name: "iman agent",
    nick: "iman",
    seat: "ai-grok",
    module: "Chief of Staff",
    duty: "Chief of staff · iman agent (grok CLI). Keeps his own name.",
    why: NICKNAMES["ai-grok"].why,
  },
  {
    id: "Nehemiah",
    name: "Jarvis",
    nick: "Nehemiah",
    seat: "ai-jarvis",
    module: "Orchestration",
    duty: "Jarvis orchestrator (:47821) · the faithful steward and organizer (Neh 2:4-8).",
    why: NICKNAMES["ai-jarvis"].why,
  },
  {
    id: "Bezalel",
    name: "OpenCode",
    nick: "Bezalel",
    seat: "ai-opencode",
    module: "Builder Core",
    duty: "Builder · OpenCode. The craftsman filled with skill (Exod 31:3).",
    why: NICKNAMES["ai-opencode"].why,
  },
  {
    id: "Ant",
    name: "Local LLM",
    nick: "Ant",
    seat: "ai-local",
    module: "Private Inference",
    duty: "Local LLM · private, CPU. Small, quiet and diligent (Prov 6:6-8).",
    why: NICKNAMES["ai-local"].why,
  },
  {
    id: "Boanerges",
    name: "Lightning API",
    nick: "Boanerges",
    seat: "ai-lightning",
    module: "Lightning Gateway",
    duty: "Lightning API · gemma-4-31B via LitServe gateway. Son of thunder (Mark 3:17).",
    why: NICKNAMES["ai-lightning"].why,
  },
  {
    id: "Samson",
    name: "GPU Local",
    nick: "Samson",
    seat: "ai-gpu",
    module: "Compute Force",
    duty: "GPU Local · uncensored GGUF on gpu-ollama. Great strength (Judg 16:28).",
    why: NICKNAMES["ai-gpu"].why,
  },
  {
    id: "Gideon",
    name: "Red Team Agent",
    nick: "Gideon",
    seat: "ai-redteam",
    module: "Security Triage",
    duty: "Red Team triage brain. Tests and sifts before battle (Judg 7:4).",
    why: NICKNAMES["ai-redteam"].why,
  },
  {
    id: "Watchman",
    name: "Router",
    nick: "Watchman",
    seat: "ai-auto",
    module: "Timekeeper & Clerk",
    duty: "Router · clerk & timekeeper. The router who sees and sends (Ezek 33:7).",
    why: NICKNAMES["ai-auto"].why,
  },
  {
    id: "Jethro",
    name: "Grok Build",
    nick: "Jethro",
    seat: "ai-grokbuild",
    module: "Counselor",
    duty: "Grok Build sessions · counselor who advised Moses (Exod 18:17-23).",
    why: NICKNAMES["ai-grokbuild"].why,
  },
];

/** Foundational CityDesk Infrastructure Desks */
export const CITYDESK_INFRA_COUNCIL: CouncilDesk[] = [
  {
    id: "pane",
    name: "Pane",
    module: "Office",
    duty: "Holds this roster. Nothing on the street moves until a desk is wired.",
  },
  {
    id: "warden",
    name: "Warden",
    module: "Saturday list",
    duty: "Chains plate, shift, NEPA, bench, tap, neighbor, then the rent mark.",
  },
  {
    id: "street",
    name: "Streetwright",
    module: "Block",
    duty: "Real roads from the map, the cars on them, and the person you walk or drive.",
  },
  {
    id: "body",
    name: "Body",
    module: "Citizen",
    duty: "The person you walk: wrapper, arms, legs, facing the way you move.",
  },
  {
    id: "ledger",
    name: "Ledger",
    module: "Vouchers",
    duty: "A history list only. Eat spends 10. The shift adds 30. No cash-out.",
  },
  {
    id: "signal",
    name: "Signal",
    module: "Chime",
    duty: "A quiet rising tone when a mission ends, and a tick when you act.",
  },
  {
    id: "gate",
    name: "Gate",
    module: "Age",
    duty: "The block does not open until you say you are 18 or older.",
  },
  {
    id: "navigator",
    name: "Navigator",
    module: "Walk",
    duty: "A is left, D is right, W is north. The stick matches the keys. Drive is the faster pace.",
  },
];

/** Combined Council roster */
export const COUNCIL = [...CITYDESK_INFRA_COUNCIL];
