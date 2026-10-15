import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORKVERSE_PALETTE } from "./palette";

export function DeskUnit({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  feltColor = "#334155",
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
  feltColor?: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Desktop (Light Oak / Sandcrete composite) */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.05, 0.85]} />
        <meshStandardMaterial color={WORKVERSE_PALETTE.deskTop} roughness={0.5} />
      </mesh>

      {/* Steel T-legs */}
      <mesh position={[-0.7, 0.36, 0]} castShadow>
        <boxGeometry args={[0.06, 0.72, 0.7]} />
        <meshStandardMaterial color={WORKVERSE_PALETTE.deskLegs} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.7, 0.36, 0]} castShadow>
        <boxGeometry args={[0.06, 0.72, 0.7]} />
        <meshStandardMaterial color={WORKVERSE_PALETTE.deskLegs} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Felt Privacy Screen */}
      <mesh position={[0, 0.95, -0.4]} castShadow>
        <boxGeometry args={[1.56, 0.42, 0.04]} />
        <meshStandardMaterial color={feltColor} roughness={0.9} />
      </mesh>

      {/* Keyboard & Mousepad */}
      <mesh position={[0, 0.75, 0.1]}>
        <boxGeometry args={[0.42, 0.015, 0.14]} />
        <meshStandardMaterial color="#111827" roughness={0.4} />
      </mesh>
      <mesh position={[0.3, 0.75, 0.1]}>
        <boxGeometry args={[0.07, 0.02, 0.11]} />
        <meshStandardMaterial color="#1f2937" roughness={0.4} />
      </mesh>

      {/* Monitor Stand & Dual Arm */}
      <mesh position={[0, 0.86, -0.22]}>
        <cylinderGeometry args={[0.015, 0.015, 0.24, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

export function TaskChair({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* 5-Star Base & Gas Cylinder */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.22, 12]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 10]} />
        <meshStandardMaterial color="#020617" roughness={0.6} />
      </mesh>

      {/* Cushion Seat */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[0.44, 0.08, 0.44]} />
        <meshStandardMaterial color={WORKVERSE_PALETTE.meshChair} roughness={0.8} />
      </mesh>

      {/* Mesh Backrest */}
      <mesh position={[0, 0.72, -0.2]} rotation={[-0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.42, 0.48, 0.05]} />
        <meshStandardMaterial color="#090d16" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function GyroscopeSpawnPad({
  position = [0, 0, 0],
}: {
  position?: [number, number, number];
}) {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = t * 0.8;
      outerRingRef.current.rotation.x = Math.sin(t * 0.4) * 0.3;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.y = -t * 1.2;
      innerRingRef.current.rotation.z = Math.cos(t * 0.5) * 0.4;
    }
    if (pulseRef.current) {
      pulseRef.current.intensity = 2.5 + Math.sin(t * 4) * 1.0;
    }
  });

  return (
    <group position={position}>
      {/* Floor Glow Plate */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color="#1e1b4b" opacity={0.6} transparent />
      </mesh>

      {/* Outer Ring */}
      <mesh ref={outerRingRef} position={[0, 0.6, 0]}>
        <torusGeometry args={[1.1, 0.035, 12, 36]} />
        <meshStandardMaterial
          color={WORKVERSE_PALETTE.warmBrass}
          metalness={0.9}
          roughness={0.2}
          emissive={WORKVERSE_PALETTE.brassGlow}
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Inner Ring */}
      <mesh ref={innerRingRef} position={[0, 0.6, 0]}>
        <torusGeometry args={[0.85, 0.03, 12, 32]} />
        <meshStandardMaterial
          color={WORKVERSE_PALETTE.neonCyan}
          metalness={0.8}
          roughness={0.2}
          emissive={WORKVERSE_PALETTE.neonCyan}
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* Center Hologram Pillar */}
      <mesh position={[0, 0.6, 0]}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={0.8}
          wireframe
        />
      </mesh>

      <pointLight ref={pulseRef} position={[0, 0.8, 0]} color="#38bdf8" distance={4} />
    </group>
  );
}

export function ElevatorBay({
  position = [0, 0, 0],
  onCall,
}: {
  position?: [number, number, number];
  onCall?: () => void;
}) {
  return (
    <group position={position}>
      {/* Elevator Frame */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[2.0, 2.8, 0.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>

      {/* Brushed Brass Doors */}
      <mesh position={[-0.45, 1.35, 0.08]}>
        <boxGeometry args={[0.85, 2.5, 0.04]} />
        <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.45, 1.35, 0.08]}>
        <boxGeometry args={[0.85, 2.5, 0.04]} />
        <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Indicator Display */}
      <mesh position={[0, 2.55, 0.12]}>
        <boxGeometry args={[0.6, 0.18, 0.02]} />
        <meshBasicMaterial color="#020617" />
      </mesh>

      {/* Call Button Plate */}
      <mesh
        position={[1.15, 1.2, 0.1]}
        onClick={(e) => {
          e.stopPropagation();
          onCall?.();
        }}
      >
        <boxGeometry args={[0.15, 0.28, 0.04]} />
        <meshStandardMaterial
          color={WORKVERSE_PALETTE.neonAmber}
          emissive={WORKVERSE_PALETTE.neonAmber}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}
