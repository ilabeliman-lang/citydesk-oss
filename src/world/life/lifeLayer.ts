import * as THREE from "three";
import { applyRendererLook } from "@/world/realism/scanLook";
import { getRealism } from "@/world/realism/state";
import type { VKind } from "./density.ts";
import type { StreetSim } from "./sim.ts";
import { gaitMaterial, plainMaterial, shadowDisc, vehicleGeometry, walkerCloth, walkerSkin } from "./models.ts";
import { propShadow } from "../shadows/props.ts";
import { sizeOf } from "../traffic/dimensions.ts";

/**
 * NDU-UPG life: draws the street sim inside ONE MapLibre custom layer that shares the map's WebGL
 * context and depth buffer (no second canvas), so people and vehicles hide behind buildings.
 * Draw calls: walkers 2 + vehicles 4 + blob shadows 1 = 7 for the whole street.
 * Loaded only on Tier A/B (three.js is never in the first-map bundle).
 */

/** Web-Mercator anchor (same maths as MapLibre's MercatorCoordinate; no map-library global needed). */
export function mercatorAt(lng: number, lat: number, alt = 0) {
  const x = (lng + 180) / 360;
  const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
  const metre = 1 / (40075016.686 * Math.cos((lat * Math.PI) / 180)); // mercator units per metre
  return { x, y, z: alt * metre, metre };
}

export type LifeHostMap = {
  addLayer: (layer: Record<string, unknown>, before?: string) => void;
  getLayer: (id: string) => unknown;
  removeLayer: (id: string) => void;
  getCanvas: () => HTMLCanvasElement;
};

export const LIFE_LAYER = "ndu-life";
const KINDS: VKind[] = ["car", "keke", "bus", "danfo"];
const VEHICLE_SHADOW: Record<VKind, [number, number]> = { car: [sizeOf("car").width / 2, sizeOf("car").length / 2], keke: [0.8, 1.6], bus: [sizeOf("bus").width / 2, sizeOf("bus").length / 2], danfo: [1.2, 2.7] };

/** z0: drawn ground (m) at the graph origin; dem0: DEM there (realism 02 cluster rule). Both 0 = flat. */
export type FrameInfo = { sim: StreetSim | null; scale: number; vscale: number; z0?: number; dem0?: number };

export function addLifeLayer(map: LifeHostMap, frame: (now: number) => FrameInfo): () => void {
  const tier = document.documentElement.dataset.nduTier;
  const maxW = tier === "A" ? 80 : 32;
  const maxV = tier === "A" ? 44 : 24;
  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.matrixAutoUpdate = false;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(hemi, sun);

  const gait = new THREE.InstancedBufferAttribute(new Float32Array(maxW * 2), 2);
  gait.setUsage(THREE.DynamicDrawUsage);
  const clothGeo = walkerCloth();
  const skinGeo = walkerSkin();
  clothGeo.setAttribute("aGait", gait);
  skinGeo.setAttribute("aGait", gait);
  const gaitMat = gaitMaterial();
  const cloth = new THREE.InstancedMesh(clothGeo, gaitMat, maxW);
  const skin = new THREE.InstancedMesh(skinGeo, gaitMat, maxW);
  const vehMat = plainMaterial();
  const fleets = new Map<VKind, THREE.InstancedMesh>(KINDS.map((k) => [k, new THREE.InstancedMesh(vehicleGeometry(k), vehMat, maxV)]));
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
  const shadows = new THREE.InstancedMesh(shadowDisc(), shadowMat, maxW + maxV);
  shadows.renderOrder = 2;
  const meshes = [cloth, skin, ...fleets.values(), shadows];
  const white = new THREE.Color(0xffffff);
  for (const m of meshes) {
    if (m !== shadows) m.setColorAt(0, white); // create instanceColor up front (no shader recompile later)
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    scene.add(m);
  }
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const base = new THREE.Matrix4();
  const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  let lightVersion = -1;

  const syncLights = () => {
    const st = getRealism();
    if (st.version === lightVersion) return;
    lightVersion = st.version;
    const { pal, sun: s } = st;
    // the moon keys the street at night (#43); a floor keeps people readable in the dark
    const key = s.altitude > -4 ? s : { azimuth: s.moon.azimuth, altitude: Math.max(15, s.moon.altitude) };
    const az = (key.azimuth * Math.PI) / 180;
    const alt = (Math.max(4, key.altitude) * Math.PI) / 180;
    sun.position.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
    sun.color.set(pal.light);
    sun.intensity = Math.max(0.6, pal.sunIntensity);
    hemi.color.set(pal.hemiSky);
    hemi.groundColor.set(pal.hemiGround);
    hemi.intensity = Math.max(0.9, pal.hemiIntensity);
    if (renderer) renderer.toneMappingExposure = Math.max(0.85, pal.exposure);
  };

  const fill = (sim: StreetSim, scale: number, vscale: number, dem0: number) => {
    const lift = sim.g.nodeZ ? 0.03 : 0;
    let n = 0;
    let shade = 0;
    const g = gait.array as Float32Array;
    // The layer already aims `sun` (x east, y up, z south). propShadow wants that as east/north/up.
    syncLights();
    const light = { east: sun.position.x, north: -sun.position.z, up: sun.position.y };
    const personShade = propShadow("person", light);
    const vehicleShade = propShadow("vehicle", light);
    for (const w of sim.walkers) {
      if (n >= maxW || !w.placed) continue;
      const f = w.fade * scale * w.tall;
      if (f <= 0.01) continue;
      const wy = sim.g.nodeZ ? (w.rz ?? dem0) - dem0 : 0;
      dummy.position.set(w.rx, wy, -w.ry);
      dummy.rotation.set(0, Math.PI - w.rh, 0);
      dummy.scale.setScalar(f);
      dummy.updateMatrix();
      cloth.setMatrixAt(n, dummy.matrix);
      skin.setMatrixAt(n, dummy.matrix);
      cloth.setColorAt(n, color.setHex(w.outfit));
      skin.setColorAt(n, color.setHex(w.skin));
      g[n * 2] = w.phase;
      g[n * 2 + 1] = w.amp;
      dummy.position.x += personShade.x;
      dummy.position.z += personShade.z;
      dummy.scale.set(0.42 * f, 1, 0.42 * f);
      dummy.position.y = wy + lift;
      dummy.updateMatrix();
      shadows.setMatrixAt(shade++, dummy.matrix);
      n += 1;
    }
    cloth.count = skin.count = n;
    gait.needsUpdate = true;
    const counts = new Map<VKind, number>(KINDS.map((k) => [k, 0]));
    for (const v of sim.vehicles) {
      const mesh = fleets.get(v.kind);
      const i = counts.get(v.kind) ?? 0;
      if (!mesh || i >= maxV || !v.placed) continue;
      const f = v.fade * vscale;
      if (f <= 0.01) continue;
      const vy = sim.g.nodeZ ? (v.rz ?? dem0) - dem0 : 0;
      dummy.position.set(v.rx, vy, -v.ry);
      if (sim.g.nodeZ) dummy.rotation.set(-(v.pitch ?? 0), Math.PI - v.rh, v.roll ?? 0, "YXZ");
      else dummy.rotation.set(0, Math.PI - v.rh, 0);
      dummy.scale.setScalar(f);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex(v.color));
      counts.set(v.kind, i + 1);
      if (shade < maxW + maxV) {
        const [sx, sz] = VEHICLE_SHADOW[v.kind];
        dummy.position.x += vehicleShade.x;
        dummy.position.z += vehicleShade.z;
        dummy.scale.set(sx * f, 1, sz * f);
        dummy.position.y = vy + lift;
        dummy.updateMatrix();
        shadows.setMatrixAt(shade++, dummy.matrix);
      }
    }
    for (const [kind, mesh] of fleets) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    shadows.count = shade;
    for (const m of [cloth, skin, shadows]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    return n + shade;
  };

  map.addLayer({
    id: LIFE_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd: (_map: unknown, gl: WebGL2RenderingContext) => {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      applyRendererLook(renderer);
    },
    render: (_gl: unknown, args: unknown) => {
      if (!renderer) return;
      const info = frame(performance.now());
      const sim = info.sim;
      if (!sim || info.scale <= 0) return;
      const input = args as { defaultProjectionData?: { mainMatrix: ArrayLike<number> }; modelViewProjectionMatrix?: ArrayLike<number> };
      const raw = ArrayBuffer.isView(args) || Array.isArray(args) ? (args as ArrayLike<number>) : (input.defaultProjectionData?.mainMatrix ?? input.modelViewProjectionMatrix);
      if (!raw) return;
      const boost = import.meta.env.DEV && location.search.includes("lifedebug") ? 12 : 1;
      if (!fill(sim, info.scale * boost, info.vscale * boost, info.dem0 ?? 0)) return;
      syncLights();
      // local metres (x east, y up, z south) around the graph origin -> mercator
      const at = mercatorAt(sim.g.lng0, sim.g.lat0, sim.g.nodeZ ? (info.z0 ?? 0) : 0);
      const s = at.metre;
      base.makeTranslation(at.x, at.y, at.z).scale(new THREE.Vector3(s, -s, s)).multiply(rotX);
      camera.projectionMatrix.fromArray(Array.from(raw)).multiply(base);
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState(); // hand MapLibre back a clean GL state
    },
    onRemove: () => {
      renderer?.dispose();
      renderer = null;
    },
  });

  return () => {
    if (map.getLayer(LIFE_LAYER)) map.removeLayer(LIFE_LAYER);
    for (const m of meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    gaitMat.dispose();
    vehMat.dispose();
    shadowMat.dispose();
  };
}
