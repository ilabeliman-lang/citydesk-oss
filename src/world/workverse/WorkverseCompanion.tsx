import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useWorkverseStore } from "./store";

interface CompanionProps {
  playerPos: [number, number, number];
}

export function WorkverseCompanion({ playerPos }: { playerPos: [number, number, number] }) {
  const companionRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const { companionFollowing } = useWorkverseStore();

  const currentPos = useRef(new THREE.Vector3(playerPos[0] + 0.8, 1.1, playerPos[2] + 0.8));

  useFrame(({ clock }, delta) => {
    if (!companionRef.current) return;
    const t = clock.getElapsedTime();

    if (companionFollowing) {
      // Smooth lag follow target offset (behind and to right of player)
      const target = new THREE.Vector3(
        playerPos[0] + 0.9,
        playerPos[1] + 1.05 + Math.sin(t * 3) * 0.08, // Gentle hover bobbing
        playerPos[2] + 0.9,
      );
      currentPos.current.lerp(target, Math.min(1, delta * 3.5));
      companionRef.current.position.copy(currentPos.current);
    }

    if (haloRef.current) {
      haloRef.current.rotation.z = t * 1.5;
    }
  });

  return (
    <group ref={companionRef} position={[playerPos[0] + 0.8, 1.1, playerPos[2] + 0.8]}>
      {/* Overhead Ada Nameplate & Speech Wave */}
      <Html position={[0, 0.45, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-cyan-400/60 bg-slate-950/80 text-cyan-200 text-[10px] font-semibold tracking-wider select-none shadow-[0_0_10px_rgba(34,211,238,0.4)]">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span>Ada · AI Companion</span>
        </div>
      </Html>

      {/* Floating Sparkle Halo */}
      <mesh ref={haloRef} position={[0, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.015, 8, 24]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>

      {/* Companion Body (Cute Floating Orb Rig) */}
      <mesh castShadow>
        <sphereGeometry args={[0.14, 20, 20]} />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.2}
          metalness={0.6}
          emissive="#0284c7"
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Companion Visor Face */}
      <mesh position={[0, 0.01, 0.1]}>
        <sphereGeometry args={[0.08, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshBasicMaterial color="#020617" />
      </mesh>

      {/* Cyan Glowing Eyes */}
      <mesh position={[-0.035, 0.02, 0.135]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[0.035, 0.02, 0.135]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>

      <pointLight color="#38bdf8" intensity={1.2} distance={2.5} />
    </group>
  );
}
