import { useEffect, useRef } from "react";
import {
  initAudio,
  playFootstep,
  playKeyClick,
  playElevatorChime,
  playTerminalBeep,
  startAmbientHum,
  stopAmbientHum,
} from "./audio";
import { useWorkverseStore } from "./store";
import { getWorkverseLayout } from "./layout";
import { workversePlayerState } from "./WorkversePlayer";
import { footstep } from "../audio/footsteps";

export interface UseWorkverseAudioOptions {
  playerMoving?: boolean;
  currentFloor?: number;
  isDiving?: boolean;
  surface?: string;
}

/**
 * React hook that binds the Workverse procedural audio engine to player and world state.
 * Triggers footsteps on movement intervals, plays elevator chimes on floor changes,
 * retro terminal beeps on camera dives, and maintains ambient room hum.
 */
export function useWorkverseAudio({
  playerMoving = false,
  currentFloor = 0,
  isDiving = false,
  surface = "floor",
}: UseWorkverseAudioOptions = {}) {
  const prevFloorRef = useRef<number | undefined>(undefined);
  const prevDivingRef = useRef<boolean>(false);
  const footstepIntervalRef = useRef<number | null>(null);

  // 1. User gesture unlock for browser Web Audio autoplay policy
  useEffect(() => {
    const handleGesture = () => {
      void initAudio();
    };

    window.addEventListener("pointerdown", handleGesture, { once: true, passive: true });
    window.addEventListener("keydown", handleGesture, { once: true, passive: true });

    // Try initializing right away in case gesture context already exists
    void initAudio();

    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, []);

  // 2. Ambient hum lifecycle & floor transitions
  useEffect(() => {
    if (prevFloorRef.current === undefined) {
      // Initial mount: start ambient drone for the current floor
      startAmbientHum(currentFloor);
    } else if (prevFloorRef.current !== currentFloor) {
      // Floor changed: play elevator chime and morph ambient hum
      playElevatorChime();
      startAmbientHum(currentFloor);
    }

    prevFloorRef.current = currentFloor;
  }, [currentFloor]);

  // Clean up ambient drone on unmount
  useEffect(() => {
    return () => {
      stopAmbientHum();
    };
  }, []);

  // 3. Camera dive terminal sound
  useEffect(() => {
    if (isDiving && !prevDivingRef.current) {
      playTerminalBeep();
    }
    prevDivingRef.current = isDiving;
  }, [isDiving]);

  // 4. Movement footsteps on interval
  useEffect(() => {
    if (playerMoving) {
      let step = 0;
      const playStep = () => {
        if (
          surface === "asphalt" ||
          surface === "stone" ||
          surface === "grass" ||
          surface === "wood"
        ) {
          footstep(surface, step);
        }
        step += 1;
        playFootstep(surface);
      };

      // Play initial step immediately on movement start
      playStep();

      // Repeat footsteps at standard natural walking cadence (~360ms)
      const intervalId = window.setInterval(playStep, 360);

      footstepIntervalRef.current = intervalId;

      return () => {
        window.clearInterval(intervalId);
        footstepIntervalRef.current = null;
      };
    } else {
      if (footstepIntervalRef.current !== null) {
        window.clearInterval(footstepIntervalRef.current);
        footstepIntervalRef.current = null;
      }
    }
  }, [playerMoving, surface]);

  // 5. Proximity Mechanical Keyboard Audio
  useEffect(() => {
    let timeoutId: number;
    let isActive = true;

    const scheduleNextClick = () => {
      if (!isActive) return;

      const state = useWorkverseStore.getState();
      const layout = getWorkverseLayout(state.currentFloor);
      
      const px = workversePlayerState.x;
      const pz = workversePlayerState.z;
      
      let maxVolume = 0;
      let targetPan = 0;

      // Find highest volume from nearby working agents
      for (const desk of layout.desks) {
        const agentState = state.agentStates[desk.memberId];
        const behavior = state.agentBehaviors[desk.memberId];
        
        const isWorking = agentState === "working" || (behavior && behavior.activity === "desk_work");
        if (isWorking) {
          const dx = desk.x - px;
          const dz = desk.z - pz;
          const distance = Math.hypot(dx, dz);
          
          if (distance < 4.5) {
            const volume = Math.max(0, 1 - distance / 4.5);
            if (volume > maxVolume) {
              maxVolume = volume;
              
              // Calculate spatial panning relative to player heading
              const angleToDesk = Math.atan2(dx, dz);
              let relativeAngle = angleToDesk - workversePlayerState.heading;
              while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
              while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
              targetPan = Math.sin(relativeAngle);
            }
          }
        }
      }

      if (maxVolume > 0) {
        playKeyClick(maxVolume, targetPan);
      }

      // Schedule next tick (irregular 80-220ms)
      const nextDelay = 80 + Math.random() * 140;
      timeoutId = window.setTimeout(scheduleNextClick, nextDelay);
    };

    // Start loop
    timeoutId = window.setTimeout(scheduleNextClick, 100);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return {
    initAudio,
    playFootstep,
    playKeyClick,
    playElevatorChime,
    playTerminalBeep,
    startAmbientHum,
    stopAmbientHum,
  };
}
