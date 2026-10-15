import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VKind } from "./density.ts";

/**
 * NDU-UPG life (#252-lite #257 #216-lite #217): procedural low-poly people and vehicles, made in code
 * for NDU (no downloaded models, no textures, no faces) — licence: same as the repo (self-made, CC0-
 * compatible). Metres, Y up, facing +Z. Vertex colours multiply the per-instance colour (skin /
 * outfit / livery), so one InstancedMesh per kind draws the whole crowd or fleet.
 *   walker cloth ~56 tris + walker skin ~96 tris, vehicles 36-160 tris each.
 * `aLimb` marks limbs for the vertex-shader gait (±1 legs, ±2 arms) — a VAT-lite cycle with no textures.
 */

type Part = { w: number; h: number; d: number; x?: number; y: number; z?: number; shade?: number; limb?: number };

function box(p: Part): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
  g.translate(p.x ?? 0, p.y, p.z ?? 0);
  return paint(g, p.shade ?? 1, p.limb ?? 0);
}

function paint(g: THREE.BufferGeometry, shade: number, limb: number): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3).fill(shade);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aLimb", new THREE.BufferAttribute(new Float32Array(n).fill(limb), 1));
  g.deleteAttribute("uv");
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("life: geometry merge failed");
  g.computeBoundingSphere();
  return g;
}

/** Trousers/skirt + shirt + sleeves (instance colour = outfit). */
export function walkerCloth(): THREE.BufferGeometry {
  return merge([
    box({ w: 0.15, h: 0.86, d: 0.17, x: -0.095, y: 0.43, shade: 0.42, limb: 1 }),
    box({ w: 0.15, h: 0.86, d: 0.17, x: 0.095, y: 0.43, shade: 0.42, limb: -1 }),
    box({ w: 0.4, h: 0.62, d: 0.23, y: 1.15 }),
    box({ w: 0.1, h: 0.5, d: 0.11, x: -0.26, y: 1.2, limb: 2 }),
    box({ w: 0.1, h: 0.5, d: 0.11, x: 0.26, y: 1.2, limb: -2 }),
  ]);
}

/** Head (no face), neck and hands (instance colour = skin); the hair cap is a dark shade of it. */
export function walkerSkin(): THREE.BufferGeometry {
  const head = new THREE.IcosahedronGeometry(0.125, 1).toNonIndexed();
  head.scale(0.92, 1.08, 1);
  head.translate(0, 1.63, 0);
  paint(head, 1, 0);
  const pos = head.getAttribute("position");
  const col = head.getAttribute("color");
  for (let i = 0; i < pos.count; i += 3) {
    // whole triangles above the brow line (or at the back of the head) become hair
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    if (y > 1.665 || (z < -0.03 && y > 1.58)) for (let k = 0; k < 3; k += 1) col.setXYZ(i + k, 0.16, 0.13, 0.12);
  }
  return merge([
    head,
    box({ w: 0.09, h: 0.08, d: 0.09, y: 1.49 }),
    box({ w: 0.08, h: 0.1, d: 0.09, x: -0.26, y: 0.9, limb: 2 }),
    box({ w: 0.08, h: 0.1, d: 0.09, x: 0.26, y: 0.9, limb: -2 }),
  ]);
}

const wheels = (w: number, zs: number[], r = 0.32, width = 0.22) =>
  zs.flatMap((z) => [box({ w: width, h: r * 2, d: r * 2, x: -w / 2, y: r, z, shade: 0.07 }), box({ w: width, h: r * 2, d: r * 2, x: w / 2, y: r, z, shade: 0.07 })]);

export function vehicleGeometry(kind: VKind): THREE.BufferGeometry {
  switch (kind) {
    case "car":
      return merge([
        box({ w: 1.78, h: 0.62, d: 4.3, y: 0.62 }),
        box({ w: 1.58, h: 0.5, d: 2.2, y: 1.18, z: -0.25, shade: 0.16 }),
        box({ w: 1.5, h: 0.06, d: 1.95, y: 1.45, z: -0.25 }),
        box({ w: 1.8, h: 0.12, d: 0.12, y: 0.55, z: 2.12, shade: 0.25 }),
        ...wheels(1.62, [-1.35, 1.35]),
      ]);
    case "keke":
      return merge([
        box({ w: 1.3, h: 0.75, d: 2.1, y: 0.72, z: -0.2 }),
        box({ w: 0.95, h: 0.65, d: 0.55, y: 0.78, z: 1.08 }),
        box({ w: 1.36, h: 0.07, d: 2.05, y: 1.78, z: -0.1, shade: 0.9 }),
        box({ w: 0.06, h: 0.72, d: 0.06, x: -0.62, y: 1.42, z: 0.85, shade: 0.12 }),
        box({ w: 0.06, h: 0.72, d: 0.06, x: 0.62, y: 1.42, z: 0.85, shade: 0.12 }),
        box({ w: 0.06, h: 0.72, d: 0.06, x: -0.62, y: 1.42, z: -1.05, shade: 0.12 }),
        box({ w: 0.06, h: 0.72, d: 0.06, x: 0.62, y: 1.42, z: -1.05, shade: 0.12 }),
        box({ w: 1.0, h: 0.5, d: 0.05, y: 1.4, z: 0.9, shade: 0.18 }),
        box({ w: 0.16, h: 0.5, d: 0.5, y: 0.25, z: 1.12, shade: 0.07 }),
        ...wheels(1.2, [-0.9], 0.25, 0.16),
      ]);
    case "bus":
      return merge([
        box({ w: 2.55, h: 2.45, d: 12, y: 1.68 }),
        box({ w: 2.58, h: 0.85, d: 10.6, y: 2.12, z: -0.4, shade: 0.12 }),
        box({ w: 2.3, h: 1.0, d: 0.05, y: 2.05, z: 6.0, shade: 0.12 }),
        box({ w: 2.58, h: 0.18, d: 12.02, y: 0.62, shade: 0.3 }),
        box({ w: 2.2, h: 0.25, d: 7, y: 3.0, z: -1, shade: 0.85 }),
        ...wheels(2.3, [-4.1, 3.9], 0.5, 0.3),
      ]);
    case "danfo":
      return merge([
        box({ w: 1.95, h: 1.75, d: 4.8, y: 1.27 }),
        box({ w: 1.98, h: 0.6, d: 3.6, y: 1.55, z: -0.4, shade: 0.14 }),
        box({ w: 1.7, h: 0.6, d: 0.05, y: 1.55, z: 2.41, shade: 0.14 }),
        box({ w: 1.99, h: 0.12, d: 4.82, y: 0.92, shade: 0.08 }),
        box({ w: 1.99, h: 0.08, d: 4.82, y: 1.1, shade: 0.08 }),
        ...wheels(1.82, [-1.6, 1.55], 0.36),
      ]);
  }
}

/** Gait in the vertex shader: legs/arms swing around hip/shoulder from the instance's (phase, amplitude). */
export function gaitMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aLimb;\nattribute vec2 aGait;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float limbA = abs(aLimb);
        if (limbA > 0.5) {
          float isArm = step(1.5, limbA);
          float pivot = mix(0.86, 1.42, isArm);
          float ang = sin(aGait.x) * aGait.y * sign(aLimb) * mix(0.55, -0.45, isArm);
          float c = cos(ang); float s = sin(ang);
          vec3 p = transformed - vec3(0.0, pivot, 0.0);
          transformed = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c) + vec3(0.0, pivot, 0.0);
        }
        transformed.y += abs(sin(aGait.x)) * aGait.y * 0.035 * step(0.9, transformed.y);`,
      );
  };
  mat.customProgramCacheKey = () => "ndu-life-gait";
  return mat;
}

export function plainMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/** Cheap blob shadow (#246): one flat disc, scaled per instance. */
export function shadowDisc(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 14);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.04, 0);
  return g;
}
