#!/usr/bin/env node
/**
 * NDU-UPG #393: end-to-end check against a running preview (throwaway DB, auth off):
 * upload the USDZ fixture -> pipeline converts/validates/optimises -> map draws the GLB.
 * Also uploads a broken GLB to show the error card. Screenshots to $SHOTS_DIR.
 *   BASE_URL=http://127.0.0.1:8085 SHOTS_DIR=/tmp/shots node scripts/scan/e2e-preview.mjs [mobile|desktop]
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.BASE_URL ?? "http://127.0.0.1:8085";
const shots = process.env.SHOTS_DIR ?? path.join(os.tmpdir(), "ndu-scan-shots");
const mode = process.argv[2] ?? "mobile";
const viewport = mode === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport, deviceScaleFactor: mode === "desktop" ? 1 : 2, hasTouch: mode !== "desktop" });
const log = [];
page.on("console", (m) => m.type() === "error" && log.push(m.text()));
const served = [];
page.on("response", (r) => {
  if (/\/api\/scans\/[0-9a-f-]{36}/.test(r.url())) served.push({ status: r.status(), type: r.headers()["content-type"], etag: r.headers()["etag"] ?? null });
});
const shot = (name) => page.screenshot({ path: path.join(shots, `scan-${mode}-${name}.png`) });

await page.goto(base, { waitUntil: "domcontentloaded", timeout: 120000 });
const scansBtn = page.getByRole("button", { name: "Scans", exact: true });
await scansBtn.waitFor({ timeout: 120000 });
await page.waitForTimeout(4000);
await scansBtn.click();
const input = page.locator('input[type="file"]');
const results = {};

if (mode !== "desktop") {
  // 1) USDZ fixture (Z-up, centimetres) -> converted GLB on the map
  await input.setInputFiles(path.join(here, "fixtures", "room-zcm.usdz"));
  await page.getByRole("button", { name: "Save spot" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Save spot" }).click();
  await page.locator('[data-scan-status="queued"], [data-scan-status="converting"], [data-scan-status="ready"]').first().waitFor({ timeout: 30000 });
  await shot("1-converting");
  await page.locator('[data-scan-status="ready"]').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(2500);
  await shot("2-ready-list");
  // 2) a broken GLB (right header, wrong body) -> error card with reason + Retry
  const junk = Buffer.concat([Buffer.from("glTF"), Buffer.from([2, 0, 0, 0, 20, 0, 0, 0]), Buffer.alloc(8)]);
  await input.setInputFiles({ name: "broken.glb", mimeType: "model/gltf-binary", buffer: junk });
  await page.getByRole("button", { name: "Cancel" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator('[data-scan-status="failed"]').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  await shot("3-error-card");
  // fly to the converted model and zoom in
  await page.getByRole("button", { name: "Go", exact: true }).first().click();
}
// close the panel and look at the drawn model
await page.getByRole("button", { name: "Close" }).click().catch(() => undefined);
await page.waitForTimeout(1500);
if (mode !== "desktop") {
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
  }
}
await page.waitForTimeout(3000);
await shot(mode === "desktop" ? "desktop-map" : "4-map-drawn");
await scansBtn.click().catch(() => undefined);
await page.waitForTimeout(1500);
await shot(mode === "desktop" ? "desktop-panel" : "5-panel");
results.chips = await page.locator("[data-scan-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-scan-status")));
results.served = served; // the map's GLB fetch: model/gltf-binary once optimised
results.errors = log.slice(0, 10);
await writeFile(path.join(shots, `scan-${mode}-result.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
await browser.close();
