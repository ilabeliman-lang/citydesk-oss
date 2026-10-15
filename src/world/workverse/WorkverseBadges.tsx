import { Html } from "@react-three/drei";
import { useWorkverseStore } from "./store";
import { getWorkverseLayout } from "./layout";

export function WorkverseBadges() {
  const currentFloor = useWorkverseStore((s) => s.currentFloor);
  const agentStates = useWorkverseStore((s) => s.agentStates);
  const selectedAgentId = useWorkverseStore((s) => s.selectedAgentId);
  const selectAgent = useWorkverseStore((s) => s.selectAgent);
  const triggerCameraDive = useWorkverseStore((s) => s.triggerCameraDive);

  const layout = getWorkverseLayout(currentFloor);

  return (
    <group>
      {/* ── Checkpoints & Major Locations from Jarvis Verse ── */}
      {layout.waypoints.map((wp) => {
        let icon = "📍";
        if (wp.kind === "elevator") icon = "⇅";
        else if (wp.kind === "spawn") icon = "✦";
        else if (wp.kind === "mission_control") icon = "🎯";
        else if (wp.kind === "break_room") icon = "☕";

        return (
          <group key={`wp-${wp.id}`} position={[wp.x, 2.3, wp.z]}>
            <Html center distanceFactor={12} zIndexRange={[120, 0]}>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/90 border border-amber-500/80 shadow-[0_4px_16px_rgba(245,158,11,0.25)] backdrop-blur-md select-none hover:scale-105 transition-transform cursor-pointer">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0">
                  {icon}
                </span>
                <span className="text-amber-100 font-bold text-xs whitespace-nowrap tracking-wide">
                  {wp.label}
                </span>
              </div>
            </Html>
          </group>
        );
      })}

      {/* ── Player 'You' Gold Beacon Badge ── */}
      <group position={[0, 2.4, 1.5]}>
        <Html center distanceFactor={12} zIndexRange={[130, 0]}>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-xs shadow-[0_4px_20px_rgba(245,158,11,0.45)] select-none">
            <span>⭐</span>
            <span>You</span>
          </div>
        </Html>
      </group>

      {/* ── Agent Nameplates & Status Bubbles ── */}
      {layout.desks.map((desk) => {
        const state = agentStates[desk.memberId] || "idle";
        const isSelected = selectedAgentId === desk.memberId;

        let dotColor = "#64748b"; // idle
        let statusText = "Idle at desk";
        if (state === "working") {
          dotColor = "#22c55e";
          statusText = "Working";
        } else if (state === "waiting") {
          dotColor = "#f59e0b";
          statusText = "Waiting for review";
        }

        return (
          <group key={`badge-${desk.id}`} position={[desk.x, 2.05, desk.z]}>
            <Html center distanceFactor={11} zIndexRange={[110, 0]}>
              <div
                onClick={() => {
                  selectAgent(desk.memberId);
                  triggerCameraDive(
                    [desk.x, desk.y + 1.1, desk.z + (desk.rotation === 0 ? 0.4 : -0.4)],
                    `pane:citydesk:${desk.memberId}`
                  );
                }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl bg-slate-950/92 border ${
                  isSelected ? "border-cyan-400 ring-2 ring-cyan-400/30" : "border-slate-800"
                } shadow-2xl backdrop-blur-md select-none hover:border-slate-600 transition-all cursor-pointer`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-200 text-[10px] font-bold flex items-center justify-center font-mono">
                    ▲
                  </span>
                  <span className="text-slate-100 font-bold text-xs tracking-tight">
                    {desk.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span>{statusText}</span>
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
