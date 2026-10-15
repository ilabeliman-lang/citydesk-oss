import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { mapBootInitial, mapBootShouldLoad, reduceMapBoot, type MapBootState } from "@/lib/mapBoot";
import { AuthHover } from "@/world/AuthHover";
import "@/world/empty-state/emboss.css";

export const Route = createFileRoute("/map")({ component: MapPage });

type WorldMapComponent = typeof import("@/world/WorldMap").WorldMap;

export function MapPage() {
  const [boot, setBoot] = useState<MapBootState<WorldMapComponent>>(() => mapBootInitial<WorldMapComponent>());

  useEffect(() => {
    if (!mapBootShouldLoad(boot)) return;
    const attempt = boot.attempt;
    let live = true;
    void import("@/world/WorldMap")
      .then((mod) => {
        if (!live) return;
        setBoot((state) => reduceMapBoot(state, { type: "resolved", attempt, view: mod.WorldMap }));
      })
      .catch(() => {
        if (!live) return;
        setBoot((state) => reduceMapBoot(state, { type: "rejected", attempt }));
      });
    return () => {
      live = false;
    };
  }, [boot]);

  if (boot.phase === "ready" && boot.view) {
    const MapView = boot.view;
    return (
      <>
        <MapView />
        <AuthHover />
      </>
    );
  }

  if (boot.phase === "failed") {
    return (
      <main className="bg-bg text-fg grid min-h-dvh place-items-center p-4">
        <div className="ndu-es-card w-full max-w-sm space-y-3 rounded-3xl px-6 py-6 text-center">
          <p className="font-display text-2xl" role="alert">
            Could not enter CityDesk Township.
          </p>
          <p className="text-xs text-muted">The world chunk didn't arrive.</p>
          <button
            type="button"
            className="ndu-es-push is-hot min-h-11 w-full rounded-full px-5 text-sm font-medium"
            onClick={() => setBoot((state) => reduceMapBoot(state, { type: "retry" }))}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-bg text-fg grid min-h-dvh place-items-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-display text-2xl">Entering CityDesk Township</p>
        <p className="text-xs text-muted">Streaming procedural block & world simulation…</p>
      </div>
    </main>
  );
}
