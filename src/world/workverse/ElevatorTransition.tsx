import React, { useEffect, useRef, useState } from "react";
import { nextFloor } from "../office/floors";
import { playElevatorChime } from "./audio";
import { resetPlayerPosition } from "./WorkversePlayer";
import { getWorkverseLayout } from "./layout";

interface ElevatorTransitionProps {
  /** The target floor to travel to */
  targetFloor: number;
  /** Commit the floor change (called at peak darkness) */
  onFloorChange: (floor: number) => void;
  /** Called when the full transition completes */
  onComplete: () => void;
}

const FADE_IN_MS = 600;
const HOLD_MS = 800;
const FADE_OUT_MS = 700;

/**
 * Full-screen CSS overlay that animates a smooth elevator ride:
 *  1. Fade to black with brass door sliding shut (600ms)
 *  2. Hold at black — show floor indicator, play chime, commit floor change (800ms)
 *  3. Fade out with doors opening, revealing the new floor (700ms)
 */
export function ElevatorTransition({
  targetFloor,
  onFloorChange,
  onComplete,
}: ElevatorTransitionProps) {
  const [phase, setPhase] = useState<"closing" | "holding" | "opening">("closing");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Phase 1: closing (fade in)
    const holdTimer = setTimeout(() => {
      setPhase("holding");
      // At peak darkness — play chime and commit floor change
      playElevatorChime();
      const floor = targetFloor <= 0 ? nextFloor(0, "down", 2) : nextFloor(0, "up", 2);
      onFloorChange(floor);

      // Reset player to the elevator point on the new floor
      const newLayout = getWorkverseLayout(floor);
      resetPlayerPosition(
        newLayout.elevatorPoint[0],
        newLayout.elevatorPoint[1],
        newLayout.elevatorPoint[2] + 1.5,
        Math.PI, // face away from elevator
      );
    }, FADE_IN_MS);

    const openTimer = setTimeout(() => {
      setPhase("opening");
    }, FADE_IN_MS + HOLD_MS);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, FADE_IN_MS + HOLD_MS + FADE_OUT_MS);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(openTimer);
      clearTimeout(completeTimer);
    };
  }, [targetFloor, onFloorChange, onComplete]);

  const floorLabel = targetFloor === 0 ? "Council Office" : "Coding Floor";

  // Opacity per phase
  const overlayOpacity =
    phase === "closing" ? 1 : phase === "holding" ? 1 : 0;

  // Door animation per phase
  const doorTranslate =
    phase === "closing" ? "0%" : phase === "holding" ? "0%" : "100%";

  return (
    <div
      className="fixed inset-0 z-[800] pointer-events-auto"
      style={{
        transition: `opacity ${phase === "closing" ? FADE_IN_MS : FADE_OUT_MS}ms ease-in-out`,
        opacity: overlayOpacity,
      }}
    >
      {/* Dark background */}
      <div className="absolute inset-0 bg-[#020617]" />

      {/* Brass elevator doors (split left/right) */}
      <div className="absolute inset-0 flex">
        <div
          className="w-1/2 h-full bg-gradient-to-r from-[#8b6914] to-[#d4a359]"
          style={{
            transition: `transform ${phase === "opening" ? FADE_OUT_MS : FADE_IN_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            transform: `translateX(-${doorTranslate})`,
          }}
        />
        <div
          className="w-1/2 h-full bg-gradient-to-l from-[#8b6914] to-[#d4a359]"
          style={{
            transition: `transform ${phase === "opening" ? FADE_OUT_MS : FADE_IN_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            transform: `translateX(${doorTranslate})`,
          }}
        />
      </div>

      {/* Center seam line */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-[#0f172a]/60" />

      {/* Floor indicator */}
      {phase === "holding" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
          <div className="text-amber-300 font-mono text-sm tracking-[0.3em] uppercase">
            Floor {targetFloor}
          </div>
          <div className="text-slate-300 font-display text-2xl mt-1 tracking-wider">
            {floorLabel}
          </div>
          <div className="mt-4 flex items-center gap-1.5">
            {[0, 1].map((f) => (
              <div
                key={f}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  f === targetFloor ? "bg-amber-400" : "bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
