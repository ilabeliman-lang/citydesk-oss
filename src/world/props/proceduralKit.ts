import * as THREE from "three";

/**
 * NDU-UPG props (#151–#200): procedural low-poly street furniture and vegetation.
 * Every model is built from primitives in code — no external meshes, textures or assets.
 * Licence: same as the repo (self-made, CC0-compatible). Metres, Y-up, facing +Z.
 */

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  paintSolid(g, color);
  return g;
}

function cyl(rTop: number, rBot: number, h: number, segs: number, color: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  g.translate(x, y, z);
  paintSolid(g, color);
  return g;
}

function paintSolid(g: THREE.BufferGeometry, hex: number): void {
  const r = ((hex >> 16) & 0xff) / 255;
  const gv = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = r;
    col[i * 3 + 1] = gv;
    col[i * 3 + 2] = b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // NDU-UPG props T1.1: three r186 Box/Cylinder/Cone geometries are INDEXED; concatenating their raw
  // vertex arrays without the index produced garbage triangles. De-index every part first.
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let totalVerts = 0;
  for (const p of flat) totalVerts += p.getAttribute("position").count;
  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3);
  const mask = new Float32Array(totalVerts);
  let off = 0;
  for (const p of flat) {
    const pA = p.getAttribute("position") as THREE.BufferAttribute;
    const nA = p.getAttribute("normal") as THREE.BufferAttribute;
    const cA = p.getAttribute("color") as THREE.BufferAttribute | undefined;
    const mA = p.getAttribute("aMask") as THREE.BufferAttribute | undefined;
    const n = pA.count;
    for (let i = 0; i < n * 3; i++) {
      pos[off * 3 + i] = (pA.array as Float32Array)[i];
      nor[off * 3 + i] = nA ? (nA.array as Float32Array)[i] : 0;
      col[off * 3 + i] = cA ? (cA.array as Float32Array)[i] : 1;
    }
    for (let i = 0; i < n; i++) mask[off + i] = mA ? (mA.array as Float32Array)[i] : 0;
    off += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aMask", new THREE.BufferAttribute(mask, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Street lamp: thin pole + small box head. ~60 tris. */
export function createLampGeometry(): THREE.BufferGeometry {
  return merge([
    cyl(0.06, 0.08, 6.0, 6, 0x888888, 0, 3.0, 0), // pole
    box(0.3, 0.12, 0.2, 0xffe0a0, 0, 6.15, 0.08), // lamp head
    cyl(0.18, 0.18, 0.04, 8, 0xfff4cc, 0, 6.06, 0.08), // lens
  ]);
}

/** NEPA utility pole: tall tapered cylinder + cross-arm. ~50 tris. */
export function createPoleGeometry(): THREE.BufferGeometry {
  return merge([
    cyl(0.08, 0.12, 8.0, 6, 0x8b7355, 0, 4.0, 0), // pole
    box(2.0, 0.1, 0.1, 0x6b5b3a, 0, 7.2, 0), // cross-arm
  ]);
}

/** Water standpipe / tap: short pipe + handle. ~40 tris. */
export function createStandpipeGeometry(): THREE.BufferGeometry {
  return merge([
    cyl(0.06, 0.06, 0.9, 6, 0x607080, 0, 0.45, 0), // pipe
    cyl(0.15, 0.15, 0.06, 8, 0x506070, 0, 0.02, 0), // base plate
    box(0.04, 0.15, 0.04, 0x808080, 0, 0.95, 0.08), // tap handle
    cyl(0.03, 0.03, 0.1, 6, 0x708090, 0.0, 0.88, 0.12), // spout
  ]);
}

/** Food stall / market kiosk: table + canopy + posts. ~120 tris. */
export function createStallGeometry(): THREE.BufferGeometry {
  return merge([
    box(2.2, 0.08, 1.4, 0xc49a6c, 0, 0.85, 0), // table top
    box(0.08, 0.85, 0.08, 0x8b7355, -1.0, 0.42, -0.6), // leg FL
    box(0.08, 0.85, 0.08, 0x8b7355, 1.0, 0.42, -0.6), // leg FR
    box(0.08, 0.85, 0.08, 0x8b7355, -1.0, 0.42, 0.6), // leg BL
    box(0.08, 0.85, 0.08, 0x8b7355, 1.0, 0.42, 0.6), // leg BR
    box(0.06, 1.7, 0.06, 0x606060, -1.05, 1.7, -0.65), // post FL
    box(0.06, 1.7, 0.06, 0x606060, 1.05, 1.7, -0.65), // post FR
    box(0.06, 1.7, 0.06, 0x606060, -1.05, 1.7, 0.65), // post BL
    box(0.06, 1.7, 0.06, 0x606060, 1.05, 1.7, 0.65), // post BR
    box(2.4, 0.04, 1.7, 0xe85030, 0, 2.55, 0), // canopy (red/orange)
  ]);
}

/** Shade bench: plank seat on two block supports. ~30 tris. */
export function createBenchGeometry(): THREE.BufferGeometry {
  return merge([
    box(1.4, 0.06, 0.38, 0xc49a6c, 0, 0.45, 0), // seat plank
    box(0.12, 0.45, 0.35, 0x888888, -0.55, 0.22, 0), // left support
    box(0.12, 0.45, 0.35, 0x888888, 0.55, 0.22, 0), // right support
    box(1.4, 0.06, 0.04, 0xc49a6c, 0, 0.82, -0.18), // backrest
  ]);
}

/** Bus stop shelter: roof + two side posts + sign. ~100 tris. */
export function createBusStopGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.1, 2.6, 0.1, 0x606060, -1.3, 1.3, 0), // post L
    box(0.1, 2.6, 0.1, 0x606060, 1.3, 1.3, 0), // post R
    box(3.0, 0.06, 1.1, 0x90a8c0, 0, 2.65, 0), // roof
    box(0.5, 0.35, 0.04, 0x2060a0, 1.3, 2.2, 0.02), // BUS sign
  ]);
}

/** Palm tree: trunk (tapered cylinder) + frond crown (cones). ~180 tris. */
export function createPalmGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [cyl(0.12, 0.18, 6.5, 6, 0x8b7355, 0, 3.25, 0)];
  // 6 fronds as flattened cones radiating from the top
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frond = new THREE.ConeGeometry(0.15, 2.8, 4);
    frond.scale(1, 1, 0.25);
    frond.rotateZ(Math.PI * 0.35);
    frond.rotateY(a);
    frond.translate(Math.sin(a) * 0.9, 6.8, Math.cos(a) * 0.9);
    paintSolid(frond, 0x3a7a2a);
    parts.push(frond);
  }
  return merge(parts);
}

// ───────────────────────── NDU-UPG realism 03: archetype registry ─────────────────────────
// Furniture archetypes are in REAL METRES (unit: false) at the KIND_DEFAULTS size; the layer scales
// each instance by record size / nominal. Tree crowns and the trunk are UNIT (unit: true): y 0..1,
// diameter 1, scaled per instance from the species solver. aMask = 1 on lamp lenses, signal lenses
// and lit shelter panels (emissive at night), 0 elsewhere. Every merged result is non-indexed.

const MASKED = (g: THREE.BufferGeometry) => {
  const n = g.getAttribute("position").count;
  g.setAttribute("aMask", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  return g;
};
function lens(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  return MASKED(box(w, h, d, color, x, y, z));
}
function lensCyl(r: number, h: number, segs: number, color: number, x = 0, y = 0, z = 0, rotX = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, segs);
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  paintSolid(g, color);
  return MASKED(g);
}
function openCyl(rTop: number, rBot: number, h: number, segs: number, color: number, x = 0, y = 0, z = 0, hSegs = 1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, hSegs, true);
  g.translate(x, y, z);
  paintSolid(g, color);
  return g;
}
function shape(g: THREE.BufferGeometry, color: number, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) {
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  paintSolid(g, color);
  return g;
}

const METAL = 0x5c6168;
const DARK = 0x2b2e33;
const WOOD = 0x8b6a45;
const LENS = 0xfff2d0;
const LEAF = 0x3f7a36;

export type Archetype = {
  id: string;
  build: () => THREE.BufferGeometry;
  buildLow: () => THREE.BufferGeometry;
  maxTris: number;
  unit: boolean;
  /** Nominal [width, depth, height] of build() in metres (unit archetypes: [1, 1, 1]). */
  dims: [number, number, number];
  /** Local position of the light source (lens centre) for glow/pool placement, metres or unit. */
  lightAt?: [number, number, number];
};

const lowPole = (h: number, w = 0.14, headY?: number, headZ = 0) =>
  merge([box(w, h, w, METAL, 0, h / 2, 0), ...(headY != null ? [box(0.4, 0.15, 0.3, DARK, 0, headY, headZ)] : [])]);

function signFace(kind: "octagon" | "triangle" | "round" | "rect"): THREE.BufferGeometry {
  const y = 2.45;
  const pole = openCyl(0.035, 0.035, 2.8, 6, 0x9aa0a6, 0, 1.4, -0.03, 2);
  const cap = cyl(0.04, 0.04, 0.04, 6, 0x9aa0a6, 0, 2.82, -0.03);
  let face: THREE.BufferGeometry;
  if (kind === "octagon") face = new THREE.CylinderGeometry(0.375, 0.375, 0.03, 8);
  else if (kind === "triangle") face = new THREE.CylinderGeometry(0.43, 0.43, 0.03, 3);
  else if (kind === "round") face = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12);
  else face = new THREE.BoxGeometry(0.6, 0.03, 0.6);
  face.rotateX(Math.PI / 2);
  if (kind === "octagon") face.rotateZ(Math.PI / 8);
  if (kind === "triangle") face.rotateZ(Math.PI); // point down (give way)
  face.translate(0, y, 0.02);
  paintSolid(face, kind === "octagon" ? 0xc8102e : kind === "rect" ? 0x1f4e9a : 0xf2f2f2);
  const ring = new THREE.CylinderGeometry(kind === "round" ? 0.3 : 0.2, kind === "round" ? 0.3 : 0.2, 0.02, kind === "round" ? 12 : 6);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, y, -0.005);
  paintSolid(ring, kind === "round" || kind === "triangle" ? 0xc8102e : 0x9aa0a6);
  return merge([pole, cap, face, ring]);
}
const signLow = () => merge([box(0.07, 2.8, 0.07, 0x9aa0a6, 0, 1.4, 0), box(0.6, 0.6, 0.03, 0xdddddd, 0, 2.45, 0.02)]);

function trafficHead(x: number, y: number, z: number): THREE.BufferGeometry[] {
  return [
    box(0.32, 0.95, 0.24, 0x1d1f22, x, y, z),
    box(0.4, 1.05, 0.03, 0x111111, x, y, z - 0.13),
    lens(0.2, 0.2, 0.03, 0xff3b30, x, y + 0.3, z + 0.13),
    lens(0.2, 0.2, 0.03, 0xffb000, x, y, z + 0.13),
    lens(0.2, 0.2, 0.03, 0x34c759, x, y - 0.3, z + 0.13),
  ];
}

function unitRound(detail: number) {
  return shape(new THREE.IcosahedronGeometry(0.5, detail), LEAF, 1, 1, 1, 0, 0.5, 0);
}

export const ARCHETYPES: Record<string, Archetype> = {};
/** Unit archetypes are normalised to y 0..1 and a max horizontal extent of 1 (centred). */
function normUnit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  const h = b.max.y - b.min.y || 1;
  const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) || 1;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(1 / w, 1 / h, 1 / w);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
/** Radial normals from the crown centre: faceted low-poly blobs shade like soft foliage masses. */
function softNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), (p.getY(i) - 0.5) * 0.8, p.getZ(i));
    if (v.lengthSq() < 1e-8) v.set(0, 1, 0);
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return g;
}
function def(a: Archetype) {
  if (a.unit && a.id !== "trunk") {
    const b = a.build;
    const l = a.buildLow;
    const soft = !/palm|conical/.test(a.id);
    a.build = () => (soft ? softNormals(normUnit(b())) : normUnit(b()));
    a.buildLow = () => (soft ? softNormals(normUnit(l())) : normUnit(l()));
  }
  ARCHETYPES[a.id] = a;
}

def({
  id: "lamp_bent",
  unit: false,
  maxTris: 160,
  dims: [0.3, 1.6, 6.5],
  lightAt: [0, 6.18, 1.25],
  build: () =>
    merge([
      cyl(0.15, 0.17, 0.5, 8, DARK, 0, 0.25, 0),
      openCyl(0.065, 0.095, 6.0, 8, METAL, 0, 3.25, 0, 2),
      box(0.07, 0.07, 1.25, METAL, 0, 6.32, 0.6),
      box(0.36, 0.16, 0.6, DARK, 0, 6.32, 1.25),
      box(0.06, 0.18, 0.06, METAL, 0, 6.41, 0),
      lens(0.28, 0.03, 0.5, LENS, 0, 6.225, 1.25),
    ]),
  buildLow: () => lowPole(6.5, 0.14, 6.32, 1.0),
});
def({
  id: "lamp_post_top",
  unit: false,
  maxTris: 160,
  dims: [0.5, 0.5, 4.5],
  lightAt: [0, 4.0, 0],
  build: () =>
    merge([
      cyl(0.14, 0.16, 0.45, 8, DARK, 0, 0.22, 0),
      openCyl(0.05, 0.075, 3.6, 8, DARK, 0, 2.25, 0, 2),
      cyl(0.08, 0.2, 0.15, 8, DARK, 0, 4.12, 0),
      lensCyl(0.17, 0.4, 8, LENS, 0, 3.85, 0),
      cyl(0.25, 0.05, 0.3, 8, DARK, 0, 4.35, 0),
    ]),
  buildLow: () => lowPole(4.5, 0.12, 4.0, 0),
});
def({
  id: "lamp_wall",
  unit: false,
  maxTris: 160,
  dims: [0.35, 0.75, 3.8],
  lightAt: [0, 3.55, 0.55],
  build: () =>
    merge([
      box(0.2, 0.3, 0.06, DARK, 0, 3.6, 0.03),
      box(0.05, 0.05, 0.55, METAL, 0, 3.72, 0.3),
      box(0.3, 0.14, 0.4, DARK, 0, 3.66, 0.55),
      lens(0.24, 0.03, 0.32, LENS, 0, 3.58, 0.55),
      box(0.04, 3.4, 0.04, 0x777777, 0, 1.7, 0.02),
      box(0.05, 0.05, 0.05, METAL, 0, 3.8, 0.03),
    ]),
  buildLow: () => merge([box(0.3, 0.14, 0.55, DARK, 0, 3.66, 0.3)]),
});
def({
  id: "lamp_double",
  unit: false,
  maxTris: 160,
  dims: [0.3, 2.9, 8],
  lightAt: [0, 7.68, 1.3],
  build: () =>
    merge([
      cyl(0.17, 0.19, 0.5, 8, DARK, 0, 0.25, 0),
      openCyl(0.07, 0.11, 7.5, 8, METAL, 0, 4, 0, 2),
      box(0.07, 0.07, 2.6, METAL, 0, 7.82, 0),
      box(0.34, 0.15, 0.55, DARK, 0, 7.8, 1.3),
      box(0.34, 0.15, 0.55, DARK, 0, 7.8, -1.3),
      lens(0.26, 0.03, 0.45, LENS, 0, 7.71, 1.3),
      lens(0.26, 0.03, 0.45, LENS, 0, 7.71, -1.3),
    ]),
  buildLow: () => merge([box(0.16, 8, 0.16, METAL, 0, 4, 0), box(0.3, 0.15, 2.9, DARK, 0, 7.8, 0)]),
});
def({
  id: "pole_wood",
  unit: false,
  maxTris: 160,
  dims: [2.0, 0.3, 9],
  build: () =>
    merge([
      openCyl(0.11, 0.15, 9, 8, 0x7a5f3e, 0, 4.5, 0, 3),
      box(2.0, 0.1, 0.1, 0x5f4a30, 0, 8.4, 0),
      cyl(0.04, 0.05, 0.16, 6, 0xd8d8d0, -0.85, 8.53, 0),
      cyl(0.04, 0.05, 0.16, 6, 0xd8d8d0, 0, 8.53, 0),
      cyl(0.04, 0.05, 0.16, 6, 0xd8d8d0, 0.85, 8.53, 0),
      box(0.4, 0.5, 0.35, 0x6d7378, 0.25, 7.3, 0),
    ]),
  buildLow: () => merge([box(0.24, 9, 0.24, 0x7a5f3e, 0, 4.5, 0), box(2.0, 0.1, 0.1, 0x5f4a30, 0, 8.4, 0)]),
});
def({
  id: "pole_concrete",
  unit: false,
  maxTris: 160,
  dims: [2.0, 0.34, 9],
  build: () =>
    merge([
      openCyl(0.1, 0.17, 9, 8, 0xa7a59f, 0, 4.5, 0, 3),
      box(2.0, 0.12, 0.12, 0x6a6e72, 0, 8.4, 0),
      cyl(0.04, 0.05, 0.16, 6, 0xd8d8d0, -0.85, 8.54, 0),
      cyl(0.04, 0.05, 0.16, 6, 0xd8d8d0, 0, 8.54, 0),
      cyl(0.04, 0.05, 0.16, 6, 0xd8d8d0, 0.85, 8.54, 0),
    ]),
  buildLow: () => merge([box(0.26, 9, 0.26, 0xa7a59f, 0, 4.5, 0), box(2.0, 0.12, 0.12, 0x6a6e72, 0, 8.4, 0)]),
});
def({
  id: "bench_back",
  unit: false,
  maxTris: 160,
  dims: [1.8, 0.6, 0.85],
  build: () =>
    merge([
      box(1.8, 0.04, 0.12, WOOD, 0, 0.45, 0.17),
      box(1.8, 0.04, 0.12, WOOD, 0, 0.45, 0.03),
      box(1.8, 0.04, 0.12, WOOD, 0, 0.45, -0.11),
      box(1.8, 0.1, 0.03, WOOD, 0, 0.6, -0.24),
      box(1.8, 0.1, 0.03, WOOD, 0, 0.76, -0.27),
      box(0.06, 0.43, 0.5, DARK, -0.75, 0.215, 0),
      box(0.06, 0.43, 0.5, DARK, 0.75, 0.215, 0),
      box(0.05, 0.42, 0.05, DARK, -0.75, 0.64, -0.26),
      box(0.05, 0.42, 0.05, DARK, 0.75, 0.64, -0.26),
    ]),
  buildLow: () => merge([box(1.8, 0.45, 0.45, WOOD, 0, 0.225, 0.03), box(1.8, 0.4, 0.06, WOOD, 0, 0.65, -0.26)]),
});
def({
  id: "bench_flat",
  unit: false,
  maxTris: 160,
  dims: [1.8, 0.45, 0.45],
  build: () =>
    merge([
      box(1.8, 0.05, 0.14, WOOD, 0, 0.425, 0.15),
      box(1.8, 0.05, 0.14, WOOD, 0, 0.425, 0),
      box(1.8, 0.05, 0.14, WOOD, 0, 0.425, -0.15),
      box(0.08, 0.4, 0.42, 0x8a8a86, -0.7, 0.2, 0),
      box(0.08, 0.4, 0.42, 0x8a8a86, 0.7, 0.2, 0),
    ]),
  buildLow: () => merge([box(1.8, 0.45, 0.45, WOOD, 0, 0.225, 0)]),
});
def({
  id: "bin_post",
  unit: false,
  maxTris: 160,
  dims: [0.45, 0.45, 1.1],
  build: () => merge([openCyl(0.035, 0.035, 1.1, 6, METAL, 0, 0.55, -0.24), openCyl(0.2, 0.18, 0.55, 12, 0x2c5a3a, 0, 0.75, 0, 1), cyl(0.21, 0.21, 0.04, 12, DARK, 0, 1.04, 0)]),
  buildLow: () => merge([box(0.38, 0.55, 0.38, 0x2c5a3a, 0, 0.75, 0)]),
});
def({
  id: "bin_standing",
  unit: false,
  maxTris: 160,
  dims: [0.45, 0.45, 0.9],
  build: () => merge([cyl(0.21, 0.19, 0.86, 12, 0x2f3437, 0, 0.43, 0), cyl(0.225, 0.225, 0.05, 12, 0x1e2124, 0, 0.88, 0)]),
  buildLow: () => merge([box(0.42, 0.9, 0.42, 0x2f3437, 0, 0.45, 0)]),
});
def({
  id: "container",
  unit: false,
  maxTris: 160,
  dims: [1.5, 1.5, 1.6],
  build: () =>
    merge([
      box(1.5, 1.3, 1.5, 0x2e7d32, 0, 0.75, 0),
      box(1.4, 0.2, 1.4, 0x255f28, 0, 1.5, 0),
      cyl(0.25, 0.25, 0.1, 12, 0x1b1b1b, 0, 1.6, 0),
      box(0.08, 0.1, 0.08, 0x1b1b1b, -0.6, 0.05, -0.6),
      box(0.08, 0.1, 0.08, 0x1b1b1b, 0.6, 0.05, 0.6),
    ]),
  buildLow: () => merge([box(1.5, 1.6, 1.5, 0x2e7d32, 0, 0.8, 0)]),
});
def({
  id: "stop_pole",
  unit: false,
  maxTris: 160,
  dims: [0.5, 0.1, 2.8],
  build: () =>
    merge([
      openCyl(0.04, 0.045, 2.8, 8, 0x9aa0a6, 0, 1.4, 0, 3),
      box(0.45, 0.45, 0.03, 0xe31b23, 0, 2.55, 0.03),
      box(0.4, 0.22, 0.032, 0xffffff, 0, 2.55, 0.031),
      box(0.3, 0.5, 0.04, 0xf0f0f0, 0, 1.9, 0.03),
      cyl(0.06, 0.06, 0.04, 8, 0x9aa0a6, 0, 2.82, 0),
    ]),
  buildLow: () => merge([box(0.08, 2.8, 0.08, 0x9aa0a6, 0, 1.4, 0), box(0.45, 0.45, 0.03, 0xe31b23, 0, 2.55, 0.03)]),
});
def({
  id: "shelter",
  unit: false,
  maxTris: 160,
  dims: [3.2, 1.4, 2.5],
  lightAt: [0, 2.3, 0],
  build: () =>
    merge([
      box(3.2, 0.08, 1.4, 0x5f6b75, 0, 2.46, 0),
      box(0.07, 2.4, 0.07, METAL, -1.55, 1.2, -0.62),
      box(0.07, 2.4, 0.07, METAL, 1.55, 1.2, -0.62),
      box(0.07, 2.4, 0.07, METAL, -1.55, 1.2, 0.62),
      box(0.07, 2.4, 0.07, METAL, 1.55, 1.2, 0.62),
      box(3.1, 1.9, 0.02, 0x9fc3d6, 0, 1.25, -0.63),
      box(0.02, 1.9, 1.2, 0x9fc3d6, -1.55, 1.25, 0),
      MASKED(box(1.1, 1.7, 0.04, 0xf4f0e0, 1.55, 1.2, 0)),
      box(2.0, 0.05, 0.35, WOOD, 0, 0.47, -0.42),
      lens(2.6, 0.02, 0.15, LENS, 0, 2.41, 0),
    ]),
  buildLow: () => merge([box(3.2, 0.1, 1.4, 0x5f6b75, 0, 2.45, 0), box(3.1, 2.4, 0.05, 0x9fc3d6, 0, 1.2, -0.62)]),
});
def({
  id: "signal_post",
  unit: false,
  maxTris: 160,
  dims: [0.4, 0.4, 3.2],
  lightAt: [0, 2.6, 0.13],
  build: () => merge([openCyl(0.055, 0.06, 3.2, 8, 0x3a3d40, 0, 1.6, 0, 2), ...trafficHead(0, 2.6, 0)]),
  buildLow: () => merge([box(0.11, 3.2, 0.11, 0x3a3d40, 0, 1.6, 0), box(0.32, 0.95, 0.24, 0x1d1f22, 0, 2.6, 0)]),
});
def({
  id: "signal_mast",
  unit: false,
  maxTris: 160,
  dims: [6.5, 0.4, 6.0],
  lightAt: [-4.8, 5.1, 0.13],
  build: () =>
    merge([
      openCyl(0.11, 0.14, 6, 8, 0x3a3d40, 0, 3, 0, 1),
      box(6.0, 0.1, 0.1, 0x3a3d40, -3.0, 5.85, 0),
      ...trafficHead(-4.8, 5.1, 0),
      ...trafficHead(0, 2.9, 0.13),
    ]),
  buildLow: () => merge([box(0.24, 6, 0.24, 0x3a3d40, 0, 3, 0), box(6.0, 0.1, 0.1, 0x3a3d40, -3.0, 5.85, 0), box(0.32, 0.95, 0.24, 0x1d1f22, -4.8, 5.1, 0)]),
});
def({ id: "sign_octagon", unit: false, maxTris: 160, dims: [0.75, 0.1, 2.84], build: () => signFace("octagon"), buildLow: signLow });
def({ id: "sign_triangle", unit: false, maxTris: 160, dims: [0.75, 0.1, 2.84], build: () => signFace("triangle"), buildLow: signLow });
def({ id: "sign_round", unit: false, maxTris: 160, dims: [0.6, 0.1, 2.84], build: () => signFace("round"), buildLow: signLow });
def({ id: "sign_rect", unit: false, maxTris: 160, dims: [0.6, 0.1, 2.84], build: () => signFace("rect"), buildLow: signLow });
def({
  id: "hydrant_pillar",
  unit: false,
  maxTris: 160,
  dims: [0.36, 0.36, 0.75],
  build: () =>
    merge([
      cyl(0.16, 0.18, 0.08, 8, 0xb71c1c, 0, 0.04, 0),
      openCyl(0.11, 0.12, 0.55, 10, 0xc62828, 0, 0.35, 0),
      shape(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xc62828, 1, 1, 1, 0, 0.62, 0),
      cyl(0.05, 0.05, 0.12, 6, 0xd0d0d0, 0, 0.42, 0.14, ),
      cyl(0.03, 0.03, 0.04, 6, 0xd0d0d0, 0, 0.73, 0),
    ]),
  buildLow: () => merge([box(0.24, 0.75, 0.24, 0xc62828, 0, 0.375, 0)]),
});
def({
  id: "hydrant_plate",
  unit: false,
  maxTris: 160,
  dims: [0.5, 0.5, 0.05],
  build: () =>
    merge([
      box(0.5, 0.03, 0.5, 0x3a3a3a, 0, 0.015, 0),
      box(0.3, 0.02, 0.2, 0x555555, 0, 0.04, 0),
      box(0.04, 0.05, 0.04, 0xffd600, -0.22, 0.025, -0.22),
      box(0.04, 0.05, 0.04, 0xffd600, 0.22, 0.025, 0.22),
      box(0.04, 0.05, 0.04, 0xffd600, -0.22, 0.025, 0.22),
    ]),
  buildLow: () => merge([box(0.5, 0.05, 0.5, 0x3a3a3a, 0, 0.025, 0)]),
});
def({
  id: "hydrant_wall",
  unit: false,
  maxTris: 160,
  dims: [0.35, 0.2, 1.1],
  build: () =>
    merge([
      box(0.35, 0.45, 0.06, 0xc62828, 0, 0.85, 0.03),
      cyl(0.05, 0.05, 0.15, 8, 0xd0d0d0, 0, 0.75, 0.12),
      box(0.25, 0.1, 0.02, 0xffffff, 0, 1.0, 0.07),
      box(0.06, 0.5, 0.06, 0x777777, 0, 0.35, 0.03),
    ]),
  buildLow: () => merge([box(0.35, 0.45, 0.1, 0xc62828, 0, 0.85, 0.05)]),
});
def({
  id: "postbox_pillar",
  unit: false,
  maxTris: 160,
  dims: [0.5, 0.5, 1.5],
  build: () =>
    merge([
      cyl(0.25, 0.25, 0.1, 8, 0x8b0000, 0, 0.05, 0),
      openCyl(0.22, 0.22, 1.2, 10, 0xc8102e, 0, 0.7, 0),
      cyl(0.25, 0.25, 0.08, 10, 0x8b0000, 0, 1.34, 0),
      shape(new THREE.SphereGeometry(0.24, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0xc8102e, 1, 0.5, 1, 0, 1.38, 0),
      box(0.26, 0.04, 0.04, 0x111111, 0, 1.15, 0.21),
    ]),
  buildLow: () => merge([box(0.44, 1.5, 0.44, 0xc8102e, 0, 0.75, 0)]),
});
def({
  id: "bollard",
  unit: false,
  maxTris: 160,
  dims: [0.15, 0.15, 0.95],
  build: () =>
    merge([
      openCyl(0.075, 0.075, 0.9, 10, 0x2b2b2b, 0, 0.45, 0),
      cyl(0.078, 0.078, 0.08, 10, 0xe8e8e8, 0, 0.8, 0),
      shape(new THREE.SphereGeometry(0.075, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0x2b2b2b, 1, 0.6, 1, 0, 0.9, 0),
    ]),
  buildLow: () => merge([box(0.15, 0.95, 0.15, 0x2b2b2b, 0, 0.475, 0)]),
});
def({
  id: "cabinet",
  unit: false,
  maxTris: 160,
  dims: [1.2, 0.4, 1.3],
  build: () =>
    merge([
      box(1.2, 1.2, 0.4, 0x5b6b5b, 0, 0.7, 0),
      box(1.26, 0.06, 0.46, 0x4a584a, 0, 1.33, 0),
      box(1.2, 0.1, 0.4, 0x3a3a3a, 0, 0.05, 0),
      box(0.02, 1.0, 0.01, 0x3c463c, 0, 0.7, 0.205),
      box(0.04, 0.12, 0.02, 0x999999, 0.1, 0.8, 0.21),
    ]),
  buildLow: () => merge([box(1.2, 1.3, 0.4, 0x5b6b5b, 0, 0.65, 0)]),
});
def({ id: "standpipe", unit: false, maxTris: 160, dims: [0.4, 0.4, 1.025], build: createStandpipeGeometry, buildLow: () => merge([box(0.12, 1.0, 0.12, 0x607080, 0, 0.5, 0)]) });
def({ id: "stall", unit: false, maxTris: 160, dims: [2.4, 1.7, 2.6], lightAt: [0, 2.4, 0], build: () => {
  const g = createStallGeometry();
  return merge([g, lens(0.12, 0.12, 0.12, LENS, 0, 2.42, 0)]);
}, buildLow: () => merge([box(2.2, 0.9, 1.4, 0xc49a6c, 0, 0.45, 0), box(2.4, 0.06, 1.7, 0xe85030, 0, 2.55, 0)]) });
def({
  id: "trunk",
  unit: true,
  maxTris: 160,
  dims: [1, 1, 1],
  build: () => merge([openCyl(0.38, 0.5, 1, 8, 0x6b4f35, 0, 0.5, 0, 3)]),
  buildLow: () => merge([openCyl(0.4, 0.5, 1, 3, 0x6b4f35, 0, 0.5, 0, 1)]),
});
def({ id: "crown_round", unit: true, maxTris: 320, dims: [1, 1, 1], build: () => merge([unitRound(1)]), buildLow: () => merge([unitRound(0)]) });
def({
  id: "crown_ovoid",
  unit: true,
  maxTris: 320,
  dims: [1, 1, 1],
  build: () => merge([shape(new THREE.SphereGeometry(0.5, 10, 7), LEAF, 1, 1, 1, 0, 0.5, 0)]),
  buildLow: () => merge([unitRound(0)]),
});
def({
  id: "crown_conical",
  unit: true,
  maxTris: 320,
  dims: [1, 1, 1],
  build: () =>
    merge([
      shape(new THREE.ConeGeometry(0.5, 0.6, 12, 1, true), 0x2d5a34, 1, 1, 1, 0, 0.3, 0),
      shape(new THREE.ConeGeometry(0.38, 0.55, 12, 1, true), 0x2d5a34, 1, 1, 1, 0, 0.6, 0),
      shape(new THREE.ConeGeometry(0.24, 0.4, 12, 1, true), 0x2d5a34, 1, 1, 1, 0, 0.8, 0),
    ]),
  buildLow: () => merge([shape(new THREE.ConeGeometry(0.5, 1, 4, 1, true), 0x2d5a34, 1, 1, 1, 0, 0.5, 0)]),
});
def({
  id: "crown_umbrella",
  unit: true,
  maxTris: 320,
  dims: [1, 1, 1],
  build: () => merge([shape(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), 0x4a7d3a, 1, 1.6, 1, 0, 0.18, 0), shape(new THREE.CircleGeometry(0.47, 12), 0x355f2b, 1, 1, 1, 0, 0, 0).rotateX(Math.PI / 2).translate(0, 0.42, 0)]),
  buildLow: () => merge([shape(new THREE.IcosahedronGeometry(0.5, 0), 0x4a7d3a, 1, 0.6, 1, 0, 0.55, 0)]),
});
def({
  id: "crown_palm",
  unit: true,
  maxTris: 320,
  dims: [1, 1, 1],
  build: () => {
    const parts: THREE.BufferGeometry[] = [shape(new THREE.IcosahedronGeometry(0.07, 0), 0x6b5a2a, 1, 1, 1, 0, 0.62, 0)];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      // two-segment drooping frond, 0.5 long (unit radius 0.5)
      for (let s = 0; s < 2; s++) {
        const f = new THREE.BoxGeometry(0.09 - s * 0.03, 0.012, 0.26);
        f.translate(0, 0, 0.13);
        f.rotateX(s === 0 ? -0.35 : 0.55);
        f.translate(0, s === 0 ? 0.68 : 0.6, s === 0 ? 0 : 0.23);
        f.rotateY(a);
        paintSolid(f, s ? 0x4f8a2f : 0x3d7a2a);
        parts.push(f);
      }
    }
    return merge(parts);
  },
  buildLow: () => merge([shape(new THREE.IcosahedronGeometry(0.5, 0), 0x3d7a2a, 1, 0.35, 1, 0, 0.62, 0)]),
});
def({
  id: "crown_columnar",
  unit: true,
  maxTris: 320,
  dims: [1, 1, 1],
  build: () => merge([shape(new THREE.SphereGeometry(0.5, 10, 8), 0x37663a, 1, 1, 1, 0, 0.5, 0)]),
  buildLow: () => merge([shape(new THREE.OctahedronGeometry(0.5, 0), 0x37663a, 1, 1, 1, 0, 0.5, 0)]),
});

export function archetype(id: string): Archetype | null {
  return ARCHETYPES[id] ?? null;
}
