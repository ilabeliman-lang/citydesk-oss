const keys = new Set<string>();
let stickX = 0;
let stickY = 0;

const block = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function onDown(e: KeyboardEvent) {
  keys.add(e.code);
  if (block.has(e.code)) e.preventDefault();
}
function onUp(e: KeyboardEvent) {
  keys.delete(e.code);
}
function onBlur() {
  keys.clear();
  stickX = 0;
  stickY = 0;
}

export function bindInput(target: Window) {
  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);
  return () => {
    target.removeEventListener("keydown", onDown);
    target.removeEventListener("keyup", onUp);
    target.removeEventListener("blur", onBlur);
  };
}

/** QA probe: replaces held keys until the next call. */
export function setProbeKeys(codes: string[]) {
  keys.clear();
  for (const code of codes) keys.add(code);
}

/** NDU-UPG collide: read one held key (doors use KeyE only; Space is Sprint). */
export function isKeyHeld(code: string): boolean {
  return keys.has(code);
}

export function setStick(x: number, y: number) {
  stickX = x;
  stickY = y;
}

export function readMove() {
  let x = stickX;
  let y = stickY;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y -= 1;
  const m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
  }
  return { x, y, interact: keys.has("KeyE") || keys.has("Space") };
}

// NDU-FP (FPXR-06): first-person reads. readMove() above is unchanged for every existing caller.
/** Shift held, or the stick pushed almost all the way. */
export function readRun(): boolean {
  return keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(stickX, stickY) > 0.92;
}
/** Arrow left/right turn in first person (keyboard alternative to mouse look). */
export function readTurnFp(): number {
  return (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
}
/** Like readMove, but strafe is A/D only (arrows left/right turn in first person). */
export function readMoveFp() {
  let x = stickX;
  let y = stickY;
  if (keys.has("KeyD")) x += 1;
  if (keys.has("KeyA")) x -= 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y -= 1;
  const m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
  }
  return { x, y, interact: keys.has("KeyE") || keys.has("Space") };
}
