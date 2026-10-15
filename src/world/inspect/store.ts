// NDU-UPG inspect (#04): framework-free observable for the inspect card.
import type { InspectTarget, ObjectProfile } from "./types.ts";

export type Sheet = "closed" | "peek" | "full";
export type InspectState = { target: InspectTarget | null; profile: ObjectProfile | null; sheet: Sheet; note: string | null; seq: number };

export function createInspectStore(hooks: { clearHighlight?: () => void } = {}) {
  let state: InspectState = { target: null, profile: null, sheet: "closed", note: null, seq: 0 };
  let ctrl: AbortController | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((fn) => fn());
  const set = (patch: Partial<InspectState>) => {
    state = { ...state, ...patch };
    emit();
  };
  return {
    get: () => state,
    /** Replace the target (a new pick replaces the old one). `controller` aborts any tag fetch on close. */
    open(target: InspectTarget, controller?: AbortController | null, profile: ObjectProfile | null = null) {
      ctrl?.abort();
      ctrl = controller ?? null;
      set({ target, profile, sheet: state.sheet === "full" ? "full" : "peek", note: null, seq: state.seq + 1 });
    },
    setProfile(profile: ObjectProfile | null, note: string | null = null, seq = state.seq) {
      if (seq !== state.seq || !state.target) return; // a stale answer for an earlier target
      set({ profile, note });
    },
    expand: () => state.target && set({ sheet: "full" }),
    collapse: () => state.target && set({ sheet: "peek" }),
    close() {
      if (state.sheet === "closed" && !state.target) return;
      ctrl?.abort();
      ctrl = null;
      hooks.clearHighlight?.();
      set({ target: null, profile: null, sheet: "closed", note: null });
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    setHooks(h: { clearHighlight?: () => void }) {
      Object.assign(hooks, h);
    },
  };
}

export type InspectStore = ReturnType<typeof createInspectStore>;

/** The app-wide store (the sheet and the runtime share it). */
export const inspectStore = createInspectStore();
