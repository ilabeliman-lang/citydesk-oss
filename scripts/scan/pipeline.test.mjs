// NDU-UPG #357 (golden fixture), #354/#379 (sniff + zip guard), #351 (USDZ), #353/#355/#360, #378 (jobs).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, copyFile, readdir, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sniffFormat, inspectZip, SNIFF_BYTES } from "./sniff.mjs";
import { processScan, Rejected, defaultPython } from "./pipeline.mjs";
import { enqueueScan, drainJobs } from "./jobs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, "fixtures");
const GLB = path.join(FX, "smoke-room.glb");
const close = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

function hasUsd() {
  try {
    execFileSync(defaultPython(), ["-c", "import pxr, usd2gltf"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Tiny stored-zip writer for guard tests. */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const name of entries) {
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(n.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, n);
    central.push(cd, n);
    offset += 30 + n.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "ndu-scan-test-"));
});

describe("sniffFormat (#354)", () => {
  it("reads formats from bytes, not names", async () => {
    const glb = await readFile(GLB);
    assert.equal(sniffFormat(glb.subarray(0, SNIFF_BYTES), glb.length, "usdz"), "glb");
    const usdz = await readFile(path.join(FX, "room-y.usdz"));
    assert.equal(sniffFormat(usdz.subarray(0, SNIFF_BYTES), usdz.length), "usdz");
    assert.equal(sniffFormat(Buffer.from('  {"asset":{"version":"2.0"}}'), 30), "gltf");
    assert.equal(sniffFormat(Buffer.from("ply\nformat binary_little_endian 1.0\n"), 40), "ply");
    assert.equal(sniffFormat(Buffer.from([0x1f, 0x8b, 8, 0]), 4), "spz");
    assert.equal(sniffFormat(Buffer.alloc(64, 7), 64, "splat"), "splat");
    assert.equal(sniffFormat(Buffer.alloc(64, 7), 64, "glb"), null);
    assert.equal(sniffFormat(zip(["notes.txt"]).subarray(0, 64), 100), null, "a plain zip is not a USDZ");
  });
});

describe("inspectZip (#379)", () => {
  it("accepts the USDZ fixture", async () => {
    const got = await inspectZip(path.join(FX, "room-y.usdz"), { maxEntries: 10, maxUncompressed: 1 << 20 });
    assert.equal(got.ok, true);
  });
  it("refuses parent paths and too many entries", async () => {
    const evil = path.join(tmp, "evil.usdz");
    await writeFile(evil, zip(["scene.usdc", "../../etc/passwd"]));
    assert.equal((await inspectZip(evil, { maxEntries: 10, maxUncompressed: 1 << 20 })).ok, false);
    const many = path.join(tmp, "many.usdz");
    await writeFile(many, zip(Array.from({ length: 12 }, (_, i) => `f${i}.usdc`)));
    const res = await inspectZip(many, { maxEntries: 10, maxUncompressed: 1 << 20 });
    assert.equal(res.ok, false);
    assert.match(res.reason, /12 files/);
  });
});

describe("golden fixture smoke-room.glb (#357)", () => {
  it("validates and optimises to the expected tris / materials / bbox", async () => {
    const res = await processScan({ input: GLB, format: "glb", outDir: tmp, base: "golden" });
    assert.equal(res.ok, true);
    assert.equal(res.validation.errors, 0);
    assert.deepEqual(res.stats.before, { tris: 14, meshes: 1, materials: 3, textures: 0, bytes: 2872 });
    assert.equal(res.stats.after.tris, 14);
    assert.equal(res.stats.after.meshes, 1);
    // two of the three source materials are identical; dedup merges them
    assert.equal(res.stats.after.materials, 2);
    assert.equal(res.stats.preset, "room");
    assert.deepEqual(res.stats.size, [10, 9, 8]);
    assert.deepEqual(res.stats.offset, [-5, 0, -4]);
    assert.match(res.optimized.file, /^golden\.opt\.[0-9a-f]{12}\.glb$/);
    const files = await readdir(tmp);
    assert.ok(files.includes("golden.report.json"));
    // read the optimised GLB back (meshopt-compressed) and check it sits on the floor, centred
    const { NodeIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const { getBounds } = await import("@gltf-transform/functions");
    const { MeshoptDecoder } = await import("meshoptimizer");
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const doc = await io.read(path.join(tmp, res.optimized.file));
    const { min, max } = getBounds(doc.getRoot().getDefaultScene());
    assert.ok(close(min[1], 0) && close(max[1], 9), `y ${min[1]}..${max[1]}`);
    assert.ok(close(min[0], -5) && close(max[0], 5), `x ${min[0]}..${max[0]}`);
    assert.ok(close(min[2], -4) && close(max[2], 4), `z ${min[2]}..${max[2]}`);
    assert.ok(doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression"));
  });
});

describe("rejections (#353 #354 #360)", () => {
  it("refuses a renamed or broken file", async () => {
    await assert.rejects(processScan({ input: GLB, format: "usdz", outDir: tmp, base: "x1" }), Rejected);
    const junk = path.join(tmp, "junk.glb");
    await writeFile(junk, Buffer.concat([Buffer.from("glTF"), Buffer.from([2, 0, 0, 0, 20, 0, 0, 0]), Buffer.alloc(8)]));
    await assert.rejects(processScan({ input: junk, format: "glb", outDir: tmp, base: "x2" }), (e) => e instanceof Rejected && /glTF error/.test(e.message));
  });
  it("refuses absurd scale", async () => {
    const { NodeIO } = await import("@gltf-transform/core");
    const io = new NodeIO();
    const doc = await io.read(GLB);
    // NDU-AI safe-ingest #3: x100 is now read as a centimetre export and fixed, so use a scale no unit explains
    for (const node of doc.getRoot().listNodes()) node.setScale([1e6, 1e6, 1e6]);
    const big = path.join(tmp, "big.glb");
    await io.write(big, doc);
    await assert.rejects(processScan({ input: big, format: "glb", outDir: tmp, base: "x3" }), /m across/);
  });
});

describe("USDZ -> GLB (#351)", { skip: !hasUsd() && "usd-core venv missing (scripts/scan/setup-tools.sh)" }, () => {
  it("converts a Z-up centimetre USDZ into Y-up metres", async () => {
    const res = await processScan({ input: path.join(FX, "room-zcm.usdz"), format: "usdz", outDir: tmp, base: "usdz" });
    assert.equal(res.format, "usdz");
    assert.equal(res.stats.upAxis, "Z");
    assert.equal(res.stats.metersPerUnit, 0.01);
    assert.equal(res.stats.after.tris, 14);
    assert.deepEqual(res.stats.size, [10, 9, 8]);
    assert.equal(res.validation.errors, 0);
  });
});

describe("scan jobs on a throwaway PGLite (#378)", () => {
  it("queues, runs in a child process and records ready / failed", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    const root = path.join(here, "..", "..", "migrations");
    for (const f of ["0009_scan_assets.sql", "0011_scan_pipeline.sql"]) await pg.exec(await readFile(path.join(root, f), "utf8"));
    const sql = async (strings, ...values) => {
      let text = strings[0];
      for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
      return (await pg.query(text, values)).rows;
    };
    const store = path.join(tmp, "store");
    await mkdir(path.join(store, "u1"), { recursive: true });
    await copyFile(GLB, path.join(store, "u1", "a.glb"));
    await writeFile(path.join(store, "u1", "b.glb"), Buffer.from("not a model"));
    for (const id of ["a", "b"]) {
      await sql`insert into scan_assets (id, user_id, name, format, bytes, sha256, storage_key) values (${id}, 'u1', ${id + ".glb"}, 'glb', 1, 'x', ${"u1/" + id + ".glb"})`;
      await enqueueScan(sql, id, "u1");
    }
    assert.equal(await drainJobs(sql, store), 2);
    const rows = await sql`select id, status, status_reason, optimized_key, pipeline from scan_assets order by id`;
    assert.equal(rows[0].status, "ready");
    assert.match(rows[0].optimized_key, /^u1\/a\.opt\.[0-9a-f]{12}\.glb$/);
    assert.equal(rows[0].pipeline.stats.after.tris, 14);
    assert.equal(rows[1].status, "failed");
    assert.match(rows[1].status_reason, /not a 3D scan/);
    const jobs = await sql`select status, attempts from scan_jobs order by scan_id`;
    assert.deepEqual(jobs.map((j) => [j.status, j.attempts]), [["done", 1], ["failed", 1]]);
    await pg.close();
  });
});
