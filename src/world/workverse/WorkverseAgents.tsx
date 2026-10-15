import React from "react";
import { useFrame } from "@react-three/fiber";
import { getArchetypeLayout } from "./archetypes";
import { DeskUnit, TaskChair } from "./WorkverseFurniture";
import { DeskMonitor } from "./WorkverseMonitors";
import { ToyFigure } from "./ToyFigure";
import { useWorkverseStore } from "./store";
import { DEPARTMENT_COLORS } from "./palette";

export function WorkverseAgents() {
  const { currentArchetype, floorAreaM2, currentFloor, agentStates, agentBehaviors, selectAgent, triggerCameraDive, tickAllBehaviors } = useWorkverseStore();
  const layout = getArchetypeLayout(currentArchetype, floorAreaM2, currentFloor);

  useFrame((_, delta) => {
    tickAllBehaviors(delta);
  });

  return (
    <group>
      {layout.desks.map((desk) => {
        const behavior = agentBehaviors[desk.memberId];
        const state = behavior?.currentState || agentStates[desk.memberId] || "working";
        const feltColor = DEPARTMENT_COLORS[desk.department] || "#3b82f6";
        const isSeated = behavior ? behavior.activity === "desk_work" : true;

        // Offset positions relative to desk
        const deskPos: [number, number, number] = [desk.x, desk.y, desk.z];
        const chairPos: [number, number, number] = [
          desk.x,
          desk.y,
          desk.z + (desk.rotation === 0 ? 0.6 : -0.6),
        ];
        
        const figurePos: [number, number, number] = behavior?.currentPosition || [
          desk.x,
          desk.y,
          desk.z + (desk.rotation === 0 ? 0.6 : -0.6),
        ];
        
        // Face the direction of movement, or face desk if seated
        let figureRot: [number, number, number] = [0, desk.rotation === 0 ? 0 : Math.PI, 0];
        if (behavior?.targetPosition) {
          const dx = behavior.targetPosition[0] - behavior.currentPosition[0];
          const dz = behavior.targetPosition[2] - behavior.currentPosition[2];
          if (dx !== 0 || dz !== 0) {
            figureRot = [0, Math.atan2(dx, dz), 0];
          }
        }

        return (
          <group key={desk.id}>
            {/* Desk Hardware */}
            <DeskUnit position={deskPos} rotation={[0, desk.rotation, 0]} feltColor={feltColor} />

            {/* Task Chair */}
            <TaskChair position={chairPos} rotation={[0, desk.rotation, 0]} />

            {/* Live Terminal Monitor */}
            <DeskMonitor
              agentId={desk.memberId}
              agentName={desk.name}
              position={deskPos}
              rotation={[0, desk.rotation, 0]}
            />

            {/* Seated Agent Figure */}
            <ToyFigure
              id={desk.memberId}
              name={desk.name}
              state={state}
              isSeated={isSeated}
              position={figurePos}
              rotation={figureRot}
              onClick={() => {
                selectAgent(desk.memberId);
                triggerCameraDive(
                  [desk.x, desk.y + 1.1, desk.z + (desk.rotation === 0 ? 0.4 : -0.4)],
                  `pane:citydesk:${desk.memberId}`,
                );
              }}
            />
          </group>
        );
      })}
    </group>
  );
}
