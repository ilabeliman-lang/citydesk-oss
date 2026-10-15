import React, { useMemo } from "react";
import * as THREE from "three";
import { WORKVERSE_PALETTE } from "./palette";
import { useWorkverseStore } from "./store";
import { getArchetypeLayout } from "./archetypes";

// Helper for procedural wall & floor materials
function createTextSignCanvas(title: string, subtitle?: string, accentColor = "#d4a359"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Background
  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, 512, 128);

  // Border & Accent bar
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 120);

  ctx.fillStyle = accentColor;
  ctx.fillRect(16, 20, 6, 88);

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 36, subtitle ? 50 : 64);

  if (subtitle) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(subtitle, 36, 88);
  }

  return canvas;
}

function RoomSignPlaque({
  title,
  subtitle,
  accentColor = WORKVERSE_PALETTE.warmBrass,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const texture = useMemo(() => {
    const canvas = createTextSignCanvas(title, subtitle, accentColor);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [title, subtitle, accentColor]);

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 0.42, 0.04]} />
        <meshStandardMaterial color="#0b0f17" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[1.56, 0.38]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.022]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.56, 0.38]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Glass Railing Segment
function GlassRailingRun({
  start,
  end,
  height = 1.1,
  railColor = WORKVERSE_PALETTE.warmBrass,
}: {
  start: [number, number];
  end: [number, number];
  height?: number;
  railColor?: string;
}) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return null;

  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[1] + end[1]) / 2;
  const angle = Math.atan2(dz, dx);
  const postsCount = Math.max(2, Math.round(length / 1.8) + 1);

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {/* Handrail Cap */}
      <mesh position={[0, height, 0]} castShadow>
        <boxGeometry args={[length, 0.04, 0.06]} />
        <meshStandardMaterial
          color={railColor}
          metalness={0.8}
          roughness={0.2}
          emissive={railColor}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Glass Pane */}
      <mesh position={[0, height / 2 + 0.02, 0]}>
        <boxGeometry args={[length, height - 0.08, 0.02]} />
        <meshPhysicalMaterial
          color="#22d3ee"
          transmission={0.92}
          opacity={0.3}
          transparent
          roughness={0.08}
          ior={1.5}
        />
      </mesh>

      {/* Bottom Shoe Base */}
      <mesh position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[length, 0.06, 0.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Metal Posts */}
      {Array.from({ length: postsCount }, (_, i) => {
        const xPos = -length / 2 + (i / (postsCount - 1)) * length;
        return (
          <mesh key={i} position={[xPos, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, height, 12]} />
            <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

function FlagshipRooms() {
  return (
    <group name="workverse-rooms">
      {/* 1. ROOM FLOOR INLAYS */}
      {/* Lead Suite Parquet Inlay (North-West) */}
      <group position={[-6.2, 0.005, -5.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[7.8, 4.4]} />
          <meshStandardMaterial
            color={WORKVERSE_PALETTE.walnutSlat}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
        {/* Brass divider trim */}
        <mesh position={[0, 0.003, 2.22]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.8, 0.04]} />
          <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[3.92, 0.003, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[4.4, 0.04]} />
          <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* Mission Control Floor (North-Center) */}
      <group position={[1.5, 0.005, -5.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[7.4, 4.4]} />
          <meshStandardMaterial
            color="#141824"
            roughness={0.6}
            metalness={0.3}
          />
        </mesh>
        {/* Cyan Neon floor line */}
        <mesh position={[0, 0.003, 2.22]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.4, 0.05]} />
          <meshStandardMaterial
            color={WORKVERSE_PALETTE.neonCyan}
            emissive={WORKVERSE_PALETTE.neonCyan}
            emissiveIntensity={0.8}
          />
        </mesh>
      </group>

      {/* Break Lounge & Kitchenette Floor (South-East) */}
      <group position={[6.2, 0.005, 5.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[8.0, 4.4]} />
          <meshStandardMaterial
            color="#2a231d"
            roughness={0.7}
          />
        </mesh>
        <mesh position={[0, 0.003, -2.22]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8.0, 0.04]} />
          <meshStandardMaterial color={WORKVERSE_PALETTE.goldAccent} metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Elevator Lobby Floor (South-West) */}
      <group position={[-6.5, 0.005, 5.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[7.4, 4.4]} />
          <meshStandardMaterial
            color="#20232d"
            roughness={0.5}
            metalness={0.2}
          />
        </mesh>
      </group>

      {/* 2. NORTH FEATURE WALL & MISSION CONTROL MATRICES */}
      <group position={[0, 0, -8.1]}>
        {/* Main Sandcrete Back Wall */}
        <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[21.6, 2.9, 0.22]} />
          <meshStandardMaterial color={WORKVERSE_PALETTE.sandcreteWall} roughness={0.85} />
        </mesh>

        {/* Acoustic Walnut Slats behind Executive & Mission Control */}
        <group position={[0, 1.45, 0.12]}>
          {Array.from({ length: 36 }, (_, i) => (
            <mesh key={i} position={[-8.5 + i * 0.48, 0, 0]} castShadow>
              <boxGeometry args={[0.08, 2.7, 0.04]} />
              <meshStandardMaterial color={WORKVERSE_PALETTE.walnutSlat} roughness={0.4} />
            </mesh>
          ))}
        </group>

        {/* Big Mission Control Wall Screens */}
        <group position={[1.5, 1.65, 0.16]}>
          <mesh castShadow>
            <boxGeometry args={[4.8, 1.6, 0.06]} />
            <meshStandardMaterial color="#050811" roughness={0.2} />
          </mesh>
          {/* Main Display Face */}
          <mesh position={[0, 0, 0.035]}>
            <planeGeometry args={[4.6, 1.4]} />
            <meshStandardMaterial
              color="#091322"
              emissive="#0e2338"
              emissiveIntensity={0.6}
              roughness={0.1}
            />
          </mesh>
          {/* Subtle cyan status light bar below the screen */}
          <mesh position={[0, -0.74, 0.04]}>
            <boxGeometry args={[4.6, 0.03, 0.02]} />
            <meshStandardMaterial
              color={WORKVERSE_PALETTE.neonCyan}
              emissive={WORKVERSE_PALETTE.neonCyan}
              emissiveIntensity={1.0}
            />
          </mesh>
        </group>

          {/* Top Architectural Wall Cap */}
          <mesh position={[0, 2.92, 0]}>
            <boxGeometry args={[21.8, 0.08, 0.28]} />
            <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Dedicated Creed Plaque of The Uncorruptible Agent Office */}
          <RoomSignPlaque
            title="UNCORRUPTIBLE AGENT OFFICE"
            subtitle="JESUS CHRIST IS LORD · COL 3:23"
            accentColor={WORKVERSE_PALETTE.goldAccent}
            position={[-5.8, 2.5, 0.16]}
            rotation={[0, 0, 0]}
          />
        </group>

      {/* 3. GLASS INTERIOR PARTITIONS */}
      {/* Lead Suite East Partition Wall with Door opening */}
      <group position={[-2.3, 0, -5.8]}>
        {/* North glass pane */}
        <group position={[0, 0, -1.2]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[0.04, 2.4, 1.8]} />
            <meshPhysicalMaterial
              color="#38bdf8"
              transmission={0.88}
              opacity={0.35}
              transparent
              roughness={0.1}
            />
          </mesh>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[0.045, 0.22, 1.8]} />
            <meshStandardMaterial color="#ffffff" opacity={0.4} transparent roughness={0.9} />
          </mesh>
        </group>

        {/* South glass pane */}
        <group position={[0, 0, 1.3]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[0.04, 2.4, 1.4]} />
            <meshPhysicalMaterial
              color="#38bdf8"
              transmission={0.88}
              opacity={0.35}
              transparent
              roughness={0.1}
            />
          </mesh>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[0.045, 0.22, 1.4]} />
            <meshStandardMaterial color="#ffffff" opacity={0.4} transparent roughness={0.9} />
          </mesh>
        </group>

        {/* Brass Header Arch above door opening */}
        <mesh position={[0, 2.25, 0.1]} castShadow>
          <boxGeometry args={[0.08, 0.3, 1.2]} />
          <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Room Sign */}
        <RoomSignPlaque
          title="LEAD SUITE"
          subtitle="ZEALOUS PANE // MASTER ROSTER"
          accentColor={WORKVERSE_PALETTE.warmBrass}
          position={[0, 2.6, 0.1]}
          rotation={[0, Math.PI / 2, 0]}
        />
      </group>

      {/* Break Lounge Glass Divider (Separating from East Studio Bench) */}
      <group position={[2.2, 0, 6.0]}>
        <mesh position={[0, 1.15, 0]} castShadow>
          <boxGeometry args={[0.04, 2.3, 4.0]} />
          <meshPhysicalMaterial
            color="#fbbf24"
            transmission={0.85}
            opacity={0.3}
            transparent
            roughness={0.15}
          />
        </mesh>
        {/* Frosted accent strip */}
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[0.045, 0.25, 4.0]} />
          <meshStandardMaterial color="#fef08a" opacity={0.35} transparent roughness={0.9} />
        </mesh>
        {/* Brass Header */}
        <mesh position={[0, 2.32, 0]}>
          <boxGeometry args={[0.07, 0.05, 4.0]} />
          <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.8} roughness={0.2} />
        </mesh>

        <RoomSignPlaque
          title="BREAK LOUNGE"
          subtitle="REFRESHMENTS & TEA"
          accentColor={WORKVERSE_PALETTE.neonAmber}
          position={[0, 2.6, 0]}
          rotation={[0, -Math.PI / 2, 0]}
        />
      </group>

      {/* 4. BREAK LOUNGE FURNITURE (Sofa, Coffee Table, Kitchen Counter) */}
      <group position={[6.2, 0, 6.2]}>
        {/* Modern Modular L-Sofa in Charcoal Fabric */}
        <group position={[-0.8, 0, -0.4]}>
          {/* Main cushion */}
          <mesh position={[0, 0.24, 0]} castShadow>
            <boxGeometry args={[2.2, 0.36, 0.9]} />
            <meshStandardMaterial color="#1e222d" roughness={0.85} />
          </mesh>
          {/* Backrest */}
          <mesh position={[0, 0.52, -0.36]} castShadow>
            <boxGeometry args={[2.2, 0.44, 0.22]} />
            <meshStandardMaterial color="#181b24" roughness={0.85} />
          </mesh>
          {/* Warm terracotta throw pillow */}
          <mesh position={[-0.7, 0.46, -0.22]} rotation={[0.2, 0.3, 0]}>
            <boxGeometry args={[0.36, 0.36, 0.12]} />
            <meshStandardMaterial color={WORKVERSE_PALETTE.goldAccent} roughness={0.9} />
          </mesh>
          <mesh position={[0.65, 0.46, -0.22]} rotation={[0.2, -0.25, 0]}>
            <boxGeometry args={[0.36, 0.36, 0.12]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.9} />
          </mesh>
        </group>

        {/* Low Brass Coffee Table */}
        <group position={[-0.8, 0, 0.6]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.55, 0.04, 24]} />
            <meshStandardMaterial color={WORKVERSE_PALETTE.warmBrass} metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.2, 12]} />
            <meshStandardMaterial color="#0f172a" metalness={0.8} />
          </mesh>
        </group>

        {/* Kitchenette / Coffee Bar Counter */}
        <group position={[2.6, 0, -0.5]}>
          <mesh position={[0, 0.48, 0]} castShadow>
            <boxGeometry args={[0.9, 0.96, 2.6]} />
            <meshStandardMaterial color="#1f1e1d" roughness={0.6} />
          </mesh>
          {/* Sandcrete Countertop */}
          <mesh position={[0, 0.98, 0]} castShadow>
            <boxGeometry args={[0.96, 0.05, 2.66]} />
            <meshStandardMaterial color={WORKVERSE_PALETTE.sandcreteWall} roughness={0.4} />
          </mesh>
          {/* Espresso Machine */}
          <mesh position={[0, 1.15, -0.6]} castShadow>
            <boxGeometry args={[0.42, 0.32, 0.42]} />
            <meshStandardMaterial color="#d4d4d8" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Water Cooler */}
          <mesh position={[0, 1.25, 0.7]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.5, 16]} />
            <meshPhysicalMaterial color="#38bdf8" transmission={0.9} opacity={0.6} transparent roughness={0.1} />
          </mesh>
        </group>
      </group>

      {/* 5. ARCHITECTURAL INDOOR PLANTERS (Biophilic green accents) */}
      <group position={[-2.3, 0, -2.5]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.5, 0.56, 1.4]} />
          <meshStandardMaterial color="#1a1c23" roughness={0.7} />
        </mesh>
        {/* Foliage Spheres / Plants */}
        <mesh position={[0, 0.65, -0.35]}>
          <sphereGeometry args={[0.28, 12, 12]} />
          <meshStandardMaterial color="#166534" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.75, 0.3]}>
          <sphereGeometry args={[0.32, 12, 12]} />
          <meshStandardMaterial color="#15803d" roughness={0.8} />
        </mesh>
      </group>

      <group position={[2.2, 0, 3.2]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.5, 0.56, 1.4]} />
          <meshStandardMaterial color="#1a1c23" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.7, -0.2]}>
          <sphereGeometry args={[0.3, 12, 12]} />
          <meshStandardMaterial color="#166534" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.62, 0.35]}>
          <sphereGeometry args={[0.26, 12, 12]} />
          <meshStandardMaterial color="#15803d" roughness={0.8} />
        </mesh>
      </group>

      {/* 6. PERIMETER GLASS RAILINGS AROUND THE FLOATING SLAB */}
      {/* West Edge (X = -10.8) */}
      <GlassRailingRun start={[-10.8, -8.3]} end={[-10.8, 8.3]} railColor={WORKVERSE_PALETTE.warmBrass} />
      {/* East Edge (X = 10.8) */}
      <GlassRailingRun start={[10.8, -8.3]} end={[10.8, 8.3]} railColor={WORKVERSE_PALETTE.warmBrass} />
      {/* South Edge (Z = 8.3) */}
      <GlassRailingRun start={[-10.8, 8.3]} end={[10.8, 8.3]} railColor={WORKVERSE_PALETTE.warmBrass} />
      {/* North Edge corners (behind the back wall) */}
      <GlassRailingRun start={[-10.8, -8.3]} end={[-8.5, -8.3]} railColor={WORKVERSE_PALETTE.warmBrass} />
      <GlassRailingRun start={[8.5, -8.3]} end={[10.8, -8.3]} railColor={WORKVERSE_PALETTE.warmBrass} />
    </group>
  );
}
function GenericRooms() {
  const { currentArchetype, floorAreaM2, currentFloor, spotShape } = useWorkverseStore();
  const layout = getArchetypeLayout(currentArchetype, floorAreaM2, currentFloor);

  // If spotShape has OSM polygon footprints, build extruded geometry
  const polygonGeometry = useMemo(() => {
    if (spotShape?.type !== "building" || !spotShape.polys.length) return null;
    const poly = spotShape.polys[0];
    if (!poly || !poly[0] || poly[0].length < 3) return null;

    try {
      const shape = new THREE.Shape();
      const outer = poly[0];
      shape.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i < outer.length; i++) {
        shape.lineTo(outer[i][0], outer[i][1]);
      }
      shape.closePath();

      // Hole rings
      for (let h = 1; h < poly.length; h++) {
        const holeRing = poly[h];
        if (holeRing.length >= 3) {
          const holePath = new THREE.Path();
          holePath.moveTo(holeRing[0][0], holeRing[0][1]);
          for (let i = 1; i < holeRing.length; i++) {
            holePath.lineTo(holeRing[i][0], holeRing[i][1]);
          }
          holePath.closePath();
          shape.holes.push(holePath);
        }
      }

      return new THREE.ExtrudeGeometry(shape, {
        depth: 0.35,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.05,
        bevelThickness: 0.05,
      });
    } catch {
      return null;
    }
  }, [spotShape]);

  // Outer railing segments from polygon outer ring
  const railingSegments = useMemo(() => {
    if (spotShape?.type !== "building" || !spotShape.polys.length) return null;
    const outer = spotShape.polys[0]?.[0];
    if (!outer || outer.length < 3) return null;

    const segments: Array<{ start: [number, number]; end: [number, number] }> = [];
    for (let i = 0; i < outer.length - 1; i++) {
      const p0 = outer[i];
      const p1 = outer[i + 1];
      // 2D y maps to 3D z = -y under rotation [-Math.PI / 2, 0, 0]
      segments.push({
        start: [p0[0], -p0[1]],
        end: [p1[0], -p1[1]],
      });
    }
    return segments;
  }, [spotShape]);

  const buildingTitle = (spotShape?.type === "building" && spotShape.name) ? spotShape.name : layout.floorName;
  const buildingSubtitle = spotShape?.type === "building" ? `${spotShape.levels} FLOORS · ${Math.round(spotShape.areaM2)} M²` : "PROCEDURAL INTERIOR";

  return (
    <group name="workverse-rooms-generic">
      {/* Extruded Footprint Slab or Fallback Rectangular Floor */}
      {polygonGeometry ? (
        <group position={[0, -0.35, 0]}>
          <mesh
            geometry={polygonGeometry}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            castShadow
          >
            <meshStandardMaterial
              color="#1a1d24"
              roughness={0.65}
              metalness={0.2}
            />
          </mesh>
          {/* Base foundation plinth */}
          <mesh
            geometry={polygonGeometry}
            position={[0, -0.25, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <meshStandardMaterial
              color={WORKVERSE_PALETTE.warmBrass}
              roughness={0.5}
              metalness={0.7}
            />
          </mesh>
        </group>
      ) : (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
            <planeGeometry args={[layout.width, layout.depth]} />
            <meshStandardMaterial color="#1a1d24" roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[layout.width + 0.1, 0.35, layout.depth + 0.1]} />
            <meshStandardMaterial color="#12151b" roughness={0.8} />
          </mesh>
        </group>
      )}

      {/* Perimeter Glass Railings */}
      {railingSegments ? (
        railingSegments.map((seg, i) => (
          <GlassRailingRun
            key={i}
            start={seg.start}
            end={seg.end}
            railColor={WORKVERSE_PALETTE.warmBrass}
          />
        ))
      ) : (
        <>
          <GlassRailingRun start={[-layout.width / 2, -layout.depth / 2]} end={[-layout.width / 2, layout.depth / 2]} railColor={WORKVERSE_PALETTE.warmBrass} />
          <GlassRailingRun start={[layout.width / 2, -layout.depth / 2]} end={[layout.width / 2, layout.depth / 2]} railColor={WORKVERSE_PALETTE.warmBrass} />
          <GlassRailingRun start={[-layout.width / 2, layout.depth / 2]} end={[layout.width / 2, layout.depth / 2]} railColor={WORKVERSE_PALETTE.warmBrass} />
          <GlassRailingRun start={[-layout.width / 2, -layout.depth / 2]} end={[layout.width / 2, -layout.depth / 2]} railColor={WORKVERSE_PALETTE.warmBrass} />
        </>
      )}

      {/* Architectural Indoor Planters */}
      <group position={[-layout.width / 3.5, 0, -layout.depth / 3.5]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.5, 0.56, 1.4]} />
          <meshStandardMaterial color="#1a1c23" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.65, -0.35]}>
          <sphereGeometry args={[0.28, 12, 12]} />
          <meshStandardMaterial color="#166534" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.75, 0.3]}>
          <sphereGeometry args={[0.32, 12, 12]} />
          <meshStandardMaterial color="#15803d" roughness={0.8} />
        </mesh>
      </group>

      {/* Building Header Signage */}
      <RoomSignPlaque
        title={buildingTitle}
        subtitle={buildingSubtitle}
        position={[0, 2.5, -layout.depth / 2.2]}
        rotation={[0, 0, 0]}
        accentColor={WORKVERSE_PALETTE.neonAmber}
      />
    </group>
  );
}

export function WorkverseRooms() {
  const { currentArchetype } = useWorkverseStore();
  
  if (currentArchetype === "flagship_verse") {
    return <FlagshipRooms />;
  }
  
  return <GenericRooms />;
}
