// NDU-FP (FPXR-11): tilt look. Pure quaternion maths (three.js r133 DeviceOrientationControls recipe, no three),
// plus a permission-aware adapter that only stores the latest sample (the controller reads it in rAF).
export type Quat = { x: number; y: number; z: number; w: number };
const RAD = Math.PI / 180;
const mul = (a: Quat, b: Quat): Quat => ({
  x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
  y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
  z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
function eulerYXZ(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };
}
const Q1 = { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }; // -90° about X
/** alpha/beta/gamma in degrees (DeviceOrientationEvent), screen angle in degrees. */
export function quatFromDeviceOrientation(alpha: number, beta: number, gamma: number, screenAngleDeg: number): Quat {
  let q = eulerYXZ(beta * RAD, alpha * RAD, -gamma * RAD);
  q = mul(q, Q1);
  const o = (-screenAngleDeg * RAD) / 2;
  return mul(q, { x: 0, y: 0, z: Math.sin(o), w: Math.cos(o) });
}
/** Forward (0,0,-1) rotated by q -> yaw east-of-north... in device frame: yaw = atan2(-f.x, -f.z) keeps clockwise-positive. */
export function yawPitchFromQuat(q: Quat): { yaw: number; pitch: number } {
  const { x, y, z, w } = q;
  // v = (0,0,-1): rotated = -(third column of the rotation matrix)
  const fx = -(2 * (x * z + w * y));
  const fy = -(2 * (y * z - w * x));
  const fz = -(1 - 2 * (x * x + y * y));
  const yaw = -Math.atan2(fx, -fz) / RAD; // alpha grows counter-clockwise; map yaw grows clockwise
  return { yaw: Math.abs(yaw) < 1e-9 ? 0 : yaw, pitch: Math.asin(Math.max(-1, Math.min(1, fy))) / RAD };
}

export type GyroResult = "granted" | "denied" | "unavailable";
let latest: { yaw: number; pitch: number; t: number } | null = null;
let stop: (() => void) | null = null;
export const gyroSample = () => latest;
export async function enableGyro(): Promise<GyroResult> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return "unavailable";
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DOE.requestPermission === "function") {
    try {
      if ((await DOE.requestPermission()) !== "granted") return "denied";
    } catch {
      return "denied";
    }
  }
  disableGyro();
  const angle = () => (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
  const on = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const yp = yawPitchFromQuat(quatFromDeviceOrientation(e.alpha, e.beta, e.gamma, angle()));
    latest = { ...yp, t: performance.now() };
  };
  const hide = () => {
    if (document.visibilityState === "hidden") latest = null;
  };
  window.addEventListener("deviceorientation", on);
  document.addEventListener("visibilitychange", hide);
  stop = () => {
    window.removeEventListener("deviceorientation", on);
    document.removeEventListener("visibilitychange", hide);
  };
  return "granted";
}
export function disableGyro() {
  stop?.();
  stop = null;
  latest = null;
}
