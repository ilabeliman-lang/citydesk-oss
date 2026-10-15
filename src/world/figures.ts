import * as THREE from "three";

type Spot = { lat: number; lng: number };

type Readout = {
  you: Spot;
  people: Spot[];
  stall: Spot | null;
};

type MapLike = {
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  getSize: () => { x: number; y: number };
  on: (event: string, fn: () => void) => void;
  off: (event: string, fn: () => void) => void;
};

function person(cloth: number) {
  const group = new THREE.Group();
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.72, 8), mat(cloth));
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0xf6efe2));
  head.position.y = 1.28;
  group.add(shadow, body, head);
  return group;
}

function stall() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.9 }),
  );
  base.position.y = 0.5;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.16, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xe8843a }),
  );
  roof.position.y = 1.35;
  group.add(base, roof);
  return group;
}

function meters(lat: number) {
  return 156543.03392 * Math.cos((lat * Math.PI) / 180);
}

export function mountFigures(host: HTMLElement, map: MapLike, read: () => Readout) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(30, 80, 20);
  scene.add(sun);

  const you = person(0xe8843a);
  const stand = stall();
  scene.add(you, stand);
  const crowd: THREE.Group[] = [];

  let frame = 0;
  const draw = () => {
    const size = map.getSize();
    const width = host.clientWidth || size.x;
    const height = host.clientHeight || size.y;
    if (renderer.domElement.width !== Math.floor(width * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    const center = map.getCenter();
    const zoom = map.getZoom();
    const mpp = meters(center.lat) / 2 ** zoom;
    const heightM = height * mpp;
    const dist = heightM / 2 / Math.tan((35 * Math.PI) / 360);
    camera.aspect = width / Math.max(height, 1);
    camera.position.set(0, dist, 0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const data = read();
    const place = (spot: Spot, group: THREE.Group, tallM: number) => {
      const dx = (spot.lng - center.lng) * 111320 * Math.cos((center.lat * Math.PI) / 180);
      const dz = (spot.lat - center.lat) * 111320;
      const scale = tallM / 1.7;
      group.position.set(dx, 0, dz);
      group.scale.setScalar(scale);
      group.visible = true;
    };
    place(data.you, you, 56 * mpp);
    if (data.stall) place(data.stall, stand, 42 * mpp);
    else stand.visible = false;

    while (crowd.length < data.people.length) {
      const mesh = person(0x2c241c);
      crowd.push(mesh);
      scene.add(mesh);
    }
    crowd.forEach((mesh, index) => {
      const spot = data.people[index];
      if (!spot) {
        mesh.visible = false;
        return;
      }
      place(spot, mesh, 48 * mpp);
    });
    renderer.render(scene, camera);
  };

  const loop = () => {
    draw();
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  map.on("move", draw);
  map.on("zoom", draw);

  return () => {
    cancelAnimationFrame(frame);
    map.off("move", draw);
    map.off("zoom", draw);
    renderer.dispose();
    renderer.domElement.remove();
  };
}
