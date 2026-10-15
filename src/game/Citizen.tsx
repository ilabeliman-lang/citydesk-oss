import { ACCENT, CLOTH, CREAM, INK, MUTED, SAND } from "./palette";

/** Stylized standing adult. Origin at the feet, faces local +Z. Parent moves and yaws the group. */
export function Citizen() {
  return (
    <group>
      <mesh position={[-0.09, 0.035, 0.035]} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.22]} />
        <meshStandardMaterial color={MUTED} />
      </mesh>
      <mesh position={[0.09, 0.035, 0.035]} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.22]} />
        <meshStandardMaterial color={MUTED} />
      </mesh>

      <mesh position={[-0.09, 0.36, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.46, 4, 8]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      <mesh position={[0.09, 0.36, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.46, 4, 8]} />
        <meshStandardMaterial color={SAND} />
      </mesh>

      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 0.62, 8]} />
        <meshStandardMaterial color={CLOTH} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.055, 8]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>

      <mesh position={[0, 1.22, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.18]} />
        <meshStandardMaterial color={CREAM} roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.34, 0]} castShadow>
        <boxGeometry args={[0.46, 0.09, 0.2]} />
        <meshStandardMaterial color={CREAM} roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.2, 0.1]}>
        <boxGeometry args={[0.08, 0.16, 0.02]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>

      <mesh position={[-0.24, 1.08, 0.02]} rotation={[0.12, 0, 0.16]} castShadow>
        <capsuleGeometry args={[0.048, 0.34, 4, 6]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      <mesh position={[0.24, 1.08, 0.02]} rotation={[0.12, 0, -0.16]} castShadow>
        <capsuleGeometry args={[0.048, 0.34, 4, 6]} />
        <meshStandardMaterial color={SAND} />
      </mesh>

      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.06, 0.1, 8]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      <mesh position={[0, 1.57, 0]} castShadow>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      <mesh position={[0, 1.66, -0.03]} scale={[1.08, 0.45, 0.95]} castShadow>
        <sphereGeometry args={[0.13, 12, 8]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[-0.045, 1.59, 0.118]}>
        <sphereGeometry args={[0.016, 8, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0.045, 1.59, 0.118]}>
        <sphereGeometry args={[0.016, 8, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    </group>
  );
}
