/** Visual props only. Do not import the sim. */
import { ACCENT, CLOTH, CREAM, FOLIAGE, INK, MUTED, ROAD, SAND } from "./palette";

/** Seat parallel to the road, in front of the north block. Long axis is X. */
function Bench() {
  return (
    <group position={[16, 0, -8]}>
      {[
        [-0.72, -0.18],
        [0.72, -0.18],
        [-0.72, 0.16],
        [0.72, 0.16],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.21, z]} castShadow>
          <boxGeometry args={[0.07, 0.42, 0.07]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      ))}
      {[-0.14, 0, 0.14].map((z) => (
        <mesh key={z} position={[0, 0.45, z]} castShadow>
          <boxGeometry args={[1.6, 0.06, 0.11]} />
          <meshStandardMaterial color={CLOTH} />
        </mesh>
      ))}
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} position={[x, 0.68, -0.2]} castShadow>
          <boxGeometry args={[0.07, 0.62, 0.07]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      ))}
      {[0.58, 0.86].map((y) => (
        <mesh key={y} position={[0, y, -0.2]} castShadow>
          <boxGeometry args={[1.48, 0.08, 0.05]} />
          <meshStandardMaterial color={SAND} />
        </mesh>
      ))}
      {[-0.72, 0.72].map((x) => (
        <mesh key={`arm-${x}`} position={[x, 0.58, -0.02]} castShadow>
          <boxGeometry args={[0.07, 0.05, 0.36]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      ))}
    </group>
  );
}

/** Street tap with a spout, wheel handle, and a bucket. Crown stays under 1.4. */
function Standpipe() {
  return (
    <group position={[8, 0, 8]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.3, 0.14, 8]} />
        <meshStandardMaterial color={MUTED} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.88, 8]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 1.04, 0]} castShadow>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color={ROAD} />
      </mesh>
      <mesh position={[0, 0.96, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.2, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 0.86, 0.24]} castShadow>
        <cylinderGeometry args={[0.032, 0.026, 0.16, 6]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 8]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      <mesh position={[0, 1.24, 0]} castShadow>
        <boxGeometry args={[0.22, 0.02, 0.03]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      <mesh position={[0, 1.24, 0]} castShadow>
        <boxGeometry args={[0.03, 0.02, 0.22]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      <mesh position={[0.34, 0.11, 0.16]} castShadow>
        <cylinderGeometry args={[0.11, 0.09, 0.22, 8]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      <mesh position={[0.34, 0.16, 0.16]} castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.03, 8]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    </group>
  );
}

/**
 * Standing adult, not the player. Origin at the feet.
 * Local +Z is the face, so rotation 0 looks down +Z.
 */
function Neighbor() {
  return (
    <group position={[-8, 0, 8]} rotation={[0, 0, 0]}>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.32, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.48, 3, 6]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      ))}
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.36, 0.58, 8]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      <mesh position={[0, 0.64, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.33, 0.07, 8]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <boxGeometry args={[0.4, 0.46, 0.22]} />
        <meshStandardMaterial color={CLOTH} />
      </mesh>
      <mesh position={[0, 1.08, 0.12]} castShadow>
        <boxGeometry args={[0.24, 0.28, 0.03]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.26, 1.02, 0.03]} castShadow>
          <capsuleGeometry args={[0.055, 0.36, 3, 6]} />
          <meshStandardMaterial color={SAND} />
        </mesh>
      ))}
      <mesh position={[0, 1.46, 0]} castShadow>
        <sphereGeometry args={[0.17, 12, 10]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      <mesh position={[0, 1.64, -0.01]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.08, 8]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 1.45, 0.16]} castShadow>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
    </group>
  );
}

/** Peaked market shade. Canopy, finial included, stays under 2.5. */
function MarketUmbrella({ x, z, canopy, trim }: { x: number; z: number; canopy: string; trim: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.08, 6]} />
        <meshStandardMaterial color={ROAD} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 1.88, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 2.02, 0]} castShadow>
        <coneGeometry args={[1.12, 0.48, 8]} />
        <meshStandardMaterial color={canopy} />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color={trim} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.08, 1.68, Math.sin(a) * 1.08]}
            rotation={[0, Math.PI / 2 - a, 0]}
            castShadow
          >
            <boxGeometry args={[0.3, 0.14, 0.05]} />
            <meshStandardMaterial color={trim} />
          </mesh>
        );
      })}
    </group>
  );
}

function Crate({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-0.28, 0, 0.28].map((t) => (
        <mesh key={t} position={[t * w, h / 2 + 0.012, 0]} castShadow>
          <boxGeometry args={[0.04, 0.022, d * 0.88]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      ))}
    </group>
  );
}

function CrateCluster() {
  return (
    <group position={[18, 0, -6]}>
      <Crate position={[-0.22, 0.2, 0.06]} size={[0.56, 0.4, 0.46]} color={CLOTH} />
      <Crate position={[0.28, 0.15, -0.1]} size={[0.46, 0.3, 0.4]} color={SAND} />
      <Crate position={[-0.18, 0.54, 0.04]} size={[0.34, 0.28, 0.3]} color={MUTED} />
      <mesh position={[-0.16, 0.77, 0.02]} castShadow>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color={FOLIAGE} />
      </mesh>
      <mesh position={[-0.04, 0.74, 0.1]} castShadow>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color={FOLIAGE} />
      </mesh>
    </group>
  );
}

export function StreetDressing() {
  return (
    <group>
      <Bench />
      <Standpipe />
      <Neighbor />
      <MarketUmbrella x={26} z={6} canopy={ACCENT} trim={CREAM} />
      <MarketUmbrella x={-36} z={6} canopy={FOLIAGE} trim={SAND} />
      <CrateCluster />
    </group>
  );
}
