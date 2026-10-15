// NDU-UPG inspect (#04): lazy slot. Nothing renders (and the sheet chunk never loads) until a pick.
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { inspectAllowed } from "./flag";
import { inspectStore } from "./store";

const Sheet = lazy(() => import("./InspectSheet"));

export function InspectSlot() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(inspectAllowed()), []);
  const state = useSyncExternalStore(inspectStore.subscribe, inspectStore.get, inspectStore.get);
  if (!on || state.sheet === "closed" || !state.target) return null;
  return (
    <Suspense fallback={null}>
      <Sheet />
    </Suspense>
  );
}
