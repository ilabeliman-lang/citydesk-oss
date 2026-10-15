import * as THREE from "three";
import { getPropMaterial, propUniforms } from "@/world/render/materials";
import { applyRendererLook } from "@/world/realism/scanLook";
import { getRealism } from "@/world/realism/state";
import { mercatorAt } from "@/world/life/lifeLayer";
import { vehicleGeometry } from "@/world/life/models";
import { ARCHETYPES } from "./proceduralKit.ts";
import { projAt, type Proj } from "./geo.ts";
import { TIER_LOD, lodPlan, needsReplan, type Band, type LodCam, type LodItem, type LodPlan } from "./lod.ts";
import { haloFacing, kelvinToRgb, lampsOnFactor, nearestLights, poolIntensity, poolRadius } from "./lighting.ts";
import type { PropFx } from "./weatherFx.ts";
import type { PropRecord } from "./types.ts";

/**
 * NDU-UPG props (realism 03): ONE MapLibre custom layer `ndu-props` sharing the map's GL context and
 * depth buffer (like life/lifeLayer.ts). Real-size street furniture from OSM, static instances.
 *
 * Draw calls (Tier A ≤ 16 / B ≤ 8 budget): kit+trunks+cars (BatchedMesh, 1) · crowns (BatchedMesh,
 * 1, wind shader) · lamp/signal lenses (1) · glow halos (1) · light pools (1) · blob shadows (1).
 * three's built-in BatchedMesh (no new dependency) lets ~35 archetypes share one draw call.
 * Instance matrices are written only on a replan (camera moved > 8 m / 3°, cell set or tier change).
 */

export const PROPS_LAYER = "ndu-props";

export type PropsHostMap = {
  addLayer: (layer: Record<string, unknown>, before?: string) => void;
  getLayer: (id: string) => unknown;
  removeLayer: (id: string) => void;
  getCanvas: () => HTMLCanvasElement;
  getCenter: () => { lng: number; lat: number };
  getBearing: () => number;
  getPitch: () => number;
  getZoom: () => number;
  getStyle?: () => { layers?: { id: string; type: string }[] } | undefined;
  getTerrain?: () => unknown;
  queryTerrainElevation?: (lngLat: [number, number]) => number | null;
  triggerRepaint?: () => void;
};

export type PropsLayerApi = {
  setRecords: (records: PropRecord[]) => void;
  setTier: (t: "A" | "B") => void;
  setQuality: (q: { step: number; radiusScale?: number; lights?: number }) => void;
  setFx: (fx: PropFx, raw: { cloud: number; fog: number; rain: number }) => void;
  pulse: () => void;
  debug?: () => unknown;
  stats: () => Record<string, number>;
  dispose: () => void;
};

const RAD = Math.PI / 180;
const DAY_LENS = new THREE.Color(0x8c8a80);
const LIVERIES = [0xf2f2f2, 0x1e1e1e, 0x9aa3ab, 0x7a1c1c, 0x1d3f73, 0x2f5d3a, 0xc9b27c, 0x5a5a5a];
const LEAF_TINT: Record<string, number> = { p: 0xc8e6a8, n: 0xb7cfb0, b: 0xffffff, x: 0xffffff };

function conform(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const n = src.getAttribute("position").count;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", src.getAttribute("position").clone());
  if (!src.getAttribute("normal")) src.computeVertexNormals();
  out.setAttribute("normal", src.getAttribute("normal").clone());
  const col = src.getAttribute("color");
  out.setAttribute("color", col && col.itemSize === 3 ? col.clone() : new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const m = src.getAttribute("aMask");
  out.setAttribute("aMask", m ? m.clone() : new THREE.BufferAttribute(new Float32Array(n), 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

type Geo = { full: number; low: number; tFull: number; tLow: number };
type Batch = { mesh: THREE.BatchedMesh; geos: Map<string, Geo>; allocated: number; used: number };

function makeBatch(ids: string[], extra: Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>, maxInstances: number, material: THREE.Material): Batch {
  const built = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();
  for (const id of ids) {
    const a = ARCHETYPES[id];
    if (a) built.set(id, [conform(a.build()), conform(a.buildLow())]);
  }
  for (const [k, v] of extra) built.set(k, [conform(v[0]), conform(v[1])]);
  let verts = 0;
  for (const [f, l] of built.values()) verts += f.getAttribute("position").count + l.getAttribute("position").count;
  const mesh = new THREE.BatchedMesh(maxInstances, verts, 0, material);
  mesh.perObjectFrustumCulled = false;
  mesh.sortObjects = false;
  mesh.frustumCulled = false;
  const geos = new Map<string, Geo>();
  for (const [id, [f, l]] of built) {
    geos.set(id, { full: mesh.addGeometry(f), low: mesh.addGeometry(l), tFull: f.getAttribute("position").count / 3, tLow: l.getAttribute("position").count / 3 });
    f.dispose();
    l.dispose();
  }
  return { mesh, geos, allocated: 0, used: 0 };
}

function carLow(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.78, 1.3, 4.3);
  g.translate(0, 0.75, 0);
  return g;
}

export function addPropsLayer(map: PropsHostMap, initialTier: "A" | "B"): PropsLayerApi {
  let tier = initialTier;
  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.matrixAutoUpdate = false;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(hemi, sun);

  const caps = () => TIER_LOD[tier].caps;
  const kitIds = Object.keys(ARCHETYPES).filter((k) => !k.startsWith("crown_"));
  const crownIds = Object.keys(ARCHETYPES).filter((k) => k.startsWith("crown_"));
  const maxKit = TIER_LOD.A.caps.kit + TIER_LOD.A.caps.lamps + TIER_LOD.A.caps.cars + TIER_LOD.A.caps.trees;
  const kit = makeBatch(kitIds, new Map([["car", [vehicleGeometry("car"), carLow()]]]), maxKit, getPropMaterial("opaque"));
  const crowns = makeBatch(crownIds, new Map(), TIER_LOD.A.caps.trees, getPropMaterial("crown"));

  const MAX_LIGHTS = TIER_LOD.A.caps.lamps + 200;
  const lensGeo = new THREE.BoxGeometry(1, 1, 1);
  const lenses = new THREE.InstancedMesh(lensGeo, getPropMaterial("lens"), MAX_LIGHTS);
  const quad = new THREE.PlaneGeometry(1, 1);
  const glows = new THREE.InstancedMesh(quad, getPropMaterial("glow"), MAX_LIGHTS);
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, getPropMaterial("pool"), MAX_LIGHTS);
  const blobGeo = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, TIER_LOD.A.caps.kit + TIER_LOD.A.caps.lamps + TIER_LOD.A.caps.cars + TIER_LOD.A.caps.trees);
  const white = new THREE.Color(1, 1, 1);
  for (const m of [lenses, glows, pools]) {
    m.setColorAt(0, white);
    m.frustumCulled = false;
    m.count = 0;
  }
  blobs.frustumCulled = false;
  blobs.count = 0;
  glows.renderOrder = 5;
  pools.renderOrder = 3;
  blobs.renderOrder = 2;
  scene.add(kit.mesh, crowns.mesh, lenses, pools, blobs, glows);
  // Night-glow fix: halos are camera-facing, so their orientation must follow the camera every frame it
  // moves, not only when the lights are re-evaluated (every 2-10 s). Positions/sizes are cached here.
  const glowPos = new Float32Array(MAX_LIGHTS * 4);
  let facedPitch = Number.NaN;
  let facedBearing = Number.NaN;
  const faceGlows = (pitchDeg: number, bearingDeg: number) => {
    const [rx, ry] = haloFacing(pitchDeg, bearingDeg);
    for (let i = 0; i < glows.count; i++) {
      const size = glowPos[i * 4 + 3];
      dummy.position.set(glowPos[i * 4], glowPos[i * 4 + 1], glowPos[i * 4 + 2]);
      dummy.rotation.set(rx, ry, 0, "YXZ");
      dummy.scale.set(size, size * fx.haloY, size);
      dummy.updateMatrix();
      glows.setMatrixAt(i, dummy.matrix);
    }
    glows.instanceMatrix.needsUpdate = true;
    facedPitch = pitchDeg;
    facedBearing = bearingDeg;
  };
  const points: THREE.PointLight[] = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.PointLight(0xffd8a0, 0, 15, 2);
    p.visible = false;
    points.push(p);
    scene.add(p);
  }

  // state
  let records: PropRecord[] = [];
  let items: LodItem[] = [];
  let xy: Float64Array = new Float64Array(0);
  let elev: Float32Array = new Float32Array(0);
  let proj: Proj | null = null;
  let origin: [number, number] | null = null;
  let plan: LodPlan | null = null;
  let lastCam: LodCam | null = null;
  let dirty = true;
  let quality = { step: 0, radiusScale: undefined as number | undefined, lights: 4 };
  let fx: PropFx = { wind: [0, 0, 0], wet: 0, halo: 1, haloY: 1, farScale: 1, swayOn: false };
  let fxRaw = { cloud: 0.1, fog: 0, rain: 0 };
  let lightVersion = -1;
  let lightAt = 0;
  let pulseUntil = 0;
  const lit: { i: number; band: Band; on: number; rgb: [number, number, number]; pos: THREE.Vector3; h: number; id: number }[] = [];
  const stats = { replans: 0, lightUpdates: 0, instances: 0, tris: 0, drawCalls: 0, triangles: 0, dropped: 0, lights: 0, lenses: 0, glows: 0, pools: 0, pointLights: 0 };

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const tmp = new THREE.Vector3();
  const base = new THREE.Matrix4();
  const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);

  const reanchor = (lng: number, lat: number) => {
    origin = [lng, lat];
    proj = projAt(lng, lat);
    xy = new Float64Array(records.length * 2);
    for (let i = 0; i < records.length; i++) {
      const [x, y] = proj.toXY(records[i].lng, records[i].lat);
      xy[i * 2] = x;
      xy[i * 2 + 1] = y;
    }
    items = records.map((r, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1], kind: r.kind, archetype: r.archetype }));
    dirty = true;
  };

  const groundAt = (i: number): number => {
    if (tier !== "A" || !map.getTerrain?.()) return 0;
    let e = elev[i];
    if (Number.isNaN(e)) {
      try {
        e = Math.round((map.queryTerrainElevation?.([records[i].lng, records[i].lat]) ?? 0) * 20) / 20;
      } catch {
        e = 0;
      }
      elev[i] = e;
    }
    return e;
  };

  const trisOf = (arch: string, band: Band): number => {
    if (arch.startsWith("crown_")) {
      const c = crowns.geos.get(arch);
      const t = kit.geos.get("trunk");
      return (band === "near" ? (c?.tFull ?? 80) + (t?.tFull ?? 30) : (c?.tLow ?? 20) + (t?.tLow ?? 6));
    }
    if (band === "far") return 4; // a lamp far away is only its glow quad
    const g = kit.geos.get(arch);
    return band === "near" ? (g?.tFull ?? 60) : (g?.tLow ?? 12);
  };

  const camNow = (): LodCam | null => {
    if (!proj) return null;
    const c = map.getCenter();
    const [x, y] = proj.toXY(c.lng, c.lat);
    const canvas = map.getCanvas();
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 600;
    const vfov = 36.87;
    const hfov = Math.min(150, 2 * Math.atan(Math.tan((vfov / 2) * RAD) * (w / h)) / RAD);
    const mpp = (78271.517 * Math.cos(c.lat * RAD)) / 2 ** map.getZoom();
    const dist = (h / 2 / Math.tan((vfov / 2) * RAD)) * mpp;
    return { x, y, bearing: map.getBearing(), hfov, back: Math.min(800, dist * Math.sin(map.getPitch() * RAD)) };
  };

  const fill = (b: Batch, list: { geo: number; m: THREE.Matrix4; c: THREE.Color }[]) => {
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (k >= b.allocated) {
        b.mesh.addInstance(e.geo);
        b.allocated += 1;
      } else {
        b.mesh.setGeometryIdAt(k, e.geo);
        b.mesh.setVisibleAt(k, true);
      }
      b.mesh.setMatrixAt(k, e.m);
      b.mesh.setColorAt(k, e.c);
    }
    for (let k = list.length; k < b.used; k++) b.mesh.setVisibleAt(k, false);
    b.used = list.length;
  };

  const placeMatrix = (i: number, sx: number, sy: number, sz: number, yawDeg: number, lift = 0): THREE.Matrix4 => {
    dummy.position.set(xy[i * 2], groundAt(i) + lift, -xy[i * 2 + 1]);
    dummy.rotation.set(0, Math.PI - yawDeg * RAD, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };

  const replan = (cam: LodCam) => {
    stats.replans += 1;
    const q = { step: quality.step, radiusScale: quality.radiusScale };
    plan = lodPlan(items, cam, tier, q, trisOf, fx.farScale);
    stats.tris = plan.tris;
    stats.dropped = plan.dropped;
    const kitList: { geo: number; m: THREE.Matrix4; c: THREE.Color }[] = [];
    const crownList: typeof kitList = [];
    let nBlob = 0;
    lit.length = 0;
    const trunk = kit.geos.get("trunk");
    for (const [arch, bands] of plan.byArchetype) {
      for (const band of ["near", "mid", "far"] as const) {
        const arr = bands[band];
        for (let n = 0; n < arr.length; n++) {
          const i = arr[n];
          const r = records[i];
          if (r.kind === "tree" && r.tree) {
            const H = r.heightM;
            const palm = r.tree.crownShape === "palm";
            const crownH = palm ? Math.max(1.5, Math.min(H * 0.3, r.tree.crownM * 0.6)) : Math.max(1, H - r.tree.trunkM);
            const crownBase = palm ? H - crownH : r.tree.trunkM;
            const trunkD = palm ? 0.35 : Math.max(0.18, Math.min(1.2, H * 0.035));
            const g = crowns.geos.get(arch);
            if (trunk) kitList.push({ geo: band === "near" ? trunk.full : trunk.low, m: placeMatrix(i, trunkD, crownBase + crownH * 0.25, trunkD, 0), c: white });
            if (g) {
              color.setHex(LEAF_TINT[r.tree.leaf] ?? 0xffffff).multiplyScalar(0.88 + (r.variant / 7) * 0.24);
              crownList.push({ geo: band === "near" ? g.full : g.low, m: placeMatrix(i, r.tree.crownM, crownH, r.tree.crownM, 0, crownBase), c: color.clone() });
            }
            if (band !== "far" && nBlob < blobs.instanceMatrix.count) {
              blobs.setMatrixAt(nBlob++, placeMatrix(i, r.tree.crownM * 0.9, 1, r.tree.crownM * 0.9, 0, 0.03));
            }
            continue;
          }
          const a = ARCHETYPES[arch];
          if (band !== "far") {
            const g = kit.geos.get(arch);
            if (g) {
              let m: THREE.Matrix4;
              let c = white;
              if (r.kind === "parked_car") {
                m = placeMatrix(i, 1, 1, 1, r.yawDeg);
                c = color.setHex(LIVERIES[r.variant % LIVERIES.length]).clone();
              } else {
                const nomH = a?.dims[2] ?? r.heightM;
                const sy = nomH > 0.06 ? r.heightM / nomH : 1;
                const sxz = Math.min(1.3, Math.max(0.75, sy));
                const sx = r.kind === "bench" && a ? r.widthM / a.dims[0] : sxz;
                m = placeMatrix(i, sx, sy, sxz, r.yawDeg);
              }
              kitList.push({ geo: band === "near" ? g.full : g.low, m, c });
              if (band === "near" && nBlob < blobs.instanceMatrix.count && r.heightM > 0.3) {
                const s = r.kind === "parked_car" ? 2.6 : Math.max(0.4, Math.min(2.5, Math.max(r.widthM, r.depthM) * 1.2));
                blobs.setMatrixAt(nBlob++, placeMatrix(i, r.kind === "parked_car" ? 2 : s, 1, r.kind === "parked_car" ? 4.6 : s, r.yawDeg, 0.03));
              }
            }
          }
          // light sources: lamps (all bands), lit shelters, signals and stalls (near/mid)
          const la = a?.lightAt;
          if (la && (r.kind === "lamp" || (band !== "far" && (r.kind === "traffic_signals" || (r.archetype === "shelter" && r.lit) || r.kind === "food_stall")))) {
            const m = placeMatrix(i, 1, 1, 1, 0);
            const nomH = a.dims[2];
            const sy = r.kind === "lamp" && nomH > 0 ? r.heightM / nomH : 1;
            const sxz = Math.min(1.3, Math.max(0.75, sy));
            // rotate the local light offset by yaw, then scale
            const yaw = Math.PI - r.yawDeg * RAD;
            const lx = la[0] * sxz;
            const lz = la[2] * sxz;
            tmp.set(lx * Math.cos(yaw) + lz * Math.sin(yaw), la[1] * sy, -lx * Math.sin(yaw) + lz * Math.cos(yaw));
            const pos = new THREE.Vector3().setFromMatrixPosition(m).add(tmp);
            const kelvin = r.lamp?.kelvin ?? (r.kind === "food_stall" ? 2700 : 4000);
            lit.push({ i, band, on: 0, rgb: kelvinToRgb(kelvin), pos, h: r.kind === "lamp" ? r.heightM : 3, id: r.osmId + r.variant });
          }
        }
      }
    }
    fill(kit, kitList);
    fill(crowns, crownList);
    blobs.count = nBlob;
    blobs.instanceMatrix.needsUpdate = true;
    stats.instances = kitList.length + crownList.length;
    lightVersion = -1; // re-light with the new set
  };

  const relight = (cam: LodCam | null) => {
    const st = getRealism();
    stats.lightUpdates += 1;
    const s = st.sun;
    const rising = s.azimuth < 180; // morning sun is in the eastern half of the sky
    const night = st.pal.night;
    let nl = 0;
    let ng = 0;
    let np = 0;
    const pitch = map.getPitch();
    const t = performance.now() / 1000;
    for (const L of lit) {
      const r = records[L.i];
      const isSignal = r.kind === "traffic_signals";
      L.on = isSignal ? 1 : lampsOnFactor(s, fxRaw, r.osmId, r.lamp?.schedule ?? "dusk_dawn", rising);
      if (L.band !== "far" && nl < MAX_LIGHTS) {
        // lens: a small emissive patch at the light point
        dummy.position.copy(L.pos);
        dummy.rotation.set(0, Math.PI - r.yawDeg * RAD, 0);
        if (isSignal) {
          // cycle stub: 30 s green / 4 s amber / 30 s red, offset per approach
          const ph = (t + (r.variant % 2) * 34) % 64;
          const off = ph < 30 ? -0.3 : ph < 34 ? 0 : 0.3;
          dummy.position.y += off;
          dummy.scale.set(0.2, 0.2, 0.02);
          color.setHex(ph < 30 ? 0x3cff6a : ph < 34 ? 0xffb000 : 0xff3b30).multiplyScalar(2.2);
        } else {
          const big = r.archetype === "shelter";
          dummy.scale.set(big ? 2.6 : 0.3, big ? 0.03 : 0.035, big ? 0.15 : 0.45);
          dummy.position.y -= big ? 0 : 0.02;
          color.copy(DAY_LENS).lerp(new THREE.Color(L.rgb[0] * 3, L.rgb[1] * 3, L.rgb[2] * 3), L.on);
        }
        dummy.updateMatrix();
        lenses.setMatrixAt(nl, dummy.matrix);
        lenses.setColorAt(nl, color);
        nl += 1;
      }
      const glowOn = isSignal ? Math.max(0.15, night) : L.on * Math.max(0.25, night);
      if (glowOn > 0.02 && ng < MAX_LIGHTS && (!isSignal || L.band === "near")) {
        const size = (isSignal ? 0.9 : Math.max(1.2, L.h * 0.32)) * fx.halo;
        glowPos[ng * 4] = L.pos.x;
        glowPos[ng * 4 + 1] = L.pos.y;
        glowPos[ng * 4 + 2] = L.pos.z;
        glowPos[ng * 4 + 3] = size;
        const k = (isSignal ? 0.35 : 0.55) * glowOn;
        color.setRGB(L.rgb[0] * k, L.rgb[1] * k, L.rgb[2] * k);
        if (isSignal) color.setHex(0x30ff60).multiplyScalar(0.2 * glowOn);
        glows.setColorAt(ng, color);
        ng += 1;
      }
      const pi = isSignal ? 0 : poolIntensity(L.on, night);
      if (pi > 0.01 && L.band !== "far" && np < MAX_LIGHTS) {
        const R = poolRadius(L.h) * 2;
        dummy.position.set(L.pos.x, groundAt(L.i) + 0.02, L.pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(R, 1, R);
        dummy.updateMatrix();
        pools.setMatrixAt(np, dummy.matrix);
        const k = 0.32 * pi * (1 + 0.6 * fx.wet); // wet asphalt reflects more
        color.setRGB(L.rgb[0] * k, L.rgb[1] * k, L.rgb[2] * k);
        pools.setColorAt(np, color);
        np += 1;
      }
    }
    lenses.count = nl;
    glows.count = ng;
    faceGlows(pitch, map.getBearing());
    pools.count = np;
    stats.lights = lit.length;
    stats.lenses = nl;
    stats.glows = ng;
    stats.pools = np;
    for (const m of [lenses, glows, pools]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // Tier A: the 4 nearest lit lamps become real point lights (benches/cars under them light up)
    const want = tier === "A" ? Math.min(4, quality.lights) : 0;
    const near = want && cam && night > 0.15 ? nearestLights(lit.filter((l) => l.band === "near" && records[l.i].kind === "lamp").map((l, k) => ({ i: k, id: l.id, x: l.pos.x, y: -l.pos.z, on: l.on })), cam.x, cam.y, want) : [];
    const lamps = lit.filter((l) => l.band === "near" && records[l.i].kind === "lamp");
    points.forEach((p, k) => {
      const L = near[k] != null ? lamps[near[k]] : null;
      p.visible = Boolean(L);
      if (!L) return;
      p.position.copy(L.pos);
      p.color.setRGB(L.rgb[0], L.rgb[1], L.rgb[2]);
      p.distance = 2.5 * L.h;
      p.intensity = 40 * L.on * Math.min(1, night * 1.5);
    });
    stats.pointLights = points.filter((p) => p.visible).length;
  };

  const syncLights = () => {
    const st = getRealism();
    const { pal, sun: s } = st;
    const key = s.altitude > -4 ? s : { azimuth: s.moon.azimuth, altitude: Math.max(15, s.moon.altitude) };
    const az = key.azimuth * RAD;
    const alt = Math.max(4, key.altitude) * RAD;
    sun.position.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
    sun.color.set(pal.light);
    sun.intensity = Math.max(0.35, pal.sunIntensity);
    hemi.color.set(pal.hemiSky);
    hemi.groundColor.set(pal.hemiGround);
    const flash = performance.now() < pulseUntil ? 4 : 1;
    hemi.intensity = Math.max(0.5, pal.hemiIntensity) * flash;
    blobMat.opacity = 0.24 * Math.min(1, pal.sunIntensity / 1.6) * (1 - 0.75 * fxRaw.cloud);
    if (renderer) renderer.toneMappingExposure = Math.max(0.85, pal.exposure);
  };

  const before = (() => {
    const layers = map.getStyle?.()?.layers ?? [];
    if (map.getLayer("ndu-life")) return "ndu-life";
    return layers.find((l) => l.type === "symbol")?.id;
  })();

  map.addLayer(
    {
      id: PROPS_LAYER,
      type: "custom",
      renderingMode: "3d",
      onAdd: (_m: unknown, gl: WebGL2RenderingContext) => {
        renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        applyRendererLook(renderer);
        dirty = true;
      },
      render: (_gl: unknown, args: unknown) => {
        if (!renderer || !origin || !records.length) return;
        const input = args as { defaultProjectionData?: { mainMatrix: ArrayLike<number> }; modelViewProjectionMatrix?: ArrayLike<number> };
        const raw = ArrayBuffer.isView(args) || Array.isArray(args) ? (args as ArrayLike<number>) : (input.defaultProjectionData?.mainMatrix ?? input.modelViewProjectionMatrix);
        if (!raw) return;
        const c = map.getCenter();
        if (proj) {
          const [dx, dy] = proj.toXY(c.lng, c.lat);
          if (Math.hypot(dx, dy) > 2000) reanchor(c.lng, c.lat); // float32 jitter guard
        }
        const cam = camNow();
        if (cam && (dirty || needsReplan(lastCam, cam))) {
          replan(cam);
          lastCam = cam;
          dirty = false;
        }
        const st = getRealism();
        const now = performance.now();
        // re-light on a sun change, every 10 s near the switching band, or every 2 s for signals
        const nearBand = st.sun.altitude > -6 && st.sun.altitude < 6;
        if (st.version !== lightVersion || (nearBand && now - lightAt > 10_000) || now - lightAt > 2000) {
          lightVersion = st.version;
          lightAt = now;
          syncLights();
          relight(cam);
        }
        if (glows.count) {
          const pNow = map.getPitch();
          const bNow = map.getBearing();
          if (Math.abs(pNow - facedPitch) > 0.05 || Math.abs(bNow - facedBearing) > 0.05) faceGlows(pNow, bNow);
        }
        propUniforms.uTime.value = document.hidden ? propUniforms.uTime.value : now / 1000;
        if (now < pulseUntil + 200) syncLights();
        const at = mercatorAt(origin[0], origin[1]);
        const s = at.metre;
        base.makeTranslation(at.x, at.y, at.z).scale(new THREE.Vector3(s, -s, s)).multiply(rotX);
        camera.projectionMatrix.fromArray(Array.from(raw)).multiply(base);
        renderer.resetState();
        renderer.render(scene, camera);
        stats.drawCalls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
        renderer.resetState();
        if (fx.swayOn) map.triggerRepaint?.(); // keep crowns swaying (only when there is wind)
      },
      onRemove: () => {
        renderer?.dispose();
        renderer = null;
      },
    },
    before,
  );

  return {
    setRecords(next) {
      records = next;
      elev = new Float32Array(next.length).fill(Number.NaN);
      const c = map.getCenter();
      reanchor(origin?.[0] ?? c.lng, origin?.[1] ?? c.lat);
      map.triggerRepaint?.();
    },
    setTier(t) {
      if (t === tier) return;
      tier = t;
      elev.fill(Number.NaN);
      dirty = true;
      map.triggerRepaint?.();
    },
    setQuality(q) {
      quality = { step: q.step, radiusScale: q.radiusScale, lights: q.lights ?? 4 };
      dirty = true;
      map.triggerRepaint?.();
    },
    setFx(next, rawFx) {
      const farChanged = next.farScale !== fx.farScale;
      fx = next;
      fxRaw = rawFx;
      propUniforms.uWet.value = next.wet;
      propUniforms.uWind.value.set(next.wind[0], next.wind[1], next.wind[2]);
      if (farChanged) dirty = true;
      lightVersion = -1;
      map.triggerRepaint?.();
    },
    debug: () => ({ lit: lit.slice(0, 3).map((l) => ({ i: l.i, on: l.on, pos: l.pos.toArray(), xy: [xy[l.i * 2], xy[l.i * 2 + 1]], rec: records[l.i].archetype, h: l.h })), glowCol: glows.instanceColor ? Array.from(glows.instanceColor.array.slice(0, 3)) : null, glowMat: Array.from(glows.instanceMatrix.array.slice(0, 16)), lensCol: lenses.instanceColor ? Array.from(lenses.instanceColor.array.slice(0, 3)) : null, night: getRealism().pal.night }),
    pulse() {
      pulseUntil = performance.now() + 120;
      map.triggerRepaint?.();
    },
    stats: () => ({ records: records.length, tier: tier === "A" ? 1 : 2, ...stats }),
    dispose() {
      if (map.getLayer(PROPS_LAYER)) map.removeLayer(PROPS_LAYER);
      kit.mesh.dispose();
      crowns.mesh.dispose();
      for (const g of [lensGeo, quad, poolGeo, blobGeo]) g.dispose();
      for (const m of [lenses, glows, pools, blobs]) m.dispose();
      blobMat.dispose();
    },
  };
}
