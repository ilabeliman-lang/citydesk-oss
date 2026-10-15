import * as THREE from "three";
import { BLOCK, MAX_BLOCKS, kick, newBody, restY, snapTo, step, type Body } from "./blocks";
import { drawCartoon } from "./cartoon";
import type { KidsSfx } from "./sound";

/**
 * NDU-UPG kids: the low-poly living room (three.js, lazy-loaded with the Kids room only).
 * Everything is built from primitives in code: no models, no textures from outside, no faces beyond
 * cartoon dot eyes. Tier A gets antialiasing, shadows and a sharper canvas; Tier B a lighter render.
 */
export type KidsPick = "kitchen" | "blocks" | "ball" | "color" | "tv" | "kid" | "parent";
export type Meal = "soup" | "pancakes" | "rice";
export type SceneOpts = {
  tier: "A" | "B";
  reducedMotion: boolean;
  padCanvas: HTMLCanvasElement;
  onPick: (pick: KidsPick) => void;
  onSfx: (fx: KidsSfx) => void;
  /** WebGL context lost (GPU reset or memory pressure): the room swaps to the flat Tier C view. */
  onLost?: () => void;
};
export type KidsScene = {
  /** Walk the kid to a toy and frame the camera on it; sheet = a bottom sheet is covering the lower screen. */
  focus: (pick: KidsPick | null, sheet?: boolean) => void;
  cook: (step: number, meal: Meal) => void;
  addBlock: () => number;
  tumble: () => void;
  rollBall: () => void;
  padChanged: () => void;
  together: (kind: "wave" | "hug") => void;
  bedtime: (on: boolean) => void;
  dispose: () => void;
};

const MEAL_COLOR: Record<Meal, number> = { soup: 0xf28c38, pancakes: 0xe8b04f, rice: 0xf4efe2 };
const BLOCK_COLORS = [0xf25f5c, 0xffb84d, 0xffe066, 0x7bd389, 0x4fb3e8, 0x9b7be8];
const SKIN_KID = 0xc98b5b;
const SKIN_DAD = 0xb57a4e;

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0,
    flatShading: true,
    ...extra,
  });

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d") as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Person = { root: THREE.Group; armL: THREE.Group; armR: THREE.Group; head: THREE.Group };

/** A cartoon person built from primitives. Seated pose (legs forward). */
function person(o: {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  pigtails: boolean;
  scale: number;
}): Person {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.36, 10), mat(o.shirt));
  body.position.y = 0.24;
  root.add(body);
  for (const sx of [-0.075, 0.075]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 8), mat(o.pants));
    leg.rotation.x = Math.PI / 2;
    leg.position.set(sx, 0.06, 0.14);
    root.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xffffff));
    shoe.position.set(sx, 0.06, 0.3);
    root.add(shoe);
  }
  const head = new THREE.Group();
  head.position.y = 0.56;
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    mat(o.skin, { flatShading: false }),
  );
  head.add(skull);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(o.hair),
  );
  hair.rotation.x = -0.35;
  head.add(hair);
  if (o.pigtails) {
    for (const sx of [-0.17, 0.17]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(o.hair));
      puff.position.set(sx, 0.04, -0.03);
      head.add(puff);
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), mat(0xffd84a));
      bow.position.set(sx * 0.82, 0.09, 0.02);
      head.add(bow);
    }
  }
  const dark = new THREE.MeshBasicMaterial({ color: 0x2b2118 });
  for (const sx of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), dark);
    eye.position.set(sx, 0.02, 0.15);
    head.add(eye);
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: 0.6 }),
    );
    cheek.position.set(sx * 1.6, -0.03, 0.135);
    head.add(cheek);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 12, Math.PI), dark);
  smile.position.set(0, -0.035, 0.152);
  smile.rotation.z = Math.PI;
  head.add(smile);
  root.add(head);
  const arm = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx, 0.38, 0);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), mat(o.shirt));
    a.position.y = -0.12;
    g.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(o.skin));
    hand.position.y = -0.26;
    g.add(hand);
    g.rotation.z = sx > 0 ? 0.25 : -0.25;
    root.add(g);
    return g;
  };
  const armL = arm(-0.15);
  const armR = arm(0.15);
  root.scale.setScalar(o.scale);
  return { root, armL, armR, head };
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.5, -0.5, 0.5, -0.5, 0.15);
  s.bezierCurveTo(-0.5, -0.1, -0.2, -0.25, 0, -0.45);
  s.bezierCurveTo(0.2, -0.25, 0.5, -0.1, 0.5, 0.15);
  s.bezierCurveTo(0.5, 0.5, 0, 0.5, 0, 0.25);
  return new THREE.ShapeGeometry(s);
}

type Tween = { t: number; dur: number; fn: (k: number) => void; done?: () => void };
type Puff = { mesh: THREE.Mesh; life: number; vy: number; drift: number };

export function createKidsScene(canvas: HTMLCanvasElement, opts: SceneOpts): KidsScene {
  const A = opts.tier === "A";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: A,
    alpha: false,
    powerPreference: A ? "high-performance" : "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, A ? 2 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = A;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6e7cf);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  const HOME_TARGET = new THREE.Vector3(0.05, 0.45, 0.05);
  const target = HOME_TARGET.clone();
  const goalTarget = HOME_TARGET.clone();
  let yaw = 0.6;
  let pitch = 0.6;
  let yawGoal: number | null = null;
  let zoom = 1;
  let goalZoom = 1;
  let shift = 0;
  let goalShift = 0;
  // camera framing per toy: [target, yaw, zoom]; a sheet is open for these, so the view shifts up
  const FRAMES: Record<string, [THREE.Vector3, number, number]> = {
    kitchen: [new THREE.Vector3(-1.75, 0.6, 0.35), 1.05, 0.55],
    blocks: [new THREE.Vector3(0.6, 0.45, 0.85), 0.55, 0.62],
    ball: [new THREE.Vector3(-0.1, 0.35, 0.8), 0.6, 0.8],
    color: [new THREE.Vector3(-0.6, 0.3, 0.6), 0.75, 0.6],
  };

  // lights
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a6a50, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
  sun.position.set(3, 5.5, 4);
  if (A) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -4;
    c.right = 4;
    c.top = 4;
    c.bottom = -4;
  }
  scene.add(sun);
  const lampLight = new THREE.PointLight(0xffb866, 0, 6, 1.5);
  lampLight.position.set(2.15, 1.55, -1.85);
  scene.add(lampLight);

  // room shell
  const floorTex = canvasTex(256, 256, (ctx) => {
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? "#c99a6b" : "#c2915f";
      ctx.fillRect(0, i * 32, 256, 32);
      ctx.fillStyle = "rgba(90,60,30,0.25)";
      ctx.fillRect(0, i * 32, 256, 2);
      ctx.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(2, 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 5.2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.9),
    mat(0xf3e3c9, { flatShading: false }),
  );
  backWall.position.set(0, 1.45, -2.5);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 2.9),
    mat(0xeed3b0, { flatShading: false }),
  );
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-2.7, 1.45, 0.1);
  leftWall.receiveShadow = true;
  scene.add(leftWall);
  scene.add(box(5.4, 0.12, 0.04, 0xffffff, 0, 0.06, -2.48));
  // window with sky (left wall)
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x9fd8f5 });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), windowMat);
  pane.rotation.y = Math.PI / 2;
  pane.position.set(-2.68, 1.55, -0.9);
  scene.add(pane);
  scene.add(box(0.05, 0.06, 1.2, 0xffffff, -2.66, 2.0, -0.9));
  scene.add(box(0.05, 0.06, 1.2, 0xffffff, -2.66, 1.1, -0.9));
  scene.add(box(0.05, 0.95, 0.06, 0xffffff, -2.66, 1.55, -1.48));
  scene.add(box(0.05, 0.95, 0.06, 0xffffff, -2.66, 1.55, -0.32));
  scene.add(box(0.05, 0.95, 0.04, 0xffffff, -2.66, 1.55, -0.9));
  const stars = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xfff6d0 }),
    );
    s.position.set(-2.665, 1.2 + ((i * 37) % 70) / 100, -1.4 + ((i * 53) % 100) / 100);
    stars.add(s);
  }
  stars.visible = false;
  scene.add(stars);
  // curtains
  scene.add(box(0.06, 1.2, 0.22, 0xe57f6a, -2.62, 1.5, -1.62));
  scene.add(box(0.06, 1.2, 0.22, 0xe57f6a, -2.62, 1.5, -0.18));
  // small wooden cross plaque (tasteful, family home)
  scene.add(box(0.05, 0.34, 0.03, 0x8a5a34, -1.95, 1.95, -2.47));
  scene.add(box(0.22, 0.05, 0.03, 0x8a5a34, -1.95, 2.02, -2.47));

  // rug
  const rugTex = canvasTex(256, 256, (ctx) => {
    const cols = ["#f7c6b8", "#fbe3a8", "#bfe3d0", "#c9d7f2", "#f7c6b8"];
    cols.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(128, 128, 128 - i * 24, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 40),
    new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.1, 0.006, 0.45);
  rug.scale.set(1.1, 0.85, 1);
  rug.receiveShadow = true;
  scene.add(rug);

  // sofa
  const sofa = new THREE.Group();
  sofa.add(box(2.0, 0.36, 0.85, 0xc96f4a, 0, 0.2, 0));
  sofa.add(box(0.95, 0.12, 0.7, 0xdb8461, -0.49, 0.44, 0.05));
  sofa.add(box(0.95, 0.12, 0.7, 0xdb8461, 0.49, 0.44, 0.05));
  sofa.add(box(2.0, 0.62, 0.22, 0xc96f4a, 0, 0.6, -0.33));
  sofa.add(box(0.2, 0.5, 0.85, 0xb9603e, -1.05, 0.33, 0));
  sofa.add(box(0.2, 0.5, 0.85, 0xb9603e, 1.05, 0.33, 0));
  const pillow = box(0.36, 0.3, 0.12, 0xfbe3a8, -0.6, 0.62, -0.15);
  pillow.rotation.z = 0.2;
  sofa.add(pillow);
  sofa.position.set(-1.05, 0, -1.9);
  scene.add(sofa);

  // TV + stand
  const tvCanvas = document.createElement("canvas");
  tvCanvas.width = A ? 320 : 224;
  tvCanvas.height = A ? 180 : 126;
  const tvCtx = tvCanvas.getContext("2d") as CanvasRenderingContext2D;
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  tvTex.colorSpace = THREE.SRGBColorSpace;
  const tv = new THREE.Group();
  tv.add(box(1.5, 0.88, 0.07, 0x1d1a18, 0, 0, 0));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.38, 0.77),
    new THREE.MeshBasicMaterial({ map: tvTex }),
  );
  screen.position.z = 0.04;
  tv.add(screen);
  tv.position.set(1.0, 1.32, -2.44);
  tv.userData.pick = "tv";
  scene.add(tv);
  scene.add(box(1.8, 0.42, 0.42, 0x8a5a34, 1.0, 0.21, -2.25));
  scene.add(box(0.5, 0.2, 0.02, 0x6f4526, 0.6, 0.24, -2.035));
  scene.add(box(0.5, 0.2, 0.02, 0x6f4526, 1.4, 0.24, -2.035));

  // floor lamp
  scene.add(box(0.05, 1.5, 0.05, 0x3a2e26, 2.15, 0.75, -1.85));
  const shadeMat = mat(0xfbe3a8, { emissive: 0xffb866, emissiveIntensity: 0 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.3, 12, 1, true), shadeMat);
  shade.position.set(2.15, 1.6, -1.85);
  scene.add(shade);
  scene.add(box(0.36, 0.04, 0.36, 0x3a2e26, 2.15, 0.02, -1.85));

  // ottoman + laptop + snacks
  const ott = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.38, 16), mat(0xe8b65a));
  ott.position.set(1.75, 0.19, -0.55);
  scene.add(ott);
  const laptop = new THREE.Group();
  laptop.add(box(0.36, 0.02, 0.25, 0xb8c0c8, 0, 0, 0));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.015), mat(0xb8c0c8));
  lid.position.set(0, 0.11, -0.12);
  lid.rotation.x = -0.25;
  laptop.add(lid);
  const lscreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x9fd3ff }),
  );
  lscreen.position.set(0, 0.11, -0.11);
  lscreen.rotation.x = -0.25;
  laptop.add(lscreen);
  laptop.position.set(1.75, 0.4, -0.55);
  laptop.rotation.y = -0.5;
  scene.add(laptop);
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    mat(0x7bb6e8, { side: THREE.DoubleSide }),
  );
  bowl.position.set(1.1, 0.14, 0.25);
  scene.add(bowl);
  [0xf25f5c, 0xffb84d, 0x7bd389, 0x9b7be8, 0xffb84d].forEach((c, i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(c));
    s.position.set(1.1 + Math.cos(i * 1.3) * 0.06, 0.13, 0.25 + Math.sin(i * 1.3) * 0.06);
    scene.add(s);
  });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.12, 10), mat(0xf49ac1));
  cup.position.set(1.32, 0.06, 0.38);
  scene.add(cup);

  // toy kitchen (left wall, facing +x)
  const kitchen = new THREE.Group();
  kitchen.add(box(0.45, 0.72, 1.05, 0x9ee0c9, 0, 0.36, 0));
  kitchen.add(box(0.47, 0.04, 1.07, 0xffffff, 0, 0.74, 0));
  kitchen.add(box(0.06, 0.5, 1.05, 0x9ee0c9, -0.2, 1.0, 0));
  kitchen.add(box(0.02, 0.3, 0.36, 0xffffff, 0.23, 0.36, -0.25)); // oven door
  const knobs = [-0.1, 0.05, 0.2];
  for (const z of knobs) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0xf25f5c));
    k.position.set(-0.15, 0.95, z);
    kitchen.add(k);
  }
  const burnerMat = mat(0x2b2118, { emissive: 0xff6a00, emissiveIntensity: 0 });
  const burners: THREE.Mesh[] = [];
  for (const z of [-0.25, 0.05]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), burnerMat);
    b.position.set(0.02, 0.77, z);
    kitchen.add(b);
    burners.push(b);
  }
  const sink = box(0.3, 0.02, 0.3, 0x7bb6e8, 0.02, 0.765, 0.33);
  kitchen.add(sink);
  const pot = new THREE.Group();
  pot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.12, 16), mat(0xe85d5d)));
  const food = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.01, 16),
    mat(MEAL_COLOR.soup),
  );
  food.position.y = 0.04;
  food.visible = false;
  pot.add(food);
  const spoon = box(0.02, 0.24, 0.02, 0xa0704a, 0.03, 0.1, 0);
  spoon.rotation.z = 0.3;
  spoon.visible = false;
  pot.add(spoon);
  const potHome = new THREE.Vector3(0.02, 0.8, 0.33);
  const potStove = new THREE.Vector3(0.02, 0.84, -0.25);
  pot.position.copy(potHome);
  kitchen.add(pot);
  const veggies: THREE.Mesh[] = [0x7bd389, 0xf25f5c, 0xffb84d].map((c) => {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(c));
    v.visible = false;
    kitchen.add(v);
    return v;
  });
  kitchen.position.set(-2.4, 0, 0.35);
  kitchen.userData.pick = "kitchen";
  scene.add(kitchen);

  // coloring pad on the rug
  const padTex = new THREE.CanvasTexture(opts.padCanvas);
  padTex.colorSpace = THREE.SRGBColorSpace;
  const pad = new THREE.Group();
  pad.add(box(0.5, 0.02, 0.5, 0xffffff, 0, 0.01, 0));
  const padTop = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshStandardMaterial({ map: padTex, roughness: 1 }),
  );
  padTop.rotation.x = -Math.PI / 2;
  padTop.position.y = 0.022;
  pad.add(padTop);
  [0xf25f5c, 0x4fb3e8, 0x7bd389].forEach((c, i) => {
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), mat(c));
    cr.rotation.z = Math.PI / 2;
    cr.position.set(0.05 * i - 0.05, 0.015, 0.32);
    pad.add(cr);
  });
  pad.position.set(-0.75, 0, 0.75);
  pad.rotation.y = 0.3;
  pad.userData.pick = "color";
  scene.add(pad);

  // blocks
  const blockHome = new THREE.Vector3(0.75, 0, 1.0);
  const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
  const blockArea = new THREE.Group();
  blockArea.userData.pick = "blocks";
  scene.add(blockArea);
  // a little toy bin so the area is tappable before any block is placed
  const bin = box(0.36, 0.16, 0.26, 0xffb84d, blockHome.x + 0.42, 0.08, blockHome.z - 0.05);
  blockArea.add(bin);
  for (let i = 0; i < 3; i += 1) {
    const b = new THREE.Mesh(blockGeo, mat(BLOCK_COLORS[i + 2]));
    b.scale.setScalar(0.7);
    b.position.set(blockHome.x + 0.32 + i * 0.1, 0.19, blockHome.z - 0.05);
    blockArea.add(b);
  }
  type Block = { mesh: THREE.Mesh; body: Body; floorY: number; tx: number; tz: number };
  let blocks: Block[] = [];
  let tumbled = false;

  // ball
  const ballTex = canvasTex(128, 64, (ctx) => {
    const cols = ["#f25f5c", "#ffffff", "#4fb3e8", "#ffffff", "#ffe066", "#ffffff"];
    cols.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect((i * 128) / cols.length, 0, 128 / cols.length + 1, 64);
    });
  });
  const BALL_R = 0.13;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 14),
    new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }),
  );
  ball.position.set(-0.1, BALL_R, 1.35);
  ball.userData.pick = "ball";
  scene.add(ball);
  const ballVel = new THREE.Vector2(0, 0);
  let ballReturn = 0;

  // people
  const kid = person({
    shirt: 0xff8fab,
    pants: 0x6b8fd6,
    skin: SKIN_KID,
    hair: 0x2e1d12,
    pigtails: true,
    scale: 1,
  });
  kid.root.userData.pick = "kid";
  const kidHome = new THREE.Vector3(0.05, 0, 0.45);
  kid.root.position.copy(kidHome);
  kid.root.rotation.y = 0.55;
  scene.add(kid.root);
  const dad = person({
    shirt: 0x4a7fc1,
    pants: 0x3a3f4a,
    skin: SKIN_DAD,
    hair: 0x1f150e,
    pigtails: false,
    scale: 1.55,
  });
  dad.root.userData.pick = "parent";
  const dadSofa = new THREE.Vector3(-0.75, 0.36, -1.75);
  dad.root.position.copy(dadSofa);
  dad.root.rotation.y = 0.35;
  scene.add(dad.root);

  const casters: THREE.Object3D[] = [
    sofa,
    tv,
    kitchen,
    kid.root,
    dad.root,
    ball,
    ott,
    blockArea,
    pad,
  ];
  if (A)
    for (const o of casters)
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) m.castShadow = true;
      });

  // particles (steam, hearts)
  const puffs: Puff[] = [];
  const steamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const heartGeo = heartShape();
  const heartMat = new THREE.MeshBasicMaterial({
    color: 0xff6b8a,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const maxPuffs = opts.reducedMotion ? 6 : A ? 40 : 20;
  function puff(pos: THREE.Vector3, heart: boolean) {
    if (puffs.length >= maxPuffs) return;
    const mesh = heart
      ? new THREE.Mesh(heartGeo, heartMat.clone())
      : new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), steamMat.clone());
    if (heart) mesh.scale.setScalar(0.12);
    mesh.position.copy(pos);
    scene.add(mesh);
    puffs.push({ mesh, life: 1, vy: heart ? 0.35 : 0.25, drift: (Math.random() - 0.5) * 0.2 });
  }

  // tweens
  const tweens: Tween[] = [];
  const tween = (dur: number, fn: (k: number) => void, done?: () => void) => {
    tweens.push({ t: 0, dur: opts.reducedMotion ? Math.min(dur, 0.25) : dur, fn, done });
  };
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

  function walk(p: Person, to: THREE.Vector3, faceYaw: number, dur = 1.1, done?: () => void) {
    const from = p.root.position.clone();
    const fromYaw = p.root.rotation.y;
    tween(
      dur,
      (k) => {
        const e = ease(k);
        p.root.position.lerpVectors(from, to, e);
        p.root.position.y += Math.abs(Math.sin(k * Math.PI * 4)) * 0.05 * (1 - k);
        p.root.rotation.y = fromYaw + (faceYaw - fromYaw) * e;
      },
      done,
    );
  }

  // state
  let cooking = -1;
  let waveT = 0;
  let hugT = 0;
  let dadOnRug = false;
  let night = 0;
  let nightTarget = 0;
  let plate: THREE.Group | null = null;

  const SPOTS: Record<string, [THREE.Vector3, number]> = {
    kitchen: [new THREE.Vector3(-1.75, 0, 0.45), -Math.PI / 2],
    blocks: [new THREE.Vector3(0.45, 0, 0.7), 1.2],
    ball: [new THREE.Vector3(-0.15, 0, 0.85), 0.4],
    color: [new THREE.Vector3(-0.6, 0, 0.45), 2.6],
    home: [kidHome, 0.55],
  };

  function bringDad(next: THREE.Vector3, yawTo: number, done?: () => void) {
    dadOnRug = true;
    walk(dad, next, yawTo, 1.3, done);
  }

  // input: tap to pick, drag to look around a little
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number; yaw: number; pitch: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, yaw, pitch };
    yawGoal = null;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!down) return;
    const r = canvas.getBoundingClientRect();
    yaw = Math.max(0.1, Math.min(1.25, down.yaw - ((e.clientX - down.x) / r.width) * 1.6));
    pitch = Math.max(0.35, Math.min(1.05, down.pitch + ((e.clientY - down.y) / r.height) * 1.2));
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    const hits = ray.intersectObjects(casters, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) {
        opts.onPick(o.userData.pick as KidsPick);
        return;
      }
    }
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    opts.onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", () => (down = null));

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 50 : 40;
    if (shift > 0.002) camera.setViewOffset(w, h, 0, shift * h, w, h);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // main loop
  let raf = 0;
  let last = performance.now();
  let clock = 0;
  let frames = 0;
  let tvAcc = 1;
  const tvStep = A ? 1 / 20 : 1 / 12;
  const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    frames += 1;

    // camera orbit around the target; portrait screens sit further back to fit the room
    const ease1 = Math.min(1, dt * 3);
    target.lerp(goalTarget, ease1);
    zoom += (goalZoom - zoom) * ease1;
    if (yawGoal !== null && !down) yaw += (yawGoal - yaw) * ease1;
    if (Math.abs(goalShift - shift) > 0.001) {
      shift += (goalShift - shift) * ease1;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      if (shift > 0.002) camera.setViewOffset(w, h, 0, shift * h, w, h);
      else camera.clearViewOffset();
    }
    const dist = (camera.aspect < 0.8 ? 9.2 : 6.6) * zoom;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(target);

    for (let i = tweens.length - 1; i >= 0; i -= 1) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.done?.();
      }
    }

    // idle life
    if (!opts.reducedMotion) {
      kid.head.rotation.z = Math.sin(clock * 1.3) * 0.06;
      kid.head.position.y = 0.56 + Math.sin(clock * 2.1) * 0.006;
      dad.head.rotation.y = Math.sin(clock * 0.6) * 0.15;
    }
    if (waveT > 0) {
      waveT -= dt;
      dad.armR.rotation.z = 2.6 + Math.sin(clock * 10) * 0.35;
      kid.armL.rotation.z = -2.5 - Math.sin(clock * 10) * 0.35;
      if (waveT <= 0) {
        dad.armR.rotation.z = 0.25;
        kid.armL.rotation.z = -0.25;
      }
    }
    if (hugT > 0) {
      hugT -= dt;
      for (const p of [dad, kid]) {
        p.armL.rotation.x = -1.2;
        p.armR.rotation.x = -1.2;
        p.armL.rotation.z = -0.5;
        p.armR.rotation.z = 0.5;
      }
      if (Math.random() < dt * 6)
        puff(tmp.copy(kid.root.position).add(new THREE.Vector3(0.1, 1.0, 0)), true);
      if (hugT <= 0)
        for (const p of [dad, kid]) {
          p.armL.rotation.set(0, 0, -0.25);
          p.armR.rotation.set(0, 0, 0.25);
        }
    }

    // cooking
    if (cooking >= 2) {
      if (cooking === 2) spoon.rotation.y = clock * 6;
      if (Math.random() < dt * (A ? 10 : 5)) {
        pot.getWorldPosition(tmp);
        puff(
          tmp.add(
            new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.1, (Math.random() - 0.5) * 0.08),
          ),
          false,
        );
      }
    }

    // blocks
    for (const b of blocks) {
      if (b.body.resting) continue;
      const nb = step(b.body, dt, b.floorY);
      if (!tumbled) {
        nb.x += (b.tx - nb.x) * Math.min(1, dt * 8);
        nb.z += (b.tz - nb.z) * Math.min(1, dt * 8);
        if (nb.resting || nb.y <= b.floorY) {
          nb.x = b.tx;
          nb.z = b.tz;
        }
      }
      if (!b.body.resting && nb.resting && !tumbled) opts.onSfx("pop");
      b.body = nb;
      b.mesh.position.set(nb.x, nb.y, nb.z);
      b.mesh.rotation.y = nb.rot;
      if (tumbled) b.mesh.rotation.x = nb.rot * 0.6;
    }

    // ball rolling with friction, bouncing off the walls
    if (ballVel.lengthSq() > 0.0004) {
      const p = ball.position;
      p.x += ballVel.x * dt;
      p.z += ballVel.y * dt;
      if (Math.abs(p.x) > 2.45) {
        p.x = Math.sign(p.x) * 2.45;
        ballVel.x *= -0.7;
        opts.onSfx("boing");
      }
      if (p.z < -1.3 || p.z > 2.2) {
        p.z = Math.max(-1.3, Math.min(2.2, p.z));
        ballVel.y *= -0.7;
        opts.onSfx("boing");
      }
      const dist2 = ballVel.length() * dt;
      axis.set(ballVel.y, 0, -ballVel.x).normalize();
      ball.rotateOnWorldAxis(axis, dist2 / BALL_R);
      ballVel.multiplyScalar(Math.exp(-0.9 * dt));
      if (dadOnRug && ballReturn === 0 && p.distanceTo(dad.root.position) < 0.5) {
        ballVel.set(0, 0);
        ballReturn = 0.7;
      }
    } else if (ballVel.lengthSq() > 0) ballVel.set(0, 0);
    if (ballReturn > 0) {
      ballReturn -= dt;
      if (ballReturn <= 0) {
        ballReturn = -1; // rolled back once; next tap re-arms
        tmp.copy(kid.root.position).sub(ball.position);
        ballVel.set(tmp.x, tmp.z).normalize().multiplyScalar(1.6);
        opts.onSfx("whoosh");
      }
    }

    // puffs
    for (let i = puffs.length - 1; i >= 0; i -= 1) {
      const p = puffs[i];
      p.life -= dt * 0.8;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.x += p.drift * dt;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, p.life * 0.8);
      p.mesh.quaternion.copy(camera.quaternion);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        if (p.mesh.geometry !== heartGeo) p.mesh.geometry.dispose();
        m.dispose();
        puffs.splice(i, 1);
      }
    }

    // bedtime light blend
    if (night !== nightTarget) {
      night += Math.sign(nightTarget - night) * Math.min(Math.abs(nightTarget - night), dt * 0.5);
      hemi.intensity = 1.25 - night * 0.95;
      sun.intensity = 1.5 - night * 1.4;
      lampLight.intensity = night * 2.2;
      shadeMat.emissiveIntensity = night * 0.9;
      (scene.background as THREE.Color).setRGB(
        0.96 - night * 0.82,
        0.9 - night * 0.78,
        0.81 - night * 0.6,
      );
      windowMat.color.setRGB(0.62 - night * 0.54, 0.85 - night * 0.74, 0.96 - night * 0.7);
      stars.visible = night > 0.5;
    }

    tvAcc += dt;
    if (tvAcc >= tvStep) {
      tvAcc = 0;
      drawCartoon(tvCtx, clock, tvCanvas.width, tvCanvas.height, night > 0.5);
      tvTex.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  // dev-only QA handle (headless screenshots); stripped from production builds
  if (import.meta.env.DEV)
    (window as Window & { __nduKids?: unknown }).__nduKids = {
      renderer,
      scene,
      camera,
      stats: () => ({
        frames,
        puffs: puffs.length,
        calls: renderer.info.render.calls,
        programs: renderer.info.programs?.length,
      }),
    };

  return {
    focus(pick, sheet = pick !== null) {
      const spot = SPOTS[pick && SPOTS[pick] ? pick : "home"];
      walk(kid, spot[0], spot[1]);
      const fr = pick ? FRAMES[pick] : undefined;
      goalTarget.copy(fr ? fr[0] : HOME_TARGET);
      goalZoom = fr ? fr[2] : 1;
      yawGoal = fr ? fr[1] : 0.6;
      goalShift = sheet ? 0.2 : 0;
    },
    cook(n, meal) {
      cooking = n;
      food.material = mat(MEAL_COLOR[meal]);
      if (n === 0) {
        if (plate) {
          scene.remove(plate);
          plate = null;
        }
        veggies.forEach((v) => (v.visible = false));
        food.visible = false;
        spoon.visible = false;
        const from = pot.position.clone();
        tween(0.6, (k) => {
          pot.position.lerpVectors(from, potStove, ease(k));
          pot.position.y += Math.sin(k * Math.PI) * 0.12;
        });
        burnerMat.emissiveIntensity = 0.9;
        opts.onSfx("tick");
      } else if (n === 1) {
        veggies.forEach((v, i) => {
          v.visible = true;
          tween(0.5 + i * 0.15, (k) => {
            v.position.set(
              potStove.x + (i - 1) * 0.03,
              potStove.y + 0.4 * (1 - k) + 0.03,
              potStove.z + (i - 1) * 0.02,
            );
            if (k >= 1) v.visible = false;
          });
        });
        food.visible = true;
        opts.onSfx("pop");
      } else if (n === 2) {
        spoon.visible = true;
        opts.onSfx("sizzle");
      } else {
        spoon.visible = false;
        burnerMat.emissiveIntensity = 0;
        food.visible = false;
        const from = pot.position.clone();
        tween(0.5, (k) => pot.position.lerpVectors(from, potHome, ease(k)));
        // a plate of pretend food appears on the rug for dad
        plate = new THREE.Group();
        plate.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.025, 18), mat(0xffffff)));
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          mat(MEAL_COLOR[meal]),
        );
        dome.scale.y = meal === "pancakes" ? 0.5 : 0.8;
        plate.add(dome);
        plate.position.set(0.35, 0.02, 0.15);
        plate.scale.setScalar(0.01);
        scene.add(plate);
        const pl = plate;
        tween(0.5, (k) => pl.scale.setScalar(0.01 + ease(k)));
        for (let i = 0; i < 4; i += 1) puff(new THREE.Vector3(0.35, 0.3 + i * 0.05, 0.15), true);
        cooking = -1;
        opts.onSfx("chime");
      }
    },
    addBlock() {
      if (tumbled) {
        for (const b of blocks) blockArea.remove(b.mesh);
        blocks = [];
        tumbled = false;
      }
      if (blocks.length >= MAX_BLOCKS) return blocks.length;
      const n = blocks.length;
      const mesh = new THREE.Mesh(blockGeo, mat(BLOCK_COLORS[n % BLOCK_COLORS.length]));
      if (A) mesh.castShadow = true;
      const jitter = () => (Math.random() - 0.5) * 0.16;
      const x = blockHome.x + jitter();
      const z = blockHome.z + jitter();
      const body = newBody(x, restY(n) + 1.0, z);
      body.rot = (Math.random() - 0.5) * 0.3;
      blocks.push({
        mesh,
        body,
        floorY: restY(n),
        tx: snapTo(x, blockHome.x),
        tz: snapTo(z, blockHome.z),
      });
      mesh.position.set(body.x, body.y, body.z);
      blockArea.add(mesh);
      return blocks.length;
    },
    tumble() {
      if (!blocks.length || tumbled) return;
      tumbled = true;
      blocks = blocks.map((b, i) => ({
        ...b,
        body: kick({ ...b.body, resting: false }, i),
        floorY: BLOCK / 2,
      }));
      opts.onSfx("whoosh");
    },
    rollBall() {
      const to = dadOnRug
        ? dad.root.position
        : new THREE.Vector3((Math.random() - 0.5) * 3, 0, -0.8 + Math.random());
      tmp.copy(to).sub(ball.position);
      ballVel.set(tmp.x, tmp.z).normalize().multiplyScalar(2.2);
      ballReturn = 0;
      opts.onSfx("whoosh");
    },
    padChanged() {
      padTex.needsUpdate = true;
    },
    together(kind) {
      const k = kid.root.position;
      const near = new THREE.Vector3(
        k.x + (kind === "hug" ? 0.3 : 0.55),
        0,
        k.z - (kind === "hug" ? 0.12 : 0.25),
      );
      const yawTo = Math.atan2(k.x - near.x, k.z - near.z);
      const go = () => {
        if (kind === "wave") {
          waveT = 2.4;
          opts.onSfx("chime");
        } else {
          hugT = 2.8;
          opts.onSfx("hug");
        }
      };
      if (dadOnRug && dad.root.position.distanceTo(near) < 0.05) go();
      else bringDad(near, yawTo, go);
    },
    bedtime(on) {
      nightTarget = on ? 1 : 0;
      if (on) {
        walk(kid, kidHome, 0.55, 0.9);
        bringDad(new THREE.Vector3(kidHome.x + 0.42, 0, kidHome.z - 0.2), -0.6);
        kid.head.rotation.x = 0.15;
      } else kid.head.rotation.x = 0;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mm = m.material as THREE.Material | THREE.Material[];
          (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose());
        }
      });
      [floorTex, rugTex, tvTex, padTex, ballTex].forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
