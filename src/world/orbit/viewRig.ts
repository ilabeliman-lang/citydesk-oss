import { streetFov } from "./streetCam.ts";
import type { ViewMode } from "./viewBus.ts";

const EARTH_M = 40075016.686;
const M_PER_DEG = 111320;
const RAD = Math.PI / 180;

export interface CameraRigResult {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  fov: number;
  eyeHeightM: number;
}

/**
 * Calculates the chase boom distance in metres for a given forward speed in m/s.
 * 4.0m at 0 m/s up to 7.0m at 20 m/s.
 */
export function boomDistanceForSpeed(speedMps: number): number {
  const speed = Math.max(0, speedMps);
  const factor = Math.min(1, speed / 20);
  return 4.0 + 3.0 * factor;
}

/**
 * Mathematical calculations for view parameters based on target position { lat, lng },
 * bearing, velocity (m/s), and container dimensions (width, height).
 */
export function viewCameraRig(
  mode: ViewMode,
  at: { lat: number; lng: number },
  bearing: number,
  speedMps: number,
  view: { width: number; height: number },
): CameraRigResult {
  const coslat = Math.cos(at.lat * RAD) || 1;
  const viewHeight = Math.max(1, view.height);
  const viewWidth = Math.max(1, view.width);

  if (mode === "chase") {
    const eyeHeightM = 1.9;
    const pitch = 80;
    const speed = Math.max(0, speedMps);
    const speedFactor = Math.min(1, speed / 20);
    const boom = 4.0 + 3.0 * speedFactor;
    const baseFov = streetFov(viewWidth, viewHeight);
    const fov = baseFov + 15 * speedFactor;

    const p = pitch * RAD;
    const ahead = eyeHeightM * Math.tan(p) - boom;
    const dist = eyeHeightM / Math.cos(p);
    const camPx = (0.5 * viewHeight) / Math.tan((fov * RAD) / 2);
    const zoom = Math.log2((EARTH_M * coslat * camPx) / (512 * dist));

    const b = bearing * RAD;
    const center: [number, number] = [
      at.lng + (ahead * Math.sin(b)) / (M_PER_DEG * coslat),
      at.lat + (ahead * Math.cos(b)) / M_PER_DEG,
    ];

    return {
      center,
      zoom,
      pitch,
      bearing,
      fov,
      eyeHeightM,
    };
  }

  if (mode === "fpv") {
    const eyeHeightM = 1.7;
    const pitch = 0;
    const fov = 75;
    const dist = eyeHeightM;
    const camPx = (0.5 * viewHeight) / Math.tan((fov * RAD) / 2);
    const zoom = Math.log2((EARTH_M * coslat * camPx) / (512 * dist));
    const center: [number, number] = [at.lng, at.lat];

    return {
      center,
      zoom,
      pitch,
      bearing,
      fov,
      eyeHeightM,
    };
  }

  if (mode === "iso") {
    const pitch = 54.74;
    const isoBearing = 45; // azimuth +45°
    const zoom = 17;
    const fov = streetFov(viewWidth, viewHeight);
    const camPx = (0.5 * viewHeight) / Math.tan((fov * RAD) / 2);
    const dist = (EARTH_M * coslat * camPx) / (512 * 2 ** zoom);
    const eyeHeightM = dist * Math.cos(pitch * RAD);
    const center: [number, number] = [at.lng, at.lat];

    return {
      center,
      zoom,
      pitch,
      bearing: isoBearing,
      fov,
      eyeHeightM,
    };
  }

  if (mode === "tactical") {
    const pitch = 15;
    const zoom = 15.5;
    const fov = streetFov(viewWidth, viewHeight);
    const camPx = (0.5 * viewHeight) / Math.tan((fov * RAD) / 2);
    const dist = (EARTH_M * coslat * camPx) / (512 * 2 ** zoom);
    const eyeHeightM = dist * Math.cos(pitch * RAD);
    const center: [number, number] = [at.lng, at.lat];

    return {
      center,
      zoom,
      pitch,
      bearing,
      fov,
      eyeHeightM,
    };
  }

  // mode === 'planet' fallback
  const pitch = 0;
  const zoom = 1.5;
  const fov = streetFov(viewWidth, viewHeight);
  const camPx = (0.5 * viewHeight) / Math.tan((fov * RAD) / 2);
  const dist = (EARTH_M * coslat * camPx) / (512 * 2 ** zoom);
  const eyeHeightM = dist;
  const center: [number, number] = [at.lng, at.lat];

  return {
    center,
    zoom,
    pitch,
    bearing: 0,
    fov,
    eyeHeightM,
  };
}

/**
 * Calculates walking bob and sway displacements in metres.
 * At 0 m/s there is zero bob.
 * At standard walking pace (1.4 m/s), oscillates with realistic human gait cadence (~2 steps/s).
 */
/** Phone tilt, in degrees. Null when the browser sent nothing useful. */
export function gyroLook(beta: number | null, gamma: number | null): { bearing: number; pitch: number } | null {
  if (beta == null || gamma == null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  return {
    bearing: Math.max(-35, Math.min(35, gamma * 0.35)),
    pitch: Math.max(8, Math.min(70, 90 - beta)),
  };
}

export function walkingBob(tSec: number, speedMps: number): { yBobM: number; xSwayM: number } {
  if (speedMps <= 0) {
    return { yBobM: 0, xSwayM: 0 };
  }

  // Standard human walking pace: 1.4 m/s (~5 km/h)
  // Step cadence: ~2 steps/second at 1.4 m/s (1 full stride = 2 steps = 1.0 Hz)
  const walkRatio = speedMps / 1.4;
  const stepFreq = 2.0 * walkRatio;
  const strideFreq = 1.0 * walkRatio;

  // Real-world human amplitudes: ~4 cm vertical bob, ~2 cm lateral sway at standard pace
  const ampY = 0.04 * Math.min(1.5, walkRatio);
  const ampX = 0.02 * Math.min(1.5, walkRatio);

  const yBobM = ampY * Math.sin(2 * Math.PI * stepFreq * tSec);
  const xSwayM = ampX * Math.sin(2 * Math.PI * strideFreq * tSec);

  return { yBobM, xSwayM };
}
