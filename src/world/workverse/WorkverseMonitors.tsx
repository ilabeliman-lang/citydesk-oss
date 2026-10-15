import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createTerminalCanvas } from "./terminalScreen";
import { useWorkverseStore } from "./store";

interface MonitorProps {
  agentId: string;
  agentName: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function DeskMonitor({
  agentId,
  agentName,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: MonitorProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { agentStates, agentTerminalOutputs, triggerCameraDive } = useWorkverseStore();

  const lines = agentTerminalOutputs[agentId] || ["INITIALIZING AGENT PANE..."];
  const state = agentStates[agentId] || "working";

  const texture = useMemo(() => {
    const canvas = createTerminalCanvas(agentName, lines, state);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [agentName, lines, state]);

  useEffect(() => {
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <group position={position} rotation={rotation}>
      {/* Monitor Display Frame */}
      <mesh position={[0, 1.05, -0.2]} castShadow>
        <boxGeometry args={[0.78, 0.46, 0.03]} />
        <meshStandardMaterial color="#0b0f19" roughness={0.3} />
      </mesh>

      {/* Screen Face with Live Canvas Texture */}
      <mesh
        ref={meshRef}
        position={[0, 1.05, -0.182]}
        onClick={(e) => {
          e.stopPropagation();
          // Camera dive target is right in front of the screen
          const worldPos: [number, number, number] = [
            position[0],
            position[1] + 1.05,
            position[2] + 0.35,
          ];
          triggerCameraDive(worldPos, `pane:citydesk:${agentId}`);
        }}
      >
        <planeGeometry args={[0.74, 0.42]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Secondary companion screen (angled slightly) */}
      <group position={[0.7, 1.05, -0.22]} rotation={[0, -0.25, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.62, 0.42, 0.03]} />
          <meshStandardMaterial color="#0b0f19" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.017]}>
          <planeGeometry args={[0.59, 0.39]} />
          <meshBasicMaterial color="#030712" />
        </mesh>
      </group>
    </group>
  );
}
