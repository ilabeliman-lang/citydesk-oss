import React, { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { workversePlayerState } from "./WorkversePlayer";
import { useWorkverseStore } from "./store";

const FOLLOW_SMOOTH_FACTOR = 8.0;
const DIVE_DURATION = 1.15; // seconds

export const ISO_ELEV = Math.atan(1 / Math.SQRT2); // ~35.264 degrees elevation
export const ISO_POLAR_ANGLE = Math.PI / 2 - ISO_ELEV; // ~54.736 degrees from up (Y axis)

export function WorkverseIsometricRig({
  playerPos: _playerPos,
  buildingBearing = 0,
}: {
  playerPos?: [number, number, number];
  buildingBearing?: number;
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
  const preDivePose = useRef<{ eye: THREE.Vector3; target: THREE.Vector3; zoom?: number } | null>(null);

  // Initial camera placement
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const initialTarget = new THREE.Vector3(workversePlayerState.x, 0.8, workversePlayerState.z);
    
    // Position camera based on spherical coordinates to maintain isometric angle
    const radius = 20;
    const azimuth = Math.PI / 4 + buildingBearing;
    
    const x = initialTarget.x + radius * Math.sin(ISO_POLAR_ANGLE) * Math.sin(azimuth);
    const z = initialTarget.z + radius * Math.sin(ISO_POLAR_ANGLE) * Math.cos(azimuth);
    const y = initialTarget.y + radius * Math.cos(ISO_POLAR_ANGLE);
    
    camera.position.set(x, y, z);
    controls.target.copy(initialTarget);
    controls.update();
  }, [camera, buildingBearing]);

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

  // Manage transitions between normal follow and camera dive
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isDiving && diveTarget) {
      preDivePose.current = {
        eye: camera.position.clone(),
        target: controls.target.clone(),
        zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : undefined,
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
      if (camera instanceof THREE.OrthographicCamera && prev.zoom !== undefined) {
        camera.zoom = prev.zoom;
        camera.updateProjectionMatrix();
      }
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
        
        if (camera instanceof THREE.OrthographicCamera) {
          const fromZoom = preDivePose.current?.zoom || 45;
          const toZoom = 140; // Zoom in for dive
          camera.zoom = fromZoom + (toZoom - fromZoom) * ease;
          camera.updateProjectionMatrix();
        }

        camera.lookAt(controls.target);
      }
      return;
    }

    if (workversePlayerState.moving) {
      isFollowing.current = true;
    }

    if (isFollowing.current) {
      const targetPos = new THREE.Vector3(
        workversePlayerState.x,
        0.8,
        workversePlayerState.z,
      );

      const lerpFactor = 1.0 - Math.exp(-FOLLOW_SMOOTH_FACTOR * dt);
      const prevTargetX = controls.target.x;
      const prevTargetZ = controls.target.z;

      controls.target.x += (targetPos.x - controls.target.x) * lerpFactor;
      controls.target.z += (targetPos.z - controls.target.z) * lerpFactor;
      controls.target.y = 0.8;

      const deltaX = controls.target.x - prevTargetX;
      const deltaZ = controls.target.z - prevTargetZ;

      camera.position.x += deltaX;
      camera.position.z += deltaZ;

      controls.update();
    }
  });

  return (
    <>
      <OrthographicCamera makeDefault position={[20, 20, 20]} zoom={45} near={-100} far={100} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning={false}
        minPolarAngle={ISO_POLAR_ANGLE}
        maxPolarAngle={ISO_POLAR_ANGLE}
        onStart={() => {
          isFollowing.current = false;
        }}
      />
    </>
  );
}
