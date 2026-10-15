import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { getFigureColors } from "./toyFigure";
import type { AgentState } from "./types";

interface ToyFigureProps {
  id: string;
  name: string;
  state?: AgentState;
  isSeated?: boolean;
  isPlayer?: boolean;
  onClick?: () => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function ToyFigure({
  id,
  name,
  state = "idle",
  isSeated = false,
  isPlayer = false,
  onClick,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: ToyFigureProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);

  const colors = isPlayer
    ? { shirt: "#e8843a", pants: "#18181b", hair: "#1c1917", skin: "#d4a373", shoes: "#f8fafc" }
    : getFigureColors(id);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (state === "working" && isSeated) {
      // Typing jitter
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = -1.2 + Math.sin(t * 12 + 1) * 0.15;
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -1.2 + Math.cos(t * 14) * 0.15;
      }
      if (headRef.current) {
        headRef.current.rotation.x = 0.15 + Math.sin(t * 4) * 0.05;
      }
    } else if (state === "waiting") {
      // Waving arm
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -2.4;
        rightArmRef.current.rotation.z = Math.sin(t * 8) * 0.4;
      }
    }
  });

  const stateBadgeColor =
    state === "working"
      ? "#22c55e"
      : state === "waiting"
        ? "#f59e0b"
        : "#94a3b8";

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Overhead Status Billboard Badge */}
      <Html
        position={[0, 1.45, 0]}
        center
        distanceFactor={14}
        style={{ pointerEvents: "none" }}
      >
        <div className="flex flex-col items-center select-none">
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold tracking-wide backdrop-blur-md shadow-lg ${
              isPlayer
                ? "bg-amber-950/80 border-amber-400 text-amber-200"
                : "bg-slate-900/85 border-slate-700/80 text-slate-100"
            }`}
          >
            {isPlayer ? (
              <span className="text-amber-400">★</span>
            ) : (
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: stateBadgeColor }}
              />
            )}
            <span>{name}</span>
            {!isPlayer && state !== "idle" && (
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-normal">
                · {state}
              </span>
            )}
          </div>
        </div>
      </Html>

      {/* Head Group */}
      <group ref={headRef} position={[0, isSeated ? 0.85 : 0.95, 0]}>
        {/* Head Sphere */}
        <mesh castShadow>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshStandardMaterial color={colors.skin} roughness={0.6} />
        </mesh>

        {/* Hair Cap */}
        <mesh position={[0, 0.06, -0.02]} castShadow>
          <sphereGeometry args={[0.23, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={colors.hair} roughness={0.7} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-0.07, 0.02, 0.19]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.07, 0.02, 0.19]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>

        {/* Cheerful Smile */}
        <mesh position={[0, -0.05, 0.185]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.035, 0.008, 8, 16, Math.PI]} />
          <meshBasicMaterial color="#b91c1c" />
        </mesh>
      </group>

      {/* Torso / Shirt */}
      <mesh
        position={[0, isSeated ? 0.52 : 0.62, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.15, 0.17, 0.32, 18]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.7} />
      </mesh>

      {/* Arms */}
      <mesh
        ref={leftArmRef}
        position={[-0.2, isSeated ? 0.56 : 0.66, isSeated ? 0.08 : 0]}
        rotation={isSeated ? [-1.1, 0.2, 0] : [0, 0, 0.15]}
        castShadow
      >
        <capsuleGeometry args={[0.045, 0.22, 6, 8]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.7} />
      </mesh>
      <mesh
        ref={rightArmRef}
        position={[0.2, isSeated ? 0.56 : 0.66, isSeated ? 0.08 : 0]}
        rotation={isSeated ? [-1.1, -0.2, 0] : [0, 0, -0.15]}
        castShadow
      >
        <capsuleGeometry args={[0.045, 0.22, 6, 8]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.7} />
      </mesh>

      {/* Legs & Chunky Shoes */}
      {isSeated ? (
        // Seated Legs (Bent forward at 90°)
        <group position={[0, 0.38, 0]}>
          {/* Left Thigh forward */}
          <mesh position={[-0.08, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.22, 12]} />
            <meshStandardMaterial color={colors.pants} roughness={0.8} />
          </mesh>
          {/* Right Thigh forward */}
          <mesh position={[0.08, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.22, 12]} />
            <meshStandardMaterial color={colors.pants} roughness={0.8} />
          </mesh>
          {/* Left Calf down */}
          <mesh position={[-0.08, -0.16, 0.22]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.24, 12]} />
            <meshStandardMaterial color={colors.pants} roughness={0.8} />
          </mesh>
          {/* Right Calf down */}
          <mesh position={[0.08, -0.16, 0.22]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.24, 12]} />
            <meshStandardMaterial color={colors.pants} roughness={0.8} />
          </mesh>
          {/* Shoes */}
          <mesh position={[-0.08, -0.32, 0.24]} castShadow>
            <boxGeometry args={[0.1, 0.08, 0.14]} />
            <meshStandardMaterial color={colors.shoes} roughness={0.4} />
          </mesh>
          <mesh position={[0.08, -0.32, 0.24]} castShadow>
            <boxGeometry args={[0.1, 0.08, 0.14]} />
            <meshStandardMaterial color={colors.shoes} roughness={0.4} />
          </mesh>
        </group>
      ) : (
        // Standing Legs
        <group position={[0, 0.24, 0]}>
          <mesh position={[-0.08, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.055, 0.38, 12]} />
            <meshStandardMaterial color={colors.pants} roughness={0.8} />
          </mesh>
          <mesh position={[0.08, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.055, 0.38, 12]} />
            <meshStandardMaterial color={colors.pants} roughness={0.8} />
          </mesh>
          {/* Chunky Sneakers */}
          <mesh position={[-0.08, -0.21, 0.03]} castShadow>
            <boxGeometry args={[0.1, 0.09, 0.16]} />
            <meshStandardMaterial color={colors.shoes} roughness={0.4} />
          </mesh>
          <mesh position={[0.08, -0.21, 0.03]} castShadow>
            <boxGeometry args={[0.1, 0.09, 0.16]} />
            <meshStandardMaterial color={colors.shoes} roughness={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}
