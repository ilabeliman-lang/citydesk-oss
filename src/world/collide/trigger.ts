import { COOLDOWN_S, DOOR_NEAR_M, DOOR_WALKIN_S, type Door, type Vec } from "./types.ts";

/** NDU-UPG collide: door trigger state machine idle → near → prompting → entering → cooldown (PLAN §5.6). Pure. */
export type TriggerState = "idle" | "near" | "prompting" | "entering" | "cooldown";
export type Trigger = { state: TriggerState; door: Door | null; walkIn: number; cool: number; coolDoor: string | null; eWas: boolean; auto: string | null };
export type TriggerInput = { pos: Vec; vel: Vec; stickHeld: boolean; eHeld: boolean; typing: boolean; dt: number; doors: Door[]; radius?: number };
export type TriggerOut = { state: TriggerState; door: Door | null; enter: boolean; peek: boolean; promptChanged: boolean };

export function newTrigger(): Trigger {
  return { state: "idle", door: null, walkIn: 0, cool: 0, coolDoor: null, eWas: false, auto: null };
}

export function startCooldown(t: Trigger, doorId: string | null): void {
  t.state = "cooldown";
  t.cool = COOLDOWN_S;
  t.coolDoor = doorId;
  t.walkIn = 0;
}

/** Arm an auto-enter for a door (tap-to-enter: entering on trip arrival). */
export function armAuto(t: Trigger, doorId: string | null): void {
  t.auto = doorId;
}

export function nearestDoor(doors: Door[], pos: Vec, maxM = DOOR_NEAR_M, skip: string | null = null): Door | null {
  let best: Door | null = null;
  let bd = maxM;
  for (const d of doors) {
    if (d.kind === "exit" || d.kind === "emergency" || d.id === skip) continue;
    const dx = pos.x - d.at.x;
    const dy = pos.y - d.at.y;
    if (dx * d.normal.x + dy * d.normal.y < -0.2) continue; // behind the wall
    const dist = Math.hypot(dx, dy);
    if (dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}

export function tickTrigger(t: Trigger, i: TriggerInput): TriggerOut {
  const prevDoor = t.door?.id ?? null;
  const prevState = t.state;
  let enter = false;
  let peek = false;
  const r = i.radius ?? 0.3;
  if (t.state === "cooldown") {
    t.cool -= i.dt;
    if (t.cool <= 0) {
      t.state = "idle";
      t.coolDoor = null;
    }
  }
  const skip = t.state === "cooldown" ? t.coolDoor : null;
  const door = nearestDoor(i.doors, i.pos, DOOR_NEAR_M, skip);
  const e = i.eHeld && !i.typing;
  const ePress = e && !t.eWas;
  t.eWas = e;
  if (t.state !== "cooldown" || !door) {
    if (!door) {
      if (t.state !== "cooldown") t.state = "idle";
      t.door = null;
      t.walkIn = 0;
    } else {
      t.door = door;
      t.state = "prompting";
      const into = -(i.vel.x * door.normal.x + i.vel.y * door.normal.y);
      const speed = Math.hypot(i.vel.x, i.vel.y);
      const close = Math.hypot(i.pos.x - door.at.x, i.pos.y - door.at.y) < r + 0.25 + 0.05;
      if (i.stickHeld && speed > 1e-6 && into / speed > 0.6 && close) t.walkIn += i.dt;
      else t.walkIn = 0;
      const auto = t.auto !== null && t.auto === door.id;
      if (ePress || t.walkIn >= DOOR_WALKIN_S || auto) {
        if (door.locked) peek = ePress || auto;
        else enter = true;
        if (enter || peek) {
          t.state = "entering";
          t.walkIn = 0;
          t.auto = null;
        }
      }
    }
  } else t.door = null;
  return { state: t.state, door: t.door, enter, peek, promptChanged: prevDoor !== (t.door?.id ?? null) || (prevState === "entering") !== (t.state === "entering") };
}
