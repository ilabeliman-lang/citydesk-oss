import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { insidePoly, type Poly, type Shape } from "@/world/empty-state/footprint";
import type { ItemKind, OwnerOverride } from "@/world/empty-state/ownerOverrides";

/**
 * Isometric empty-state renderer. Draws the tapped building as an empty shell — the real footprint
 * extruded from min_height to height, a slab per floor, nothing inside — under an orthographic
 * camera turned to the map's bearing, so it reads exactly like the block on the 3D map. Small
 * things get a plinth with an empty slot. An owner override recolours it and adds their items/GLB.
 * Renders on demand (entry animation, drags), never a forever loop on a building.
 */

export type IsoHandle = {
  setYaw: (deg: number) => void;
  /** NDU-UPG drag360: orbit — yaw like the map bearing, pitch like the map pitch (0 = straight down). */
  setView: (yawDeg: number, pitchDeg: number) => void;
  resize: () => void;
  dispose: () => void;
};

const ISO_ELEV = Math.atan(1 / Math.SQRT2); // true isometric: 35.26°
/** NDU-UPG drag360: the same default as a map pitch (90° − 35.26° ≈ 54.7°) and the drag limits. */
export const ISO_PITCH = 90 - (ISO_ELEV * 180) / Math.PI;
export const ISO_PITCH_MIN = 2; // ~top-down (exactly 0 would make lookAt degenerate with up = +Y)
export const ISO_PITCH_MAX = 80; // near street level
const INK = 0x1a1511;
const CREAM = 0xf6efe2;
const ACCENT = 0xe8843a;

function toShapes(polys: Poly[]): THREE.Shape[] {
  const clean = (ring: [number, number][]) => {
    const pts = ring.map(([x, y]) => new THREE.Vector2(x, y));
    if (pts.length > 2 && pts[0].equals(pts[pts.length - 1])) pts.pop();
    return pts;
  };
  return polys.map((poly) => {
    const shape = new THREE.Shape(clean(poly[0]));
    for (const hole of poly.slice(1)) shape.holes.push(new THREE.Path(clean(hole)));
    return shape;
  });
}

function itemMesh(kind: ItemKind, color: THREE.ColorRepresentation): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, y = h / 2, x = 0, z = 0, m = mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  if (kind === "counter") box(2.2, 1, 0.7);
  else if (kind === "table") box(1.2, 0.75, 0.8);
  else if (kind === "chairs") {
    box(0.45, 0.45, 0.45, 0.225, -0.5);
    box(0.45, 0.45, 0.45, 0.225, 0.5);
  } else if (kind === "bed") box(2, 0.5, 1.4);
  else if (kind === "shelf") box(1.1, 1.9, 0.4);
  else {
    box(0.5, 0.5, 0.5, 0.25, 0, 0, new THREE.MeshStandardMaterial({ color: 0x8a5a3b }));
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2f6f5e }));
    leaf.position.y = 1.0;
    g.add(leaf);
  }
  return g;
}

/** Spread items over the ground floor on a grid, keeping only spots inside the footprint. */
function itemSpots(polys: Poly[], count: number): [number, number][] {
  if (!count) return [];
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const poly of polys)
    for (const [x, y] of poly[0]) {
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  const spots: [number, number][] = [];
  for (let n = 4; n <= 24 && spots.length < count; n += 2) {
    spots.length = 0;
    for (let i = 1; i < n && spots.length < count; i += 1)
      for (let j = 1; j < n && spots.length < count; j += 1) {
        const x = xMin + ((xMax - xMin) * i) / n;
        const y = yMin + ((yMax - yMin) * j) / n;
        if (polys.some((poly) => insidePoly(poly, x, y))) spots.push([x, y]);
      }
  }
  return spots;
}

export function mountIso(
  canvas: HTMLCanvasElement,
  shape: Shape,
  owner: OwnerOverride | null,
  opts: { animate: boolean },
): IsoHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x3a3027, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const root = new THREE.Group(); // everything on the plot
  const body = new THREE.Group(); // the part that rises in the entry animation
  root.add(body);
  scene.add(root);
  const floors: THREE.Object3D[] = [];
  let spinner: THREE.Object3D | null = null;
  let groundY = 0;
  let footW = 3;
  let footD = 3;

  if (shape.type === "building") {
    const shapes = toShapes(shape.polys);
    const levels = Math.max(1, owner?.levels ?? shape.levels);
    const floorH = owner?.levels ? 3 : Math.max(2.2, (shape.maxH - shape.minH) / levels);
    const height = owner?.levels ? levels * floorH : Math.max(1, shape.maxH - shape.minH);
    groundY = shape.minH;
    footW = shape.size.w;
    footD = shape.size.d;

    const shell = new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false });
    shell.rotateX(-Math.PI / 2); // extrude up (+y); local north (+y) → three's −z
    const wallColor = owner?.wall ?? shape.color ?? CREAM;
    const walls = new THREE.Mesh(
      shell,
      new THREE.MeshStandardMaterial({
        color: wallColor,
        transparent: true,
        opacity: owner ? 0.5 : 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    walls.renderOrder = 2;
    body.add(walls);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell, 20), new THREE.LineBasicMaterial({ color: INK }));
    edges.renderOrder = 3;
    body.add(edges);

    // A slab and outline at every floor: the "empty" building is its floors and nothing else.
    const slab = new THREE.ShapeGeometry(shapes);
    slab.rotateX(-Math.PI / 2);
    const outline = new THREE.EdgesGeometry(slab, 1);
    const step = Math.max(1, Math.ceil(levels / 40));
    for (let k = 0; k <= levels; k += step) {
      const isGround = k === 0;
      const isRoof = k >= levels;
      const floor = new THREE.Group();
      floor.position.y = Math.min(height, k * floorH) + 0.02;
      const fill = new THREE.Mesh(
        slab,
        new THREE.MeshStandardMaterial({
          color: isRoof ? (owner?.roof ?? INK) : isGround ? CREAM : ACCENT,
          transparent: true,
          opacity: isRoof ? (owner ? 0.55 : 0.22) : isGround ? 0.55 : 0.12,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      fill.renderOrder = 1;
      floor.add(fill);
      floor.add(new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: isGround ? INK : ACCENT, transparent: true, opacity: isGround ? 1 : 0.8 })));
      body.add(floor);
      floors.push(floor);
      if (isRoof) break;
      if (k + step > levels && k !== levels) {
        k = levels - step; // always finish on the roof
      }
    }

    if (owner?.items.length) {
      itemSpots(shape.polys, owner.items.length).forEach(([x, y], i) => {
        const item = itemMesh(owner.items[i], owner.wall && owner.wall !== "#f6efe2" ? owner.wall : ACCENT);
        item.position.set(x, 0.05, -y);
        item.rotation.y = (i % 2) * (Math.PI / 2);
        body.add(item);
      });
    }
    body.position.y = groundY;
  } else {
    // Object: a plinth with an empty slot (or the owner's thing on it).
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.45, 40),
      new THREE.MeshStandardMaterial({ color: owner?.roof ?? CREAM, roughness: 0.6 }),
    );
    plinth.position.y = 0.225;
    root.add(plinth);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 8, 48), new THREE.MeshStandardMaterial({ color: ACCENT }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.46;
    root.add(rim);
    if (owner && (owner.items.length || owner.wall)) {
      const thing = owner.items.length ? itemMesh(owner.items[0], owner.wall ?? ACCENT) : new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: owner.wall ?? ACCENT }));
      thing.position.y = owner.items.length ? 0.46 : 1.06;
      body.add(thing);
    } else {
      const ghost = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.5, 1.5)),
        new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.18, gapSize: 0.12 }),
      );
      ghost.computeLineDistances();
      ghost.position.y = 1.35;
      body.add(ghost);
      spinner = ghost;
    }
  }

  // Ground plate under the plot, a little larger than the footprint, with a metre grid.
  const pad = shape.type === "building" ? 4 : 1.2;
  const span = Math.max(footW, footD) + pad * 2;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(footW + pad * 2, 0.4, footD + pad * 2),
    new THREE.MeshStandardMaterial({ color: 0x3a3027, roughness: 1 }),
  );
  plate.position.y = -0.2;
  root.add(plate);
  const grid = new THREE.GridHelper(span, Math.min(60, Math.max(4, Math.round(span / 2))), 0x6b5a48, 0x4a3d31);
  grid.position.y = 0.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  root.add(grid);
  if (shape.type === "building" && groundY > 0) {
    // Raised part (min_height): faint posts down to the ground so it doesn't look like it floats.
    const posts = new THREE.Group();
    for (const poly of shape.polys)
      for (const [x, y] of poly[0].slice(0, 12)) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, groundY, 6), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.4 }));
        post.position.set(x, groundY / 2, -y);
        posts.add(post);
      }
    root.add(posts);
  }

  // Frame the whole plot under an orthographic, isometric camera.
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, sphere.radius * 20 + 100);
  let yaw = shape.bearing;
  let elev = ISO_ELEV; // NDU-UPG drag360: vertical drag tilts

  const place = () => {
    const b = (yaw * Math.PI) / 180;
    const dist = sphere.radius * 6 + 20;
    camera.position.set(
      sphere.center.x - Math.sin(b) * Math.cos(elev) * dist,
      sphere.center.y + Math.sin(elev) * dist,
      sphere.center.z + Math.cos(b) * Math.cos(elev) * dist,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(sphere.center);
  };
  const resize = () => {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 200;
    renderer.setSize(w, h, false);
    const half = sphere.radius * (shape.type === "building" ? 0.9 : 1.2);
    const aspect = w / h;
    camera.left = -half * Math.max(1, aspect);
    camera.right = half * Math.max(1, aspect);
    camera.top = half / Math.min(1, aspect);
    camera.bottom = -half / Math.min(1, aspect);
    camera.updateProjectionMatrix();
  };

  let frame = 0;
  let alive = true;
  const draw = () => renderer.render(scene, camera);
  place();
  resize();

  // Owner GLB (kept on this phone): loaded async, fitted to the footprint, drawn inside the shell.
  if (owner?.glb) {
    new GLTFLoader().load(
      owner.glb,
      (gltf) => {
        if (!alive) return;
        const model = gltf.scene;
        const mb = new THREE.Box3().setFromObject(model);
        const size = mb.getSize(new THREE.Vector3());
        const fit = shape.type === "building" ? Math.min(footW, footD) * 0.7 : 1.6;
        const s = fit / Math.max(0.001, size.x, size.z);
        model.scale.setScalar(s);
        const nb = new THREE.Box3().setFromObject(model);
        const c = nb.getCenter(new THREE.Vector3());
        model.position.set(-c.x, (shape.type === "building" ? 0.05 : 0.46) - nb.min.y, -c.z);
        body.add(model);
        draw();
      },
      undefined,
      () => undefined, // bad GLB: the shell still shows
    );
  }

  const start = performance.now();
  const DURATION = 900;
  const easeBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
  const tick = (now: number) => {
    if (!alive) return;
    const t = Math.min(1, (now - start) / DURATION);
    if (opts.animate && t < 1) {
      body.scale.y = Math.max(0.001, easeBack(t));
      floors.forEach((floor, i) => {
        floor.visible = t >= i / Math.max(1, floors.length);
      });
    } else {
      body.scale.y = 1;
      floors.forEach((floor) => (floor.visible = true));
    }
    if (spinner && opts.animate) {
      spinner.rotation.y = now / 2400;
      spinner.position.y = 1.35 + Math.sin(now / 600) * 0.08;
    }
    draw();
    if ((opts.animate && t < 1) || (spinner && opts.animate)) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    setYaw(deg: number) {
      yaw = deg;
      place();
      draw();
    },
    setView(yawDeg: number, pitchDeg: number) {
      yaw = yawDeg;
      const p = Math.min(ISO_PITCH_MAX, Math.max(ISO_PITCH_MIN, pitchDeg));
      elev = ((90 - p) * Math.PI) / 180;
      place();
      draw();
    },
    resize() {
      resize();
      draw();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(frame);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
