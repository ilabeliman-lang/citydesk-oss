/**
 * /map streams WorldMap in a dynamic import. A rejection used to leave the
 * "Entering CityDesk Township" spinner up forever, so the gate looked closed.
 *
 * loading --resolved--> ready
 * loading --rejected--> failed
 * failed  --retry----> loading (next attempt)
 *
 * resolved/rejected carry the attempt they belong to. A late result from an
 * older import cannot clobber a newer try, and cannot open or shut the gate
 * once it has already moved on. The view rides inside this object (not as the
 * React state value itself) so a component function is never mistaken for a
 * setState updater.
 */

export type MapBootPhase = "loading" | "ready" | "failed";

export type MapBootState<T> = {
  phase: MapBootPhase;
  attempt: number;
  view: T | null;
};

export type MapBootEvent<T> =
  | { type: "resolved"; attempt: number; view: T }
  | { type: "rejected"; attempt: number }
  | { type: "retry" };

export function mapBootInitial<T>(): MapBootState<T> {
  return { phase: "loading", attempt: 1, view: null };
}

/** True only while the route should (re)start the WorldMap import. */
export function mapBootShouldLoad<T>(state: MapBootState<T>): boolean {
  return state.phase === "loading";
}

export function reduceMapBoot<T>(state: MapBootState<T>, event: MapBootEvent<T>): MapBootState<T> {
  switch (event.type) {
    case "resolved": {
      if (state.phase !== "loading" || event.attempt !== state.attempt || event.view == null) return state;
      return { phase: "ready", attempt: state.attempt, view: event.view };
    }
    case "rejected": {
      if (state.phase !== "loading" || event.attempt !== state.attempt) return state;
      return { phase: "failed", attempt: state.attempt, view: null };
    }
    case "retry": {
      if (state.phase !== "failed") return state;
      return { phase: "loading", attempt: state.attempt + 1, view: null };
    }
    default: {
      const unexpected: never = event;
      return unexpected;
    }
  }
}
