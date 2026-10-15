// NDU-UPG inspect (#04): cached three.js materials per physical material key. Kept out of
// materials.ts so feature 03 (props), which also edits materials.ts, merges cleanly.
import * as THREE from "three";
import { MATERIALS, type MaterialKey } from "./materialCatalog.ts";

const cache = new Map<MaterialKey, THREE.MeshStandardMaterial>();

export function getPhysicalMaterial(key: MaterialKey): THREE.MeshStandardMaterial {
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = MATERIALS[key] ?? MATERIALS.unknown;
  const mat = new THREE.MeshStandardMaterial({ roughness: spec.roughness, metalness: spec.metalness, transparent: spec.traits.transparent, opacity: spec.traits.transparent ? 0.35 : 1 });
  mat.color.setRGB(spec.baseColor[0], spec.baseColor[1], spec.baseColor[2], THREE.LinearSRGBColorSpace);
  mat.name = `ndu-physical-${key}`;
  cache.set(key, mat);
  return mat;
}

/** Dispose and clear the physical cache (call alongside materials.ts clearMaterialCache()). */
export function clearPhysicalMaterialCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
