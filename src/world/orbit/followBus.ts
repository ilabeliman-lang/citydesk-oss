/**
 * NDU-UPG follow: state shared by the follow camera (follow.ts, lives with the map) and the bubbles
 * (Recenter button). No map code here, so the bubble UI stays light.
 */
import type { PersonView } from "./streetCam";

export type FollowMode = "heading" | "north";
export type FollowState = {
  /** true = the camera follows the avatar when it moves; false = paused by a drag/pinch/turn. */
  on: boolean;
  mode: FollowMode;
  /** Show the Recenter/mode bubble (paused, or just re-centred so a second tap can switch mode). */
  showButton: boolean;
};

// NDU-UPG follow (street default): the only persisted camera setting is the follow mode. There was no camera /
// zoom key before; this versioned key starts every phone on the new street-level heading-up default.
export const FOLLOW_KEY = "ndu.follow.v2";
const savedMode = (): FollowMode => {
  try {
    return localStorage.getItem(FOLLOW_KEY) === "north" ? "north" : "heading";
  } catch {
    return "heading";
  }
};
let state: FollowState = { on: true, mode: typeof window === "undefined" ? "heading" : savedMode(), showButton: false };
const PERSON_KEY = "ndu.person.v1";
const savedPerson = (): PersonView => {
  try {
    const saved = localStorage.getItem(PERSON_KEY);
    return saved === "second" || saved === "first" ? saved : "third";
  } catch {
    return "third";
  }
};
let person: PersonView = typeof window === "undefined" ? "third" : savedPerson();
const personSubs = new Set<(p: PersonView) => void>();
const subs = new Set<(s: FollowState) => void>();
type Actions = { recenter: (mode?: FollowMode) => void; pause: () => void; northUp: () => boolean; street: () => boolean };
let actions: Actions | null = null;

export function getFollow() {
  return state;
}
export function setFollow(patch: Partial<FollowState>) {
  const next = { ...state, ...patch };
  if (next.on === state.on && next.mode === state.mode && next.showButton === state.showButton) return;
  if (next.mode !== state.mode) {
    try {
      localStorage.setItem(FOLLOW_KEY, next.mode);
    } catch {
      // private mode: the mode just isn't remembered
    }
  }
  state = next;
  subs.forEach((fn) => fn(state));
}
export function onFollow(fn: (s: FollowState) => void): () => void {
  subs.add(fn);
  fn(state);
  return () => {
    subs.delete(fn);
  };
}
export function setFollowActions(next: Actions | null) {
  actions = next;
}
/** Fly back to the avatar and follow it again (optionally switching heading-up / north-up). */
export function recenter(mode?: FollowMode) {
  actions?.recenter(mode);
}
/** A camera button (turn left/right) was used: stop following until Recenter. */
export function pauseFollow() {
  actions?.pause();
}
/** The N bubble while following: switch to north-up follow. Returns false when follow is paused. */
export function followNorthUp(): boolean {
  return actions?.northUp() ?? false;
}
/** A relocation (GPS fix, saved spot): put the camera at street level on the avatar. False when follow is paused. */
export function streetNow(): boolean {
  return actions?.street() ?? false;
}
export function getPerson() {
  return person;
}
export function onPerson(fn: (p: PersonView) => void): () => void {
  personSubs.add(fn);
  fn(person);
  return () => {
    personSubs.delete(fn);
  };
}
function writePerson(next: PersonView) {
  if (next === person) return;
  person = next;
  try {
    localStorage.setItem(PERSON_KEY, next);
  } catch {
    // private mode: the choice just isn't remembered
  }
  personSubs.forEach((fn) => fn(person));
}
/** Third sits behind you. Second looks back at your face. First is the cabin view. */
export function setPerson(next: PersonView) {
  const was = person;
  writePerson(next);
  // NDU-FP: the first-person controller (only loaded behind its flag) listens for these
  if (typeof window !== "undefined" && was !== next) {
    if (next === "first") window.dispatchEvent(new CustomEvent("ndu:fp-enter"));
    else if (was === "first") window.dispatchEvent(new CustomEvent("ndu:fp-exit"));
  }
  actions?.recenter();
}
export function togglePerson() {
  const next = person === "third" ? "second" : person === "second" ? "first" : "third";
  setPerson(next);
}
export function followAttached(): boolean {
  return actions !== null;
}
