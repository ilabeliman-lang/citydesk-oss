import { useEffect, useState } from "react";
import { listAgentMarket, registerThisMachine, tickAgent, type MarketAgent, type PoolNote } from "@/world/agents/market";
import { enrollPhoneSlot, enrollThisCpu, listUnits, type ProcessingUnit } from "@/world/agents/units";
import { dispatchTile } from "@/world/agents/dispatch";
import type { ChunkPlan } from "@/world/agents/chunks";

const EMPTY: ChunkPlan = { assignments: [], unassigned: 0, reason: "No idle unit can take this job." };

function PlanLine({ label, plan }: { label: string; plan: ChunkPlan }) {
  const who = plan.assignments.map((row) => `${row.unitId} ${Math.round(row.bytes / 1024)} KB`).join(", ");
  return <li>{label}: {plan.reason}{who ? ` ${who}.` : ""}</li>;
}

/** The machine-agent register. Listing is not a lease, and weights are not trained. */
export function AgentBoard() {
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [notes, setNotes] = useState<PoolNote[]>([]);
  const [units, setUnits] = useState<ProcessingUnit[]>([]);
  const [tile, setTile] = useState<ChunkPlan>(EMPTY);
  const [video, setVideo] = useState<ChunkPlan>(EMPTY);
  const [last, setLast] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = () => {
    void listAgentMarket().then((r) => {
      setAgents(r.agents);
      setNotes(r.notes);
      setLast(r.last);
    }).catch(() => undefined);
    void listUnits().then((r) => {
      setUnits(r.units);
      setTile(r.tile);
      setVideo(r.video);
    }).catch(() => undefined);
  };
  useEffect(load, []);

  return (
    <div className="space-y-2 rounded-xl bg-[#1c2740] p-3 text-sm">
      <p className="font-medium">Machine agents</p>
      <p className="text-xs text-[#b9c8ea]">This is the machine the street runs on, not your laptop. Lease stays closed. No stranger can run code here. There is no GPU, so nothing is fine-tuned.</p>
      <ul className="space-y-1 text-xs">
        {agents.length === 0 ? <li>No agent is registered yet.</li> : null}
        {agents.map((a) => (
          <li key={a.id}>{a.role} · v{a.version} · {a.kind}{a.modelName ? ` · ${a.modelName}` : ""} · lease closed</li>
        ))}
      </ul>
      <ul className="space-y-1 text-xs">
        {notes.map((n) => <li key={n.id}>{n.title} · v{n.version} · {n.body}</li>)}
      </ul>
      {last ? <p className="text-xs text-[#b9c8ea]">{last}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="h-9 rounded-full bg-[#5b8def] px-3 text-[#0b1220]" onClick={() => {
          void registerThisMachine().then((r) => {
            setNote(r.ok ? `Registered. ${r.kind}. Lease closed.` : "Could not register.");
            load();
          }).catch(() => setNote("Sign in to register this machine."));
        }}>Register this machine</button>
        <button type="button" className="h-9 rounded-full bg-white/10 px-3" onClick={() => {
          void tickAgent().then((r) => { setNote(r.reason); load(); }).catch(() => setNote("Sign in to run a step."));
        }}>Run one step</button>
      </div>
      <p className="font-medium pt-2">Idle units</p>
      <p className="text-xs text-[#b9c8ea]">A person enrolls their own CPU, phone, or small board. A phone can take a small tile. A video stays on a GPU. Devices found on the internet are not a pool.</p>
      <ul className="space-y-1 text-xs">
        {units.length === 0 ? <li>No unit is enrolled yet.</li> : null}
        {units.map((unit) => (
          <li key={unit.id}>{unit.label} · {unit.kind} · {unit.ramMb} MB · chunk {Math.round(unit.maxChunkBytes / 1024)} KB · {unit.idle ? "idle" : "not idle"} · lease closed</li>
        ))}
      </ul>
      <ul className="space-y-1 text-xs">
        <PlanLine label="256 KB tile" plan={tile} />
        <PlanLine label="1 MB video" plan={video} />
      </ul>
      <button type="button" className="h-9 rounded-full bg-white/10 px-3" onClick={() => {
        void enrollThisCpu().then((r) => {
          setNote(r.ok ? `CPU enrolled. ${r.ramMb} MB. Chunk ${Math.round(r.maxChunkBytes / 1024)} KB. Lease closed.` : "Could not enroll.");
          load();
        }).catch(() => setNote("Sign in to enroll this CPU."));
      }}>Enroll this CPU</button>
      <button type="button" className="h-9 rounded-full bg-white/10 px-3" onClick={() => {
        void enrollPhoneSlot().then((r) => {
          setNote(r.ok ? "Phone slot added. Offline until the phone checks in. 64 KB. Lease closed." : "Could not add a phone slot.");
          load();
        }).catch(() => setNote("Sign in to add a phone slot."));
      }}>Add a phone slot</button>
      <button type="button" className="h-9 rounded-full bg-white/10 px-3" onClick={() => {
        void dispatchTile().then((r) => {
          setNote(r.ok ? `${r.reason} Recorded ${r.bytes} bytes.` : r.reason);
          load();
        }).catch(() => setNote("Sign in to record a tile."));
      }}>Record a tile</button>
      {note ? <p className="text-xs">{note}</p> : null}
    </div>
  );
}
