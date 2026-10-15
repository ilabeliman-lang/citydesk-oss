#!/usr/bin/env node
// NDU-FP (FPXR-10): first-person browser smoke. Local dev server only (default http://127.0.0.1:8080).
// Usage: node scripts/fp-smoke.mjs [baseUrl]. Prints a JSON verdict, exits 0 only when every check passes.
import { chromium } from "playwright";

const base = (process.argv[2] || process.env.FP_SMOKE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error(JSON.stringify({ ok: false, error: "local dev server only" }));
  process.exit(1);
}
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/map?fp=1&tier=A`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__nduFp), null, { timeout: 60000 });
  for (let i = 0; i < 3; i++) {
    const p = await page.getAttribute("[data-ndu-person]", "data-ndu-person");
    if (p === "first") break;
    await page.evaluate(() => document.querySelector("[data-ndu-person]")?.click()); // DOM click: headless GL is slow
    await page.waitForTimeout(400);
  }
  // 650 ms on a real GPU; headless software GL can run at ~1 fps, so wait for the phase instead of a clock
  await page.waitForFunction(() => window.__nduFp.state().phase === "active", null, { timeout: 90000 }).catch(() => undefined);
  let s = await page.evaluate(() => window.__nduFp.state());
  check("entered", s.active && s.phase === "active", s.phase);
  check("eye 1.65 ± 0.03", Math.abs(s.eyeAboveGroundM - 1.65) <= 0.03, s.eyeAboveGroundM);
  check("pitch 84 ± 1", Math.abs(s.mapPitch - 84) <= 1, s.mapPitch);
  check("vFOV 50..65 (landscape)", s.vFovDeg >= 50 && s.vFovDeg <= 65, s.vFovDeg);
  const y0 = s.yawDeg;
  await page.evaluate(() => window.__nduFp.look.mouseDelta(200, 0));
  await page.waitForTimeout(100);
  s = await page.evaluate(() => window.__nduFp.state());
  check("mouse 200 px -> +22° ± 1", Math.abs(s.yawDeg - y0 - 22) <= 1, s.yawDeg - y0);
  const a0 = s.avatar;
  await page.evaluate(() => window.__nduFp.probeKeys(["KeyW"]));
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
  await page.waitForFunction(() => window.__nduFp.state().speedMps >= 1.39, null, { timeout: 30000 }).catch(() => undefined);
  const sp = await page.evaluate(() => window.__nduFp.state().speedMps);
  await page.evaluate(() => window.__nduFp.probeKeys([]));
  s = await page.evaluate(() => window.__nduFp.state());
  check("walk speed 1.4 m/s", Math.abs(sp - 1.4) <= 0.05, sp);
  const moved = Math.hypot((s.avatar.lng - a0.lng) * 111320 * Math.cos((a0.lat * Math.PI) / 180), (s.avatar.lat - a0.lat) * 111320);
  // headless frame pacing varies; real walking speed is 1.4 m/s
  // distance is only meaningful at a real frame rate (CityBuildings caps a step at 50 ms)
  if (fps >= 30) check("3 s of W walks 3.4-4.6 m", moved >= 3.4 && moved <= 4.6, moved);
  else check("3 s of W walks (skipped: " + fps.toFixed(1) + " fps headless)", true, moved);
  const oracle = await page.evaluate(() => {
    // MapLibre's own idea of where the camera is, versus the eye FP asked for
    const map = window.__nduFollow?.map;
    const st = window.__nduFp.state();
    const tr = map?.transform;
    const ll = tr?.getCameraLngLat?.();
    const alt = tr?.getCameraAltitude?.();
    if (!ll || typeof alt !== "number") return null;
    return { dh: Math.hypot((ll.lng - st.eye.lng) * 111320 * Math.cos((st.eye.lat * Math.PI) / 180), (ll.lat - st.eye.lat) * 111320), dAlt: Math.abs(alt - st.eye.altM) };
  });
  check("MapLibre camera oracle (eye within 5 cm)", oracle && oracle.dh < 0.05 && oracle.dAlt < 0.05, oracle);
  await page.evaluate(() => document.querySelector("[data-ndu-person]")?.click());
  await page.waitForFunction(() => window.__nduFp.state().phase === "off", null, { timeout: 90000 }).catch(() => undefined);
  s = await page.evaluate(() => window.__nduFp.state());
  check("back to third person", !s.active, s.phase);

  const off = await ctx.newPage();
  const fpRequests = [];
  off.on("request", (r) => {
    if (/src\/world\/fp\/controller|fp-controller|controller-[\w-]+\.js/.test(r.url()) && /fp/.test(r.url())) fpRequests.push(r.url());
  });
  await off.goto(`${base}/map?fp=0`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await off.waitForTimeout(5000);
  check("?fp=0 never loads the fp controller", fpRequests.length === 0 && !(await off.evaluate(() => Boolean(window.__nduFp))), fpRequests);
} catch (err) {
  check("run", false, String(err?.message ?? err));
} finally {
  await browser.close();
}
const ok = checks.every((c) => c.ok);
console.log(JSON.stringify({ ok, base, checks }, null, 2));
process.exit(ok ? 0 : 1);
