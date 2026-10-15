import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPrefs, fpAllowedFrom, parsePrefs, sanitizePrefs, effectiveBob } from "./flag.ts";
import { eyeOfFp, fpCamera, fpFov, posture } from "./rig.ts";
import { bobOffsets, newGait, stepGait, stepLength } from "./gait.ts";
import { clampEye, easeLimits, groundSpring, pitchLimits } from "./limits.ts";
import { FootprintIndex, ringsFromFeatures } from "./footprints.ts";
import { OneEuro, unwrapDeg } from "./oneEuro.ts";
import { LookMixer } from "./lookMixer.ts";
import { blendPose, Handoff, spriteOpacity, thirdPose, type Pose } from "./handoff.ts";
import { vignetteStrength } from "./comfort.ts";
import { computeFrame, newFrameState } from "./frame.ts";
import { surfaceFor, footstepGate } from "./surface.ts";

const near = (a: number, b: number, tol: number, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (±${tol})`);

// ---- flag / prefs
test("prefs: defaults, clamping, corrupt JSON", () => {
  const d = defaultPrefs(false);
  assert.equal(d.statureM, 1.75);
  assert.equal(d.hFovDeg, 90);
  assert.equal(d.sensitivity, 0.11);
  assert.equal(d.bob, 0.5);
  assert.equal(d.vignette, "off");
  assert.equal(defaultPrefs(true).vignette, "auto");
  const c = sanitizePrefs({ statureM: 3, hFovDeg: 10, sensitivity: 9, bob: -1, snapTurnDeg: 17, vignette: "x" }, d);
  assert.equal(c.statureM, 2);
  assert.equal(c.hFovDeg, 70);
  assert.equal(c.sensitivity, 0.3);
  assert.equal(c.bob, 0);
  assert.equal(c.snapTurnDeg, 0);
  assert.equal(c.vignette, "off");
  assert.equal(parsePrefs("{nope").statureM, 1.75);
  assert.equal(parsePrefs(JSON.stringify({ v: 2, statureM: 1.9 })).statureM, 1.75);
  assert.equal(effectiveBob(d, true), 0);
  assert.equal(effectiveBob(d, false), 0.5);
});
test("flag: ?fp=0 always wins; dev needs ?fp=1 or saved; off never", () => {
  assert.equal(fpAllowedFrom("on", "?fp=0", { enabled: true }).allowed, false);
  assert.equal(fpAllowedFrom("dev", "?fp=0", { enabled: true }).allowed, false);
  assert.equal(fpAllowedFrom("off", "?fp=1", { enabled: true }).allowed, false);
  assert.equal(fpAllowedFrom("dev", "", { enabled: false }).allowed, false);
  assert.deepEqual(fpAllowedFrom("dev", "?fp=1", { enabled: false }), { allowed: true, persistEnable: true });
  assert.equal(fpAllowedFrom("dev", "", { enabled: true }).allowed, true);
  assert.equal(fpAllowedFrom("on", "", { enabled: false }).allowed, true);
});

// ---- rig
test("rig: eye round trip at Port Harcourt and London", () => {
  for (const [lat, lng] of [[4.8156, 7.0134], [51.5, -0.12]]) {
    for (const [yaw, pu, H, fov] of [[0, -6, 1080, 58.7], [137, 30, 844, 72], [-170, -60, 1366, 52], [90, 70, 3000, 50]]) {
      const eye = { lng, lat, altM: 12.65 };
      const cam = fpCamera(eye, yaw, pu, fov, H);
      const back = eyeOfFp(cam, H, fov);
      const dx = (back.lng - lng) * 111320 * Math.cos((lat * Math.PI) / 180);
      const dy = (back.lat - lat) * 111320;
      assert.ok(Math.hypot(dx, dy) < 0.001, `horiz ${Math.hypot(dx, dy)}`);
      near(back.altM, 12.65, 0.001, "alt");
      near(back.pitchUpDeg, pu, 0.01, "pitch");
      near(((back.yawDeg - yaw) % 360 + 540) % 360 - 180, 0, 0.01, "yaw");
      assert.ok(cam.zoom <= 24, `zoom ${cam.zoom}`);
    }
  }
});
test("rig: default gaze is map pitch 84; eye 1.65 from 1.75 m", () => {
  assert.equal(fpCamera({ lng: 7, lat: 4.8, altM: 1.65 }, 0, -6, 58.7, 1080).pitch, 84);
  assert.equal(posture("stand", 1.75).eyeM, 1.65);
  assert.equal(posture("wheelchair").eyeM, 1.2);
});
test("rig: fpFov", () => {
  near(fpFov(1920, 1080), 58.7, 0.2);
  assert.equal(fpFov(390, 844), 72);
  const t = fpFov(1366, 1024);
  assert.ok(t >= 50 && t <= 65);
  const p = fpFov(1024, 1366);
  assert.ok(p >= 62 && p <= 72);
  assert.ok(fpFov(1920, 1080, 90, 3.5) - fpFov(1920, 1080) <= 4);
  assert.equal(fpFov(1920, 1080, 90, 3.5, true), fpFov(1920, 1080));
  assert.ok(fpCamera({ lng: 7, lat: 4.8, altM: 2 }, 0, 0, 50, 3000).zoom <= 24);
});

// ---- gait
const walk = (s = newGait(), secs: number, mag = 1, run = false) => {
  let steps = 0, metres = 0, st = s;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    const r = stepGait(st, dt, { mag, run, kind: "residential", posture: "stand", statureM: 1.75 });
    st = r.state; steps += r.steps.length; metres += r.metres;
  }
  return { st, steps, metres };
};
test("gait: cadence, step count, distance, accel/decel", () => {
  const warm = walk(undefined, 2).st;
  const r = walk(warm, 10);
  const cadence = r.steps / 10;
  assert.ok(cadence >= 1.8 && cadence <= 2.1, `cadence ${cadence}`);
  const m = walk(undefined, 60);
  near(m.steps, m.metres / stepLength(1.75, 1.4), 1.01, "steps");
  const three = walk(undefined, 3);
  assert.ok(three.metres >= 3.4 && three.metres <= 4.6, `3s ${three.metres}`);
  const up = walk(undefined, 0.6);
  near(up.st.speed, 1.4, 1e-9, "accel");
  const down = walk({ ...warm }, 0.35, 0);
  assert.equal(down.st.speed, 0);
});
test("gait: bob amplitude, zero at bob 0, trough at step event", () => {
  let st = walk(undefined, 2).st;
  let maxY = 0, lastEvent = -1, troughT = -1, minY = 0;
  const dt = 1 / 240;
  for (let i = 0; i < 240 * 2; i++) {
    const r = stepGait(st, dt, { mag: 1, run: false, kind: "x", posture: "stand", statureM: 1.75 });
    st = r.state;
    const b = bobOffsets(st, 0.5, 1.75);
    maxY = Math.max(maxY, Math.abs(b.y));
    if (r.steps.length) { lastEvent = i * dt; minY = 0; }
    if (lastEvent >= 0 && b.y < minY) { minY = b.y; troughT = i * dt; }
    const z = bobOffsets(st, 0, 1.75);
    assert.deepEqual(z, { y: 0, x: 0, pitchDeg: 0, rollDeg: 0 });
    if (lastEvent >= 0 && i * dt - lastEvent > 0.2 && i * dt - lastEvent < 0.21) near(troughT, lastEvent, 0.04, "trough");
  }
  assert.ok(maxY <= 0.025, `bob ${maxY}`);
});

// ---- limits
test("limits: pitch caps, ease, ground spring, clearance", () => {
  assert.deepEqual(pitchLimits("A"), { min: -70, max: 70 });
  assert.deepEqual(pitchLimits("C"), { min: -60, max: 35 });
  let l = { min: -70, max: 70 };
  for (let i = 0; i < 19; i++) l = easeLimits(l, pitchLimits("C"), 1 / 60);
  assert.ok(l.max <= 35.001 && l.min >= -60.001);
  let s = { y: 0, v: 0 }, peak = 0, maxV = 0, minV = 0;
  for (let i = 0; i < 180; i++) { s = groundSpring(s, 0.2, 1 / 60); peak = Math.max(peak, s.y); maxV = Math.max(maxV, s.v); }
  assert.ok(peak - 0.2 <= 0.02, `overshoot ${peak}`);
  s = { y: 0, v: 0 };
  for (let i = 0; i < 60; i++) { s = groundSpring(s, 50, 1 / 60); maxV = Math.max(maxV, s.v); }
  s = { y: 50, v: 0 };
  for (let i = 0; i < 60; i++) { s = groundSpring(s, 0, 1 / 60); minV = Math.min(minV, s.v); }
  assert.ok(maxV <= 1.2 + 1e-9 && minV >= -2 - 1e-9);
  assert.equal(clampEye(0.1, 0, 1.65), 0.3);
});

// ---- footprints
const sq = (lat: number, lng: number, m: number) => {
  const dl = m / 111320, dg = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lng, lat], [lng + dg, lat], [lng + dg, lat + dl], [lng, lat + dl], [lng, lat]] as [number, number][];
};
test("footprints: push-out, wall slide, concave L", () => {
  const lat = 4.8156, lng = 7.0134;
  const idx = new FootprintIndex();
  idx.load([sq(lat, lng, 10)], lat);
  const dg = 1 / (111320 * Math.cos((lat * Math.PI) / 180)), dl = 1 / 111320;
  const p = idx.pushOut(lng + 2 * dg, lat + 5 * dl);
  assert.ok(p.pushed && !idx.insideAny(p.lng, p.lat));
  near((p.lng - lng) / dg, -0.25, 0.01, "left edge");
  near((p.lat - lat) / dl, 5, 0.01, "tangent kept");
  const slide = idx.pushOut(lng + 0.1 * dg, lat + 7 * dl);
  near((slide.lat - lat) / dl, 7, 0.01, "slide");
  const L: [number, number][] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]].map(([x, y]) => [lng + x * dg, lat + y * dl]);
  idx.load([L], lat);
  assert.equal(idx.insideAny(lng + 2 * dg, lat + 8 * dl), true);
  assert.equal(idx.insideAny(lng + 8 * dg, lat + 8 * dl), false);
  assert.equal(idx.insideAny(lng + 8 * dg, lat + 2 * dl), true);
  assert.equal(ringsFromFeatures([{ geometry: { type: "MultiPolygon", coordinates: [[L]] } }, { geometry: { type: "Point", coordinates: [0, 0] } }], { lng, lat }).length, 1);
});

// ---- look
test("look: mouse, invertY, clamps, snap turn, pad dead zone", () => {
  const m = new LookMixer();
  m.set(0, 0);
  m.applyMouse(200, 0, { sensitivity: 0.11, invertY: false });
  near(m.output().yaw, 22, 1e-9);
  m.applyMouse(0, -100, { sensitivity: 0.11, invertY: false });
  near(m.output().pitchUp, 11, 1e-9);
  m.applyMouse(0, -100, { sensitivity: 0.11, invertY: true });
  near(m.output().pitchUp, 0, 1e-9);
  m.applyMouse(0, -10000, { sensitivity: 0.11, invertY: false });
  assert.equal(m.output().pitchUp, 70);
  m.set(10, 0);
  m.applyTurn(1, 0.016, 30);
  assert.equal(m.yaw, 30);
  m.applyTurn(1, 0.016, 30);
  assert.equal(m.yaw, 60);
  const y0 = m.yaw;
  m.applyPad(0.1, 0.1, 1);
  assert.equal(m.yaw, y0);
  m.applyPad(1, 0, 1);
  near(m.yaw - y0, 140, 1e-9);
  m.setGyro(200, 10);
  near(m.yaw, y0 + 140, 1e-9, "gyro no jump");
});
test("1€ filter: attenuates jitter, bounded lag, unwrap", () => {
  const f = new OneEuro();
  let maxDev = 0;
  for (let i = 0; i < 600; i++) { const v = f.filter(10 + (i % 2 ? 0.5 : -0.5), i / 60); if (i > 60) maxDev = Math.max(maxDev, Math.abs(v - 10)); }
  assert.ok(maxDev < 0.2, `jitter ${maxDev}`);
  const g = new OneEuro();
  let v = 0;
  for (let i = 0; i < 60; i++) v = g.filter(i < 6 ? 0 : 30, i / 60);
  assert.ok(v > 25, `lag ${v}`);
  assert.equal(unwrapDeg(179, -179), 181);
});

// ---- handoff
const A: Pose = { lng: 7, lat: 4.8, altM: 16, yawDeg: 170, pitchUpDeg: -50, vFovDeg: 46 };
const B: Pose = { lng: 7.0001, lat: 4.8001, altM: 1.65, yawDeg: -170, pitchUpDeg: -6, vFovDeg: 58.7 };
test("handoff: ends, arc, short yaw, sprite", () => {
  assert.deepEqual(blendPose(A, B, 0), A);
  const e = blendPose(A, B, 1);
  near(e.altM, B.altM, 1e-9); near(e.lng, B.lng, 1e-12);
  const mid = blendPose(A, B, 0.5);
  assert.ok(mid.altM - (A.altM + B.altM) / 2 <= 0.5);
  assert.ok(Math.abs(mid.yawDeg - 180) < 1, `yaw ${mid.yawDeg}`);
  assert.equal(spriteOpacity(0.5), 1); assert.equal(spriteOpacity(0.8), 0);
});
test("handoff: reversal is continuous; reduced is one step", () => {
  const h = new Handoff();
  h.start(A, () => B);
  let prev = A;
  for (let i = 0; i < 16; i++) prev = h.step(16).pose;
  h.reverse();
  const nx = h.step(16).pose;
  const dm = Math.hypot((nx.lng - prev.lng) * 111320, (nx.lat - prev.lat) * 111320, nx.altM - prev.altM);
  assert.ok(dm < 0.01, `jump ${dm}`);
  assert.ok(Math.abs(nx.pitchUpDeg - prev.pitchUpDeg) < 0.5 && Math.abs(nx.yawDeg - prev.yawDeg) < 0.5);
  const r = new Handoff();
  r.start(A, () => B, 650, true);
  assert.equal(r.step(16).done, true);
});
test("handoff: thirdPose matches the street camera eye", () => {
  const p = thirdPose({ lng: 7.0134, lat: 4.8156 }, 30, { height: 844, fov: 60, maxPitch: 85, maxZoom: 23.5, person: "third" }, 10);
  assert.ok(p.altM > 10 && p.altM < 10 + 20);
  near(p.pitchUpDeg, -50, 1e-9);
});
test("comfort: vignette", () => {
  assert.equal(vignetteStrength(500, 0, "off"), 0);
  near(vignetteStrength(60, 0, "auto"), 0.125, 1e-9);
  assert.equal(vignetteStrength(1000, 10, "strong"), 0.4);
});

// ---- controller pure frame
test("frame: walking 3 s moves 3.4-4.6 m at eye 1.65 and pitch 84", () => {
  let st = newFrameState({ lng: 7.0134, lat: 4.8156 }, 0, 5);
  let out;
  for (let i = 0; i < 180; i++) {
    out = computeFrame(st, { move: { x: 0, y: 1 }, run: false, kind: "residential", groundM: 5, prefs: { statureM: 1.75, bob: 0 }, viewport: { w: 1920, h: 1080 }, reduced: false, tier: "A" }, 1 / 60);
    st = out.state;
  }
  const d = (st.pos.lat - 4.8156) * 111320;
  assert.ok(d >= 3.4 && d <= 4.6, `moved ${d}`);
  near(st.eye.altM - 5, 1.65, 0.03, "eye");
  assert.equal(out!.cam.pitch, 84);
});
test("surfaces + gating", () => {
  assert.equal(surfaceFor("residential"), "asphalt");
  assert.equal(surfaceFor("footway"), "laterite");
  assert.equal(surfaceFor("footway", true), "concrete");
  assert.equal(surfaceFor("steps"), "concrete");
  assert.equal(surfaceFor(""), "grass");
  assert.equal(footstepGate({ sound: true, footsteps: true, active: true }), true);
  assert.equal(footstepGate({ sound: false, footsteps: true, active: true }), false);
  assert.equal(footstepGate({ sound: true, footsteps: false, active: true }), false);
});

// ---- mobile look (FPXR-11)
import { quatFromDeviceOrientation, yawPitchFromQuat } from "./look/gyro.ts";
import { touchDegPerPx } from "./look/touch.ts";
test("gyro: upright portrait looks at the horizon; turning about vertical turns yaw; landscape compensates", () => {
  const up = yawPitchFromQuat(quatFromDeviceOrientation(0, 90, 0, 0));
  near(up.yaw, 0, 1e-6, "yaw"); near(up.pitch, 0, 1e-6, "pitch");
  const turned = yawPitchFromQuat(quatFromDeviceOrientation(270, 90, 0, 0));
  near(Math.abs(turned.yaw), 90, 1e-6, "turned");
  const tilt = yawPitchFromQuat(quatFromDeviceOrientation(0, 120, 0, 0));
  near(tilt.pitch, 30, 1e-6, "tilt up");
  // landscape (screen 90°, device rolled -90°): still the horizon, no yaw jump
  const land = yawPitchFromQuat(quatFromDeviceOrientation(0, 0, -90, 90));
  near(land.pitch, 0, 1e-6, "landscape pitch");
});
test("touch: 1:1 deg per px", () => {
  near(touchDegPerPx(72, 844), 72 / 844, 1e-12);
  near(touchDegPerPx(60, 600, 2), 0.2, 1e-12);
});
