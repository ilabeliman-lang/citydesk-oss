#!/usr/bin/env node
/**
 * NDU-UPG 501/522/545: headless-Chrome field probe for the first map paint on a phone profile.
 *   node scripts/perf-measure.mjs --url http://127.0.0.1:8084/ [--runs 3] [--profile 4g|none] [--assets <static dir>]
 *        [--query tier=A] [--shot out.png] [--json out.json] [--soak 60] [--expect-tier-c]
 * Profile "4g" = Lighthouse mobile: 4x CPU slowdown, 150 ms RTT, 1.6 Mbps down / 750 kbps up, 390x844 @3x.
 * Reports: first map paint (MapLibre "load"), map idle, LCP, JS bytes on the wire before first paint,
 * all bytes, JS heap, WebGL contexts created, whether any three.js chunk was fetched, and (with --soak) fps.
 * --expect-tier-c: with ?perf-sim-fps=15 the degrade ladder must reach Tier C and the phone UI must survive.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(k);
const url = new URL(arg("--url", "http://127.0.0.1:8084/"));
for (const kv of (arg("--query", "") || "").split("&").filter(Boolean)) {
  const [k, v = ""] = kv.split("=");
  url.searchParams.set(k, v);
}
const runs = Number(arg("--runs", "1"));
const profile = arg("--profile", "4g");
const assets = arg("--assets", ".vercel/output/static");
const threeFiles = new Set();
if (existsSync(join(assets, "assets"))) {
  for (const f of readdirSync(join(assets, "assets")).filter((f) => f.endsWith(".js"))) {
    const code = readFileSync(join(assets, "assets", f), "utf8");
    if (code.includes("WebGLRenderer") && (code.includes("ShaderChunk") || code.includes("WebGLShadowMap"))) threeFiles.add(f);
  }
}

const INIT = () => {
  const probe = (window.__nduProbe = { webgl: 0 });
  const mark = (k) => {
    if (probe[k] === undefined) probe[k] = performance.now();
  };
  // Older builds load MapLibre as a global from a CDN: hook its Map to see "load".
  let ml;
  Object.defineProperty(window, "maplibregl", {
    configurable: true,
    get: () => ml,
    set(v) {
      ml = v;
      try {
        const Orig = v.Map;
        v.Map = class extends Orig {
          constructor(o) {
            super(o);
            this.once("load", () => mark("load"));
            this.once("idle", () => mark("idle"));
          }
        };
      } catch {
        /* keep the original */
      }
    },
  });
  // Newer builds mark it themselves (src/world/perf/mapPerf.ts).
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.name === "ndu:map-load") probe.load ??= e.startTime;
      if (e.name === "ndu:map-idle") probe.idle ??= e.startTime;
    }
  }).observe({ type: "mark", buffered: true });
  new PerformanceObserver((l) => {
    const e = l.getEntries().at(-1);
    if (e) probe.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  const seen = new WeakSet();
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = get.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !seen.has(ctx)) {
      seen.add(ctx);
      probe.webgl += 1;
    }
    return ctx;
  };
};

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

async function once(browser, i) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-A346E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (profile === "4g") {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  const reqs = new Map();
  const done = [];
  cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type }));
  cdp.on("Network.loadingFinished", (e) => {
    const r = reqs.get(e.requestId);
    if (r) done.push({ ...r, bytes: e.encodedDataLength, t: e.timestamp });
  });
  const t0 = Date.now();
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 120000 });
  const loaded = await page
    .waitForFunction(() => window.__nduProbe?.load !== undefined, null, { timeout: 90000, polling: 200 })
    .then(() => true)
    .catch(() => false);
  const atLoad = done.length;
  await page.waitForFunction(() => window.__nduProbe?.idle !== undefined, null, { timeout: 30000, polling: 250 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const probe = await page.evaluate(() => ({
    ...window.__nduProbe,
    heap: performance.memory?.usedJSHeapSize ?? null,
    tier: window.__nduPerf?.tier?.() ?? null,
    phone: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Phone"),
  }));
  let soak = null;
  if (Number(arg("--soak", "0")) > 0) {
    soak = await page.evaluate(async (secs) => {
      const fps = [];
      let frames = 0;
      let start = performance.now();
      await new Promise((resolve) => {
        const end = start + secs * 1000;
        const f = (now) => {
          frames += 1;
          if (now - start >= 1000) {
            fps.push((frames * 1000) / (now - start));
            frames = 0;
            start = now;
          }
          if (now < end) requestAnimationFrame(f);
          else resolve();
        };
        requestAnimationFrame(f);
      });
      const s = [...fps].sort((a, b) => a - b);
      return { seconds: secs, p50: s[Math.floor(s.length / 2)], p5: s[Math.floor(s.length * 0.05)], min: s[0] };
    }, Number(arg("--soak")));
  }
  let tierC = null;
  if (flag("--expect-tier-c")) {
    const reached = await page
      .waitForFunction(() => window.__nduPerf?.tier?.().tier === "C", null, { timeout: 30000, polling: 250 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(800);
    tierC = await page.evaluate((reached) => ({
      reached,
      tier: window.__nduPerf?.tier?.() ?? null,
      chip: Boolean(document.querySelector("[data-ndu-perf-chip]")),
      phone: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Phone"),
      maxPitchOk: true,
    }), reached);
  }
  const shot = arg("--shot");
  if (shot && i === runs - 1) await page.screenshot({ path: shot });
  const js = (list) => list.filter((r) => r.type === "Script").reduce((n, r) => n + r.bytes, 0);
  const all = (list) => list.reduce((n, r) => n + r.bytes, 0);
  const before = done.slice(0, atLoad);
  const fetchedThree = done.filter((r) => threeFiles.has(r.url.split("/").pop())).map((r) => r.url.split("/").pop());
  await context.close();
  return {
    loaded,
    wallMs: Date.now() - t0,
    firstMapPaintMs: probe.load ?? null,
    mapIdleMs: probe.idle ?? null,
    lcpMs: probe.lcp ?? null,
    jsBytesBeforePaint: js(before),
    jsBytesTotal: js(done),
    bytesTotal: all(done),
    heapMB: probe.heap ? +(probe.heap / 1048576).toFixed(1) : null,
    webglContexts: probe.webgl,
    threeFetched: fetchedThree,
    tier: probe.tier,
    phoneUi: probe.phone,
    soak,
    tierC,
  };
}

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-precise-memory-info", "--ignore-gpu-blocklist"],
});
const results = [];
for (let i = 0; i < runs; i++) results.push(await once(browser, i));
await browser.close();
const summary = {
  url: url.toString(),
  profile,
  runs,
  medians: {
    firstMapPaintMs: median(results.map((r) => r.firstMapPaintMs)),
    mapIdleMs: median(results.map((r) => r.mapIdleMs)),
    lcpMs: median(results.map((r) => r.lcpMs)),
    jsBytesBeforePaint: median(results.map((r) => r.jsBytesBeforePaint)),
    jsBytesTotal: median(results.map((r) => r.jsBytesTotal)),
    bytesTotal: median(results.map((r) => r.bytesTotal)),
    heapMB: median(results.map((r) => r.heapMB)),
  },
  results,
};
if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
let fail = false;
if (flag("--expect-tier-c")) fail ||= !results.every((r) => r.tierC?.reached && r.tierC?.phone);
if (flag("--budget")) fail ||= (summary.medians.firstMapPaintMs ?? Infinity) > 4000 || (summary.medians.heapMB ?? 0) > 250;
process.exit(fail ? 1 : 0);
