import React, { lazy, Suspense } from "react";
import type { EnterSpot } from "@/world/empty-state/footprint";
import { detectBuildingArchetype } from "./archetypes";
import { shapeFromSpot } from "@/world/empty-state/footprint";
import { useWorkverseStore } from "./store";
import { AddressDesk } from "@/world/address/AddressDesk";

const WorkverseScene = lazy(() => import("./WorkverseScene"));

interface WorkverseSlotProps {
  onLeave: () => void;
  spot?: EnterSpot | null;
}

export function WorkverseSlot({ onLeave, spot }: WorkverseSlotProps) {
  const setArchetype = useWorkverseStore((s) => s.setArchetype);
  const setSpotShape = useWorkverseStore((s) => s.setSpotShape);

  React.useEffect(() => {
    if (spot) {
      const shape = shapeFromSpot(spot);
      setSpotShape(shape);
      const arch = detectBuildingArchetype(spot.feature, spot.name);
      const area = shape.type === "building" ? Math.max(100, Math.min(800, shape.areaM2)) : 200;
      setArchetype(arch, area);
    } else {
      setSpotShape(null);
    }
  }, [spot, setArchetype, setSpotShape]);

  React.useEffect(() => {
    document.documentElement.dataset.nduOffice = "1";
    return () => {
      delete document.documentElement.dataset.nduOffice;
    };
  }, []);

  const arch = spot ? detectBuildingArchetype(spot.feature, spot.name) : "residential";
  const buildingBearing = spot?.door?.bearing ?? spot?.bearing ?? 0; // NDU-UPG collide: face the street door you came through
  const spotName = spot?.name ?? "Jarvis Verse";

  return (
    <div className="fixed inset-0 z-[600] w-full h-full bg-[#06080e]">
      <Suspense
        fallback={
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#06080e] text-slate-200">
            <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mb-3" />
            <div className="font-mono text-sm tracking-wider uppercase text-amber-300">
              Entering {spotName}...
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Synchronizing 3D Isometric Building Verse
            </div>
          </div>
        }
      >
        <WorkverseScene onLeave={onLeave} buildingBearing={buildingBearing} />
      </Suspense>
      <AddressDesk flagship={arch === "flagship_verse"} />
    </div>
  );
}
