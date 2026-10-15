import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  DRAWN_FORMATS,
  scanAuthHeaders,
  scanFileUrl,
  type ScanFormat,
  type ScanPose,
} from "@/world/scans";
import { applyRendererLook, prepareModel, rigScene, syncScanLook } from "@/world/realism/scanLook"; // NDU-UPG 2 3 5 20
import { longestEdgeBearing, snap } from "@/world/placement/snap"; // NDU-UPG placement
import { groundHandle } from "@/world/ground/hooks"; // NDU realism 02 (no-op without the ground flag)
import { footprintCorners, scanBase } from "@/world/ground/pose";
import type { AltMode } from "@/world/ground/types";

/**
 * Imported scans on the 3D map. glb/gltf are drawn by three.js inside a MapLibre custom
 * layer that shares the map's WebGL context and depth buffer, so a scan sits among the
 * extruded OSM buildings in the same metres (glTF units are metres; `scale` multiplies).
 * Other formats are kept on the server and shown as a labelled pin.
 */

type LngLat = { lng: number; lat: number };

/** The MapLibre module (pinned npm dependency), handed in by the map that already loaded it. */
export type ScanLibre = typeof import("maplibre-gl");
type ScanMarker = import("maplibre-gl").Marker;
export type ScanHostMap = import("maplibre-gl").Map;

/**
 * Self-hosted Draco decoders (copied from three/examples/jsm/libs/draco into public/decoders/draco),
 * so compressed scans never depend on a third-party CDN.
 */
export const DRACO_DECODER_PATH = "/decoders/draco/";

export type ScanItem = { id: string; name: string; format: ScanFormat; pose: ScanPose };

export type ScanMap = {
  /** Draw the owner's placed scans (replaces the previous set). */
  show: (items: ScanItem[]) => void;
  /** Start placing one scan: it follows taps, pin drags and `adjust`; `onMove` reports the spot. */
  place: (
    item: ScanItem,
    onMove: (pose: ScanPose) => void,
    onSize: (meters: [number, number, number] | null) => void,
  ) => void;
  adjust: (pose: ScanPose) => void;
  /** End placing (the saved set is redrawn by the next `show`). */
  finish: () => void;
  /**
   * A map tap: consumed (true) while placing. With a building `footprint` (NDU-8), the scan snaps to
   * the footprint's centre — the coarse building-level anchor — and the footprint is outlined.
   * NDU-UPG placement: yaw aligns to that footprint's longest edge when the bearing exists.
   */
  tap: (at: LngLat, footprint?: GeoJSON.Geometry | null) => boolean;
  /** True while a scan is being placed (taps on buildings snap the scan to them). */
  isPlacing: () => boolean;
  center: () => LngLat;
  focus: (pose: ScanPose) => void;
  remove: () => void;
};

const LAYER_ID = "ndu-scans";
const PICK_SOURCE = "ndu-scan-pick";

/** Outer ring of a polygon footprint, or null. Shared by the centre and the longest-edge yaw. */
function footprintRing(geometry: GeoJSON.Geometry | null | undefined) {
  if (!geometry) return null;
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates[0]?.[0]
        : null;
  return ring?.length ? ring : null;
}

/** Centre of a building footprint (outer ring vertex mean; tiles may clip big buildings, which is fine for a coarse anchor). */
export function footprintCentre(geometry: GeoJSON.Geometry | null | undefined): LngLat | null {
  const ring = footprintRing(geometry);
  if (!ring) return null;
  const pts =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of pts) {
    lng += x;
    lat += y;
  }
  return pts.length ? { lng: lng / pts.length, lat: lat / pts.length } : null;
}
const DRAFT = "__draft__";

type Shown = {
  item: ScanItem;
  scene: THREE.Scene | null;
  size: [number, number, number] | null;
  matrix: THREE.Matrix4;
  pin: ScanMarker | null;
  failed: boolean;
  /** NDU realism 02: plinth under a scan on a slope (created lazily, ground flag only) */
  plinth?: THREE.Mesh | null;
};

const PLINTH_GEO = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PLINTH_MAT = new THREE.MeshStandardMaterial({
  color: 0x2b2622,
  roughness: 0.95,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

function scanPin(text: string, sub: string, draft: boolean): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = `display:flex;flex-direction:column;align-items:center;pointer-events:${draft ? "auto" : "none"};cursor:${draft ? "grab" : "default"}`;
  const plate = document.createElement("div");
  plate.style.cssText =
    "background:#1a1511;color:#f6efe2;font:600 11px/1.25 sans-serif;padding:3px 7px;border-radius:6px;border:2px solid #7cc4d8;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;text-align:center";
  const title = document.createElement("div");
  title.textContent = text;
  const note = document.createElement("div");
  note.textContent = sub;
  note.style.cssText = "font-weight:400;font-size:10px;opacity:.8";
  plate.append(title, note);
  const stem = document.createElement("div");
  stem.style.cssText = "width:3px;height:16px;background:#1a1511";
  const foot = document.createElement("div");
  foot.style.cssText = `width:${draft ? 16 : 12}px;height:${draft ? 16 : 12}px;border-radius:999px;background:#7cc4d8;border:3px solid #1a1511;margin-top:-2px`;
  root.append(plate, stem, foot);
  return root;
}

export function mountScans(map: ScanHostMap, lib: ScanLibre): ScanMap {
  const shown = new Map<string, Shown>();
  const cache = new Map<
    string,
    Promise<{ scene: THREE.Scene; size: [number, number, number] } | null>
  >();
  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  let draft: { item: ScanItem; onMove: (pose: ScanPose) => void } | null = null;
  let sizeNote: ((meters: [number, number, number] | null) => void) | null = null;

  const matrixFor = (pose: ScanPose, baseZ = 0) => {
    const elev = baseZ || map.queryTerrainElevation?.([pose.lng, pose.lat]);
    const alt = typeof elev === "number" && Number.isFinite(elev) ? elev : 0;
    const at = lib.MercatorCoordinate.fromLngLat([pose.lng, pose.lat], alt);
    const s = at.meterInMercatorCoordinateUnits() * pose.scale;
    // glTF is Y-up metres; the map is Z-up mercator with Y pointing south. Heading turns clockwise.
    return new THREE.Matrix4()
      .makeTranslation(at.x, at.y, at.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY((-pose.rotation * Math.PI) / 180));
  };

  /** Load once per scan id; the model is re-centred so its footprint centre sits on the spot and its base on the ground. */
  const load = (id: string) => {
    let job = cache.get(id);
    if (!job) {
      loader.setRequestHeader(scanAuthHeaders());
      job = loader
        .loadAsync(scanFileUrl(id))
        .then((gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const mid = box.getCenter(new THREE.Vector3());
          const dims = box.getSize(new THREE.Vector3());
          model.position.set(-mid.x, -box.min.y, -mid.z);
          prepareModel(model); // NDU-UPG 20: transparent sort + no ground z-fight
          const scene = new THREE.Scene();
          rigScene(scene, [dims.x, dims.y, dims.z]); // NDU-UPG 5 9 10: real-sun lights + contact shadow
          const holder = new THREE.Group();
          holder.add(model);
          scene.add(holder);
          return { scene, size: [dims.x, dims.y, dims.z] as [number, number, number] };
        })
        .catch(() => null);
      cache.set(id, job);
    }
    return job;
  };

  const drawn = (format: ScanFormat) => DRAWN_FORMATS.includes(format);

  const pinFor = (entry: Shown, key: string) => {
    const isDraft = key === DRAFT;
    const needPin = isDraft || !drawn(entry.item.format) || entry.failed;
    if (!needPin) {
      entry.pin?.remove();
      entry.pin = null;
      return;
    }
    entry.pin?.remove();
    const sub = isDraft
      ? "Preview · not saved yet" // NDU-UPG placement
      : entry.failed
        ? "Could not draw this file"
        : `${entry.item.format.toUpperCase()} stored · not drawn yet`;
    const marker = new lib.Marker({
      element: scanPin(entry.item.name, sub, isDraft),
      anchor: "bottom",
      draggable: isDraft,
    })
      .setLngLat([entry.item.pose.lng, entry.item.pose.lat])
      .addTo(map);
    if (isDraft) {
      marker.on("drag", () => {
        const at = marker.getLngLat();
        moveDraft({ ...entry.item.pose, lng: at.lng, lat: at.lat }, false);
      });
    }
    entry.pin = marker;
  };

  const put = (key: string, item: ScanItem) => {
    const entry: Shown = shown.get(key) ?? {
      item,
      scene: null,
      size: null,
      matrix: matrixFor(item.pose),
      pin: null,
      failed: false,
    };
    const changedFile = entry.item.id !== item.id;
    entry.item = item;
    entry.matrix = matrixFor(item.pose);
    shown.set(key, entry);
    groundHandle()?.want({ lng: item.pose.lng, lat: item.pose.lat });
    if (changedFile || !entry.pin || key === DRAFT) pinFor(entry, key);
    else entry.pin.setLngLat([item.pose.lng, item.pose.lat]);
    if (drawn(item.format) && (!entry.scene || changedFile)) {
      void load(item.id).then((got) => {
        if (shown.get(key) !== entry || entry.item.id !== item.id) return;
        if (!got) {
          entry.failed = true;
          pinFor(entry, key);
        } else {
          // the same model can be drawn twice (saved + draft), so each spot gets its own copy
          entry.scene = key === DRAFT ? got.scene.clone() : got.scene;
          entry.size = got.size;
          if (key === DRAFT) sizeNote?.(got.size);
        }
        map.triggerRepaint();
      });
    }
    map.triggerRepaint();
  };

  const drop = (key: string) => {
    const entry = shown.get(key);
    if (!entry) return;
    entry.pin?.remove();
    shown.delete(key);
    map.triggerRepaint();
  };

  const moveDraft = (pose: ScanPose, movePin: boolean) => {
    if (!draft) return;
    draft.item = { ...draft.item, pose };
    const entry = shown.get(DRAFT);
    if (entry) {
      entry.item = draft.item;
      entry.matrix = matrixFor(pose);
      if (movePin) entry.pin?.setLngLat([pose.lng, pose.lat]);
    }
    draft.onMove(pose);
    map.triggerRepaint();
  };

  const EMPTY_PICK: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  let pickReady = false;
  try {
    map.addSource(PICK_SOURCE, { type: "geojson", data: EMPTY_PICK });
    map.addLayer({
      id: `${PICK_SOURCE}-fill`,
      type: "fill",
      source: PICK_SOURCE,
      paint: { "fill-color": "#7cc4d8", "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: `${PICK_SOURCE}-line`,
      type: "line",
      source: PICK_SOURCE,
      paint: { "line-color": "#7cc4d8", "line-width": 3 },
    });
    pickReady = true;
  } catch {
    // no highlight layer: snapping still works
  }
  const highlight = (geometry: GeoJSON.Geometry | null) => {
    if (!pickReady) return;
    const source = map.getSource<import("maplibre-gl").GeoJSONSource>(PICK_SOURCE);
    source?.setData(
      geometry
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] }
        : EMPTY_PICK,
    );
  };

  const layer: import("maplibre-gl").CustomLayerInterface = {
    id: LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd: (_map, gl) => {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      applyRendererLook(renderer); // NDU-UPG 2: sRGB + ACES
    },
    render: (_gl, args) => {
      if (!renderer) return;
      // MapLibre v5: `args.defaultProjectionData.mainMatrix` (Mercator). Older shapes kept as a fallback.
      const input = args as unknown as {
        defaultProjectionData?: { mainMatrix: ArrayLike<number> };
        modelViewProjectionMatrix?: ArrayLike<number>;
      };
      const raw = input.defaultProjectionData?.mainMatrix ?? input.modelViewProjectionMatrix;
      if (!raw) return;
      const view = new THREE.Matrix4().fromArray(Array.from(raw));
      const gh = groundHandle();
      const clamp = gh && gh.mode() === "terrain3d" ? gh : null;
      let easing = false;
      renderer.resetState();
      for (const [key, entry] of shown) {
        if (!entry.scene) continue;
        // the saved copy hides while its draft is being moved
        if (key !== DRAFT && draft && draft.item.id === entry.item.id) continue;
        let matrix = entry.matrix;
        if (clamp) {
          // NDU realism 02 T4: stand on the drawn ground (anchor + DEM deltas at the footprint corners)
          const pose = entry.item.pose as ScanPose & { altMode?: AltMode; alt?: number };
          const anchor = clamp.anchorAt(pose.lng, pose.lat);
          if (!anchor.ok) easing = true;
          const size = entry.size ?? [1, 1, 1];
          const corners = footprintCorners(pose.lng, pose.lat, size[0], size[2], pose.scale, pose.rotation);
          const zs = clamp.clusterZ(pose, corners.map(([lng, lat]) => ({ lng, lat })));
          const { base, plinth } = scanBase(Array.from(zs), anchor.h, pose.altMode ?? "ground", pose.alt ?? 0);
          matrix = matrixFor(pose, base);
          const ph = pose.scale > 0 ? plinth / pose.scale : 0;
          if (ph > 0.01) {
            if (!entry.plinth) {
              entry.plinth = new THREE.Mesh(PLINTH_GEO, PLINTH_MAT);
              entry.scene.add(entry.plinth);
            }
            entry.plinth.visible = true;
            entry.plinth.scale.set(size[0], ph, size[2]);
          } else if (entry.plinth) entry.plinth.visible = false;
          clamp.reportScan({ id: key, baseZ: base, targetZ: base, err: anchor.ok ? 0 : Math.abs(base) });
        } else if (entry.plinth) entry.plinth.visible = false;
        camera.projectionMatrix = view.clone().multiply(matrix);
        syncScanLook(entry.scene, entry.item.pose.rotation, renderer); // NDU-UPG 5 6
        renderer.render(entry.scene, camera);
      }
      renderer.resetState(); // NDU-UPG 3: hand MapLibre back a clean GL state
      if (easing) map.triggerRepaint(); // the drawn DEM tile is still landing: keep re-anchoring
    },
    onRemove: () => {
      renderer?.dispose();
      renderer = null;
    },
  };
  map.addLayer(layer);

  return {
    show: (items) => {
      const keep = new Set(items.map((i) => i.id));
      for (const key of [...shown.keys()]) if (key !== DRAFT && !keep.has(key)) drop(key);
      for (const item of items) put(item.id, item);
    },
    place: (item, onMove, onSize) => {
      drop(DRAFT);
      draft = { item, onMove };
      sizeNote = onSize;
      onSize(null);
      put(DRAFT, item);
      onMove(item.pose);
    },
    adjust: (pose) => moveDraft(pose, true),
    finish: () => {
      draft = null;
      sizeNote = null;
      drop(DRAFT);
      highlight(null);
    },
    tap: (at, footprint) => {
      if (!draft) return false;
      const centre = footprintCentre(footprint);
      highlight(centre && footprint ? footprint : null);
      if (!centre) {
        moveDraft({ ...draft.item.pose, lng: at.lng, lat: at.lat }, true);
        return true;
      }
      // NDU-UPG placement: centre from footprintCentre; yaw from the longest edge (else unchanged).
      const bearing = longestEdgeBearing(footprintRing(footprint));
      moveDraft(snap(centre, bearing, draft.item.pose), true);
      return true;
    },
    isPlacing: () => draft !== null,
    center: () => map.getCenter(),
    focus: (pose) => map.easeTo({ center: [pose.lng, pose.lat], zoom: 18.6, duration: 700 }),
    remove: () => {
      for (const key of [...shown.keys()]) drop(key);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      for (const id of [`${PICK_SOURCE}-line`, `${PICK_SOURCE}-fill`])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(PICK_SOURCE)) map.removeSource(PICK_SOURCE);
      draco.dispose();
    },
  };
}
