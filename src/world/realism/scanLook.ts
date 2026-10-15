import * as THREE from "three";
import { renderSettings } from "./settings.ts";
import { getRealism } from "./state.ts";
import { sunVector } from "./sun.ts";

/**
 * three.js side of the realism pass, used by scanLayer.ts (loaded only with the scan chunk).
 *   #2  sRGB output + ACES filmic tone mapping so scan textures match the basemap
 *   #5 #6 #9  scan key light = the same sun as the map's setLight; hemisphere fill from the palette
 *   #10 #22  cheap contact-shadow decal under each scan (1 draw, polygon offset, no shadow maps)
 *   #20 #21  transparent materials stop writing depth + sort after opaque; 3 cm lift so a scan's
 *            base never z-fights the basemap ground
 *   #47  anisotropic filtering (≤4) on scan textures
 * Lights live in the scan's local glTF frame (x east, y up, -z north before the pose heading),
 * because the custom layer renders with an identity view matrix (MVP in projectionMatrix).
 */

const SUN = "ndu-sun";
const SKY = "ndu-sky";
const LIFT_M = 0.03;
let maxAniso = 1;
const synced = new WeakMap<THREE.Object3D, { v: number; rot: number }>();
let shadowTex: THREE.Texture | null = null;

export function applyRendererLook(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = getRealism().pal.exposure;
  maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
}

/** Fix materials of a freshly loaded scan model (call after it is re-centred). */
export function prepareModel(model: THREE.Object3D) {
  model.position.y += LIFT_M;
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.transparent || m.opacity < 1) {
        m.transparent = true;
        m.depthWrite = false; // #20: no depth from see-through parts → no flicker against buildings
        mesh.renderOrder = 2;
      }
      for (const tex of [m.map, m.emissiveMap, m.normalMap, m.roughnessMap]) if (tex) tex.anisotropy = maxAniso;
    }
  });
}

function contactShadow(size: number) {
  if (!shadowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, "rgba(0,0,0,0.55)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    shadowTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  quad.rotation.x = -Math.PI / 2;
  quad.position.y = 0.01;
  quad.renderOrder = 1;
  quad.name = "ndu-contact-shadow";
  return quad;
}

/** Lights + contact shadow for one scan scene. `dims` = model size in metres [x, y, z]. */
export function rigScene(scene: THREE.Scene, dims?: [number, number, number]) {
  const sky = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.6);
  sky.name = SKY;
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.name = SUN;
  scene.add(sky, sun);
  if (dims && renderSettings().contactShadows) scene.add(contactShadow(Math.max(dims[0], dims[2], 0.5) * 1.5));
}

const Y = new THREE.Vector3(0, 1, 0);

/** Point the scan's lights at the shared sun; cheap no-op unless the sun or the heading changed. */
export function syncScanLook(scene: THREE.Object3D, rotationDeg: number, renderer?: THREE.WebGLRenderer | null) {
  const st = getRealism();
  const seen = synced.get(scene);
  if (renderer) renderer.toneMappingExposure = st.pal.exposure;
  if (seen && seen.v === st.version && seen.rot === rotationDeg) return;
  synced.set(scene, { v: st.version, rot: rotationDeg });
  const v = sunVector(st.sun);
  const sun = scene.getObjectByName(SUN) as THREE.DirectionalLight | undefined;
  const sky = scene.getObjectByName(SKY) as THREE.HemisphereLight | undefined;
  if (sun) {
    sun.position.set(v.east, v.up, -v.north).applyAxisAngle(Y, (rotationDeg * Math.PI) / 180).multiplyScalar(100);
    sun.color.set(st.pal.light);
    sun.intensity = st.pal.sunIntensity;
  }
  if (sky) {
    sky.color.set(st.pal.hemiSky);
    sky.groundColor.set(st.pal.hemiGround);
    sky.intensity = st.pal.hemiIntensity;
  }
}
