import * as THREE from "three";
import { clearPhysicalMaterialCache } from "./physicalMaterials.ts"; // NDU-UPG inspect (#04)

/**
 * NDU-UPG #23: Shared material library for the NDU house palette.
 * Reuses one MeshStandardMaterial per palette color to minimize shader compiles
 * and draw-call overhead on Tier B/C mobile devices.
 */

export const PALETTE_COLORS = {
  lagoonTeal: 0x16a085,
  sand: 0xf5e6cb,
  laterite: 0xcd6155,
  danfoYellow: 0xf1c40f,
  poleGrey: 0x7f8c8d,
  sodiumOrange: 0xe67e22,
  nightWindow: 0xffeaa7,
  asphalt: 0x2c3e50,
} as const;

export type PaletteColorKey = keyof typeof PALETTE_COLORS;

const materialCache = new Map<PaletteColorKey, THREE.MeshStandardMaterial>();

export function getPaletteMaterial(key: PaletteColorKey): THREE.MeshStandardMaterial {
  let mat = materialCache.get(key);
  if (!mat) {
    const hex = PALETTE_COLORS[key];
    mat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.8,
      metalness: 0.1,
    });
    // Sodium & nightWindow have slight emissive warmth
    if (key === "sodiumOrange" || key === "nightWindow") {
      mat.emissive = new THREE.Color(hex);
      mat.emissiveIntensity = 0.4;
    }
    materialCache.set(key, mat);
  }
  return mat;
}

export function clearMaterialCache(): void {
  for (const mat of materialCache.values()) {
    mat.dispose();
  }
  materialCache.clear();
  clearPhysicalMaterialCache(); // NDU-UPG inspect (#04)
}

// ───────────────────────── NDU-UPG realism 03: street-furniture materials ─────────────────────────
// One program per kind, shared uniforms (one write updates every prop program).
//   opaque — vertex-coloured kit/trunks (+ uWet: darker albedo, glossier)
//   crown  — vertex-coloured tree crowns with wind sway (uWind = [vx, vz, strength], uTime) + uWet
//   glow   — additive camera-facing halos (lamp heads), depthWrite off
//   pool   — additive ground light pools under lamps, depthWrite off, polygonOffset
//   shadow — ShadowMaterial ground receiver (Tier A shadow pass)
//   lens   — unlit emissive lamp lenses / signal faces (per-instance colour = kelvin × on-factor)

export type PropMaterialKind = "opaque" | "crown" | "glow" | "pool" | "shadow" | "lens";

export const propUniforms = {
  uWet: { value: 0 },
  uWind: { value: new THREE.Vector3(0, 0, 0) },
  uTime: { value: 0 },
  uLampColor: { value: new THREE.Color(1, 0.85, 0.6) },
};

const propCache = new Map<PropMaterialKind, THREE.Material>();
let radialTex: THREE.DataTexture | null = null;

/** Code-drawn radial falloff (no canvas, so it also builds in node tests). */
export function radialTexture(size = 64): THREE.DataTexture {
  if (radialTex) return radialTex;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, 2.2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  radialTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  radialTex.needsUpdate = true;
  radialTex.magFilter = THREE.LinearFilter;
  radialTex.minFilter = THREE.LinearFilter;
  return radialTex;
}

const WET_FRAG = [
  "#include <color_fragment>",
  "  diffuseColor.rgb *= 1.0 - 0.25 * uWet;",
].join("\n");
const WET_ROUGH = ["#include <roughnessmap_fragment>", "  roughnessFactor = mix(roughnessFactor, 0.25, uWet);"].join("\n");

function standard(sway: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, side: sway ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = propUniforms.uWet;
    shader.uniforms.uWind = propUniforms.uWind;
    shader.uniforms.uTime = propUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aMask;\nuniform vec3 uWind;\nuniform float uTime;\nvarying float vMask;")
      .replace(
        "#include <begin_vertex>",
        sway
          ? [
              "#include <begin_vertex>",
              "  vMask = aMask;",
              "  // unit crown: local y is 0..1 → bend grows with (y)^2; phase from world-ish position",
              "  float bendK = transformed.y * transformed.y * uWind.z;",
              "  float ph = position.x * 3.1 + position.z * 2.3;",
              "  float sway = sin(uTime * 0.9 + ph) * 0.6 + 0.4;",
              "  float flutter = sin(uTime * 4.7 + ph * 7.0) * 0.04 * uWind.z;",
              "  transformed.x += uWind.x * bendK * 0.12 * sway + flutter;",
              "  transformed.z += uWind.y * bendK * 0.12 * sway + flutter;",
            ].join("\n")
          : "#include <begin_vertex>\n  vMask = aMask;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWet;\nvarying float vMask;")
      .replace("#include <color_fragment>", WET_FRAG)
      .replace("#include <roughnessmap_fragment>", WET_ROUGH);
  };
  m.customProgramCacheKey = () => (sway ? "ndu-prop-crown" : "ndu-prop-opaque");
  return m;
}

export function getPropMaterial(kind: PropMaterialKind): THREE.Material {
  const hit = propCache.get(kind);
  if (hit) return hit;
  let m: THREE.Material;
  switch (kind) {
    case "opaque":
      m = standard(false);
      break;
    case "crown":
      m = standard(true);
      break;
    case "glow":
      m = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      break;
    case "pool":
      m = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      break;
    case "shadow":
      m = new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false });
      break;
    case "lens":
      m = new THREE.MeshBasicMaterial({ toneMapped: false });
      break;
  }
  propCache.set(kind, m);
  return m;
}

export function clearPropMaterials(): void {
  for (const m of propCache.values()) m.dispose();
  propCache.clear();
}
