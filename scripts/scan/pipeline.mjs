#!/usr/bin/env node
// @ts-check
/**
 * NDU scan pipeline (CPU only). One uploaded file in, a validated + optimised GLB out.
 *   #351 USDZ -> GLB (usd-core + usd2gltf, via usdz_to_glb.py), Z-up/units fixed here
 *   #353 Khronos glTF-Validator on every model; errors reject it, the report JSON is kept
 *   #354/#379 magic bytes + zip guard (sniff.mjs)
 *   #355 gltf-transform: dedup, prune, weld, simplify to the preset budget, textures to
 *        WebP <= 1024 px (sharp), meshopt compression
 *   #360 scale sanity, #371 metadata strip, #373 material clamps, #380/#381 origin at the
 *        footprint centre on the floor (offset recorded), #400 presets.json
 * The raw upload is never touched (#356): output goes to new files beside it.
 *
 * CLI (used by the job runner, so heavy work never blocks the web server):
 *   node scripts/scan/pipeline.mjs --in <file> --format <glb|gltf|usdz> --out-dir <dir> --base <id> [--python <py>]
 * Prints one JSON line. Exit 0 ok, 2 rejected (permanent, has `reason`), 1 crashed (retry).
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { sniffFormat, inspectZip, SNIFF_BYTES } from "./sniff.mjs";
import { applyScale, cleanupOptions, compress, dropDegenerate, guessUnits, removeFloaters } from "./cleanup.mjs"; // NDU-AI safe-ingest #3

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
export const PRESETS = JSON.parse(await readFile(path.join(here, "presets.json"), "utf8"));
const LIMITS = PRESETS.limits;

/** Thrown for files we refuse (bad file, not a server fault): no retry. */
export class Rejected extends Error {}

/** Default python: the tools venv beside the checkout (scripts/scan/setup-tools.sh), else python3. */
export function defaultPython() {
  if (process.env.SCAN_PYTHON?.trim()) return process.env.SCAN_PYTHON.trim();
  const venv = path.resolve(here, "..", "..", "..", ".ndu-scan-tools", "venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}

/** @param {import("@gltf-transform/core").Document} doc */
export function countStats(doc) {
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const n = prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0;
      const mode = prim.getMode();
      if (mode === 4) tris += Math.floor(n / 3);
      else if (mode === 5 || mode === 6) tris += Math.max(0, n - 2);
    }
  }
  return {
    tris,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
  };
}

/** World-space size [x, y, z] in metres of the default scene. */
async function sizeOf(doc) {
  const { getBounds } = await import("@gltf-transform/functions");
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  const { min, max } = getBounds(scene);
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d + 0; // + 0 turns -0 into 0
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

let ioPromise = null;
async function getIO() {
  ioPromise ??= (async () => {
    const { NodeIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const { MeshoptDecoder, MeshoptEncoder } = await import("meshoptimizer");
    const draco3d = (await import("draco3dgltf")).default;
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(), // NDU-AI safe-ingest #3 (SCAN_COMPRESS=draco)
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
  })();
  return ioPromise;
}

/** Khronos glTF-Validator; returns a trimmed report (counts + first 25 messages). */
export async function validate(bytes, uri) {
  const validator = (await import("gltf-validator")).default;
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri,
    maxIssues: 200,
    // a lone upload has nothing beside it: external files are an error, data: URIs are fine
    externalResourceFunction: (ref) => Promise.reject(new Error(`external resource ${ref} not allowed`)),
  });
  const issues = report.issues ?? {};
  return {
    validator: `${report.validatorVersion ?? "gltf-validator"}`,
    errors: issues.numErrors ?? 0,
    warnings: issues.numWarnings ?? 0,
    infos: issues.numInfos ?? 0,
    hints: issues.numHints ?? 0,
    messages: (issues.messages ?? []).slice(0, 25).map((m) => ({ code: m.code, severity: m.severity, message: m.message, pointer: m.pointer })),
    info: report.info
      ? { generator: report.info.generator ?? null, version: report.info.version, extensionsUsed: report.info.extensionsUsed ?? [], totalTriangleCount: report.info.totalTriangleCount ?? null }
      : null,
  };
}

/** USDZ -> GLB bytes through python (usd-core + usd2gltf). */
async function convertUsdz(file, python, tmp) {
  const guard = await inspectZip(file, { maxEntries: LIMITS.usdzMaxEntries, maxUncompressed: LIMITS.usdzMaxUncompressed });
  if (!guard.ok) throw new Rejected(guard.reason);
  const out = path.join(tmp, "converted.glb");
  let stdout = "";
  try {
    ({ stdout } = await run(python, [path.join(here, "usdz_to_glb.py"), file, out], { timeout: LIMITS.timeoutMs, maxBuffer: 4 << 20 }));
  } catch (err) {
    stdout = /** @type {{ stdout?: string }} */ (err).stdout ?? "";
    const last = stdout.trim().split("\n").pop() ?? "";
    let parsed = null;
    try {
      parsed = JSON.parse(last);
    } catch {
      // python missing or crashed hard
    }
    if (parsed?.reason && /** @type {{ code?: number }} */ (err).code === 2) throw new Rejected(parsed.reason);
    throw new Error(parsed?.reason ?? `USDZ converter unavailable (${/** @type {Error} */ (err).message.slice(0, 120)})`);
  }
  const info = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
  return { bytes: await readFile(out), upAxis: info.upAxis === "Z" ? "Z" : "Y", metersPerUnit: Number(info.metersPerUnit) || 1 };
}

/**
 * @param {{ input: string, format?: string, outDir: string, base: string, python?: string, cleanup?: Partial<import("./cleanup.mjs").CleanupOptions> }} opts
 */
export async function processScan(opts) {
  const { dedup, prune, weld, simplify, center, textureCompress } = await import("@gltf-transform/functions");
  const { MeshoptSimplifier } = await import("meshoptimizer");
  const clean = { ...cleanupOptions(), ...opts.cleanup }; // NDU-AI safe-ingest #3
  await MeshoptSimplifier.ready;
  const raw = await readFile(opts.input);
  const sniffed = sniffFormat(raw.subarray(0, SNIFF_BYTES), raw.length, opts.format);
  if (!sniffed) throw new Rejected("This file is not a 3D scan we can read.");
  if (opts.format && sniffed !== opts.format) throw new Rejected(`The file name says .${opts.format} but the file is ${sniffed.toUpperCase()}.`);
  if (!["glb", "gltf", "usdz"].includes(sniffed)) throw new Rejected(`${sniffed.toUpperCase()} files are stored and pinned; drawing them is not ready yet.`);

  const tmp = await mkdtemp(path.join(os.tmpdir(), "ndu-scan-"));
  try {
    let bytes = raw;
    let upAxis = "Y";
    let metersPerUnit = 1;
    let converter = null;
    if (sniffed === "usdz") {
      const got = await convertUsdz(opts.input, opts.python ?? defaultPython(), tmp);
      ({ bytes, upAxis, metersPerUnit } = got);
      converter = "usd-core+usd2gltf";
    }
    const report = await validate(bytes, sniffed === "gltf" ? "scan.gltf" : "scan.glb");
    const reportFile = `${opts.base}.report.json`;
    await writeFile(path.join(opts.outDir, reportFile), JSON.stringify({ ...report, checkedAt: new Date().toISOString(), source: sniffed }, null, 2), { mode: 0o600 });
    if (report.errors > 0) {
      const first = report.messages.find((m) => m.severity === 0)?.message ?? "invalid glTF";
      throw new Rejected(`This model has ${report.errors} glTF error${report.errors === 1 ? "" : "s"} (${first}).`);
    }

    const io = await getIO();
    const { Logger } = await import("@gltf-transform/core");
    const quiet = new Logger(Logger.Verbosity.WARN); // stdout carries only the JSON result
    io.setLogger(quiet);
    const doc = sniffed === "gltf" ? await io.readJSON({ json: JSON.parse(bytes.toString("utf8")), resources: {} }) : await io.readBinary(new Uint8Array(bytes));
    doc.setLogger(quiet);
    const root = doc.getRoot();
    const before = { ...countStats(doc), bytes: raw.length };

    // #351 USD up-axis and units -> glTF Y-up metres (a parent node; meshes untouched)
    if (upAxis === "Z" || metersPerUnit !== 1) {
      const scene = root.getDefaultScene() ?? root.listScenes()[0];
      if (scene) {
        const holder = doc.createNode("ndu-usd-fix").setScale([metersPerUnit, metersPerUnit, metersPerUnit]);
        if (upAxis === "Z") holder.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
        for (const child of scene.listChildren()) holder.addChild(child);
        scene.addChild(holder);
      }
    }
    // #371 strip metadata: extras can carry device names, GPS, app ids
    for (const prop of [root, ...root.listNodes(), ...root.listMeshes(), ...root.listMaterials(), ...root.listTextures(), ...root.listScenes(), ...root.listAccessors(), ...root.listAnimations(), ...root.listCameras(), ...root.listSkins()]) prop.setExtras({});
    root.getAsset().generator = "NDU scan pipeline";
    // #373 material sanity
    for (const mat of root.listMaterials()) {
      mat.setRoughnessFactor(clamp01(mat.getRoughnessFactor()));
      mat.setMetallicFactor(clamp01(mat.getMetallicFactor()));
      mat.setBaseColorFactor(/** @type {[number, number, number, number]} */ (mat.getBaseColorFactor().map(clamp01)));
    }
    // decoded Draco data is re-encoded with meshopt (#366)
    for (const ext of root.listExtensionsUsed()) if (ext.extensionName === "KHR_draco_mesh_compression") ext.dispose();

    // #360 scale sanity
    const { size: rawSize } = await sizeOf(doc);
    let side = Math.max(...rawSize);
    if (!(side > 0)) throw new Rejected("This model has no visible geometry.");
    // NDU-AI safe-ingest #3: a cm / mm / inch export is rescaled to metres instead of being refused
    const unitFix = clean.autoUnits ? guessUnits(side, LIMITS) : null;
    if (unitFix) {
      applyScale(doc, unitFix.factor);
      side *= unitFix.factor;
    }
    if (side > LIMITS.maxSideM) throw new Rejected(`This model is ${Math.round(side)} m across. Check the export units (metres expected).`);
    if (side < LIMITS.minSideM) throw new Rejected(`This model is only ${(side * 100).toFixed(1)} cm across. Check the export units (metres expected).`);

    const presetName = side <= PRESETS.presets.prop.maxSideM ? "prop" : side <= PRESETS.presets.room.maxSideM ? "room" : "building";
    const preset = PRESETS.presets[presetName];
    await doc.transform(dedup(), prune(), weld());
    // NDU-AI safe-ingest #3: degenerate triangles always go; floaters only with SCAN_DENOISE=on
    const degenerate = dropDegenerate(doc);
    const floaters = clean.denoise ? removeFloaters(doc) : null;
    if (degenerate || floaters?.tris) await doc.transform(prune());
    const welded = countStats(doc);
    let simplified = false;
    if (welded.tris > preset.maxTris) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: preset.maxTris / welded.tris, error: preset.simplifyError }));
      simplified = true;
      if (countStats(doc).tris > preset.maxTris) {
        await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: preset.maxTris / countStats(doc).tris, error: 0.05 }));
      }
    }
    // #380/#381 origin at footprint centre, floor at y=0; the offset is kept for re-placing
    const pre = await sizeOf(doc);
    const offset = [-(pre.min[0] + pre.max[0]) / 2, -pre.min[1], -(pre.min[2] + pre.max[2]) / 2].map((v) => round(v));
    await doc.transform(center({ pivot: "below" }));
    if (root.listTextures().length) {
      const sharp = (await import("sharp")).default;
      await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [preset.textureMax, preset.textureMax] }));
    }
    const after = countStats(doc);
    const { size } = await sizeOf(doc);
    const compression = await compress(doc, clean.compress); // NDU-AI safe-ingest #3: meshopt (default) or Draco
    const out = Buffer.from(await io.writeBinary(doc));
    const outReport = await validate(out, "optimized.glb");
    if (outReport.errors > 0) throw new Error(`optimised file failed validation: ${outReport.messages[0]?.message ?? "unknown"}`);
    const sha256 = createHash("sha256").update(out).digest("hex");
    const file = `${opts.base}.opt.${sha256.slice(0, 12)}.glb`; // #367 content-hashed name
    await writeFile(path.join(opts.outDir, file), out, { mode: 0o600 });
    await chmod(path.join(opts.outDir, file), 0o600).catch(() => undefined);
    return {
      ok: true,
      format: sniffed,
      optimized: { file, bytes: out.length, sha256 },
      reportFile,
      validation: { errors: report.errors, warnings: report.warnings, infos: report.infos, hints: report.hints },
      stats: {
        before,
        after: { ...after, bytes: out.length },
        preset: presetName,
        budget: preset.maxTris,
        simplified,
        size: size.map((v) => round(v, 3)),
        offset,
        upAxis,
        metersPerUnit,
        converter,
        presetsVersion: PRESETS.version,
        cleanup: { unitFix: unitFix?.unit ?? null, degenerate, floaters, compression }, // NDU-AI safe-ingest #3
      },
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  try {
    if (!a.in || !a["out-dir"] || !a.base) throw new Error("usage: --in <file> --format <fmt> --out-dir <dir> --base <id>");
    await stat(a.in);
    const result = await processScan({ input: a.in, format: a.format, outDir: a["out-dir"], base: a.base, python: a.python });
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exit(0);
  } catch (err) {
    const rejected = err instanceof Rejected;
    process.stdout.write(JSON.stringify({ ok: false, permanent: rejected, reason: rejected ? err.message : `Processing failed: ${String(/** @type {Error} */ (err)?.message ?? err).slice(0, 200)}` }) + "\n");
    process.exit(rejected ? 2 : 1);
  }
}
