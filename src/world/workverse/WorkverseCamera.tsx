import React, { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { workversePlayerState } from "./WorkversePlayer";
import { useWorkverseStore } from "./store";

/**
 * Jarvis Verse Camera Spec (https://personaljarvis.ai/blog/jarvis-verse/ & officeCamera.ts)
 * Polar angle: minPolar: 0.35 (~20° top-down), maxPolar: 1.25 (~72° eye level)
 * Look-down pitch: 40° (HOME_PITCH_RAD), Yaw: 38° east of south (HOME_YAW_RAD)
 * FOV: 35°, minDistance: 2.5m, maxDistance: 140m
 * Dynamic near-plane depth precision (depthNear)
 */
export const CAMERA_FOV = 35;
export const CAMERA_LIMITS = {
  minPolar: 0.35,
  maxPolar: 1.25,
  minDistance: 2.5,
  maxDistance: 140,
} as const;

export const HOME_PITCH_RAD = (40 * Math.PI) / 180;
export const HOME_YAW_RAD = (38 * Math.PI) / 180;
export const FOLLOW_DISTANCE = 15;
export const TARGET_HEIGHT = 0.8;
export const DIVE_DURATION = 1.15; // seconds
const FOLLOW_SMOOTH_FACTOR = 8.0;

export function depthNear(distance: number): number {
  return Math.min(6.0, Math.max(0.2, distance * 0.04));
}

export function WorkverseCamera({
  playerPos: _playerPos,
}: {
  playerPos?: [number, number, number];
} = {}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);

  const { isDiving, diveTarget, cancelCameraDive } = useWorkverseStore();

  const isFollowing = useRef(true);
  const diveProgress = useRef(0);
  const fromEye = useRef(new THREE.Vector3());
  const toEye = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const preDivePose = useRef<{ eye: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Initial camera placement according to Jarvis Verse 40° look-down & 38° yaw
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = CAMERA_FOV;
      camera.updateProjectionMatrix();
    }

    const initialTarget = new THREE.Vector3(workversePlayerState.x, TARGET_HEIGHT, workversePlayerState.z);
    const horizontal = Math.cos(HOME_PITCH_RAD) * FOLLOW_DISTANCE;
    const vertical = Math.sin(HOME_PITCH_RAD) * FOLLOW_DISTANCE;

    camera.position.set(
      initialTarget.x + Math.sin(HOME_YAW_RAD) * horizontal,
      initialTarget.y + vertical,
      initialTarget.z + Math.cos(HOME_YAW_RAD) * horizontal,
    );
    controls.target.copy(initialTarget);
    controls.update();
  }, [camera]);

  // Handle escape key to cancel dive
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useWorkverseStore.getState().isDiving) {
        cancelCameraDive();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelCameraDive]);

  // Manage transitions between follow and monitor dive
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isDiving && diveTarget) {
      preDivePose.current = {
        eye: camera.position.clone(),
        target: controls.target.clone(),
      };

      fromEye.current.copy(camera.position);
      fromTarget.current.copy(controls.target);

      toTarget.current.set(diveTarget[0], diveTarget[1], diveTarget[2]);
      toEye.current.set(diveTarget[0], diveTarget[1] + 0.05, diveTarget[2] + 0.95);

      diveProgress.current = 0;
      controls.enabled = false;
    } else if (!isDiving && preDivePose.current) {
      const prev = preDivePose.current;
      camera.position.copy(prev.eye);
      controls.target.copy(prev.target);
      controls.enabled = true;
      controls.update();
      preDivePose.current = null;
      isFollowing.current = true;
    }
  }, [isDiving, diveTarget, camera]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const dt = Math.min(delta, 0.1);

    if (isDiving && diveTarget) {
      if (diveProgress.current < 1.0) {
        diveProgress.current = Math.min(1.0, diveProgress.current + dt / DIVE_DURATION);
        const t = diveProgress.current;
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        camera.position.lerpVectors(fromEye.current, toEye.current, ease);
        controls.target.lerpVectors(fromTarget.current, toTarget.current, ease);
        camera.lookAt(controls.target);
      }
      return;
    }

    // Dynamic near plane depth precision from Jarvis Verse
    const currentDist = camera.position.distanceTo(controls.target);
    const calculatedNear = depthNear(currentDist);
    if (camera.near !== calculatedNear) {
      camera.near = calculatedNear;
      camera.updateProjectionMatrix();
    }

    // Follow mode
    if (workversePlayerState.moving) {
      isFollowing.current = true;
    }

    if (isFollowing.current) {
      const targetPos = new THREE.Vector3(
        workversePlayerState.x,
        TARGET_HEIGHT,
        workversePlayerState.z,
      );

      const lerpFactor = 1.0 - Math.exp(-FOLLOW_SMOOTH_FACTOR * dt);
      const prevTargetX = controls.target.x;
      const prevTargetZ = controls.target.z;

      controls.target.x += (targetPos.x - controls.target.x) * lerpFactor;
      controls.target.z += (targetPos.z - controls.target.z) * lerpFactor;
      controls.target.y = TARGET_HEIGHT;

      const deltaX = controls.target.x - prevTargetX;
      const deltaZ = controls.target.z - prevTargetZ;

      camera.position.x += deltaX;
      camera.position.z += deltaZ;

      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      screenSpacePanning={false}
      minPolarAngle={CAMERA_LIMITS.minPolar}
      maxPolarAngle={CAMERA_LIMITS.maxPolar}
      minDistance={CAMERA_LIMITS.minDistance}
      maxDistance={CAMERA_LIMITS.maxDistance}
      zoomSpeed={1.2}
      rotateSpeed={0.8}
      onStart={() => {
        isFollowing.current = false;
      }}
    />
  );
}
