// NDU-AI safe-ingest #3: scan auto-cleanup (units, degenerate triangles, floaters, Draco/meshopt).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupOptions, dropDegenerate, guessUnits, removeFloaters } from "./cleanup.mjs";
import { processScan, PRESETS } from "./pipeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.join(here, "fixtures", "smoke-room.glb");
const close = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;
let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "ndu-cleanup-"));
});

/** A room-sized box (12 tris) plus `islands` tiny far-away specks (1 tri each) and 2 degenerate tris. */
async function noisyDoc(islands = 3) {
  const { Document } = await import("@gltf-transform/core");
  const doc = new Document();
  const buf = doc.createBuffer();
  const v = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 3, 0],
    [0, 3, 0],
    [0, 0, 5],
    [4, 0, 5],
    [4, 3, 5],
    [0, 3, 5],
  ];
  const f = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5,
    6, 1, 6, 2,
  ];
  for (let i = 0; i < islands; i += 1) {
    const b = v.length;
    v.push([2 + i * 0.01, 1, 2], [2.02 + i * 0.01, 1, 2], [2 + i * 0.01, 1.02, 2]);
    f.push(b, b + 1, b + 2);
  }
  f.push(0, 0, 1); // repeated index
  f.push(0, 1, 1);
  const pos = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(v.flat()))
    .setBuffer(buf);
  const idx = doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(f)).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute("POSITION", pos).setIndices(idx);
  const mesh = doc.createMesh("room").addPrimitive(prim);
  doc.createScene("s").addChild(doc.createNode("n").setMesh(mesh));
  return doc;
}

describe("scan auto-cleanup (#3)", () => {
  it("guesses cm / mm / inch exports and leaves metre files alone", () => {
    const L = PRESETS.limits;
    assert.equal(guessUnits(8, L), null);
    assert.deepEqual(guessUnits(1000, L), { unit: "cm", factor: 0.01 });
    assert.deepEqual(guessUnits(80000, L), { unit: "mm", factor: 0.001 });
    assert.equal(guessUnits(1e10, L), null);
  });

  it("flags default to: units on, denoise off, meshopt", () => {
    assert.deepEqual(cleanupOptions({}), { autoUnits: true, denoise: false, compress: "meshopt" });
    assert.deepEqual(
      cleanupOptions({ SCAN_AUTO_UNITS: "off", SCAN_DENOISE: "on", SCAN_COMPRESS: "draco" }),
      { autoUnits: false, denoise: true, compress: "draco" },
    );
  });

  it("drops degenerate triangles and tiny floaters, keeps the room", async () => {
    const doc = await noisyDoc(3);
    assert.equal(dropDegenerate(doc), 2);
    const res = removeFloaters(doc);
    assert.deepEqual(res, { islands: 3, tris: 3 });
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    assert.equal(prim.getIndices().getCount() / 3, 12);
  });

  it("keeps islands that are big enough to be real parts", async () => {
    const doc = await noisyDoc(0);
    assert.deepEqual(removeFloaters(doc), { islands: 0, tris: 0 });
  });

  it("rescales a centimetre export to metres instead of refusing it", async () => {
    const { NodeIO } = await import("@gltf-transform/core");
    const io = new NodeIO();
    const doc = await io.read(GLB);
    for (const node of doc.getRoot().listNodes()) node.setScale([100, 100, 100]);
    const cm = path.join(tmp, "cm.glb");
    await io.write(cm, doc);
    const res = await processScan({ input: cm, format: "glb", outDir: tmp, base: "cm" });
    assert.equal(res.stats.cleanup.unitFix, "cm");
    assert.deepEqual(res.stats.size, [10, 9, 8]);
    await assert.rejects(
      processScan({
        input: cm,
        format: "glb",
        outDir: tmp,
        base: "cm2",
        cleanup: { autoUnits: false },
      }),
      /m across/,
    );
  });

  it("compresses with Draco when asked, and the result reads back centred on the floor", async () => {
    const res = await processScan({
      input: GLB,
      format: "glb",
      outDir: tmp,
      base: "draco",
      cleanup: { compress: "draco" },
    });
    assert.equal(res.stats.cleanup.compression, "draco");
    assert.equal(res.validation.errors, 0);
    const { NodeIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const { getBounds } = await import("@gltf-transform/functions");
    const draco3d = (await import("draco3dgltf")).default;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
    const doc = await io.read(path.join(tmp, res.optimized.file));
    assert.ok(
      doc
        .getRoot()
        .listExtensionsUsed()
        .some((e) => e.extensionName === "KHR_draco_mesh_compression"),
    );
    const { min, max } = getBounds(doc.getRoot().getDefaultScene());
    assert.ok(close(min[1], 0) && close(max[1], 9), `y ${min[1]}..${max[1]}`);
    assert.ok(close(min[0], -5) && close(max[0], 5), `x ${min[0]}..${max[0]}`);
  });

  it("reports what cleanup did on the golden fixture (nothing to remove, meshopt)", async () => {
    const res = await processScan({ input: GLB, format: "glb", outDir: tmp, base: "gold2" });
    assert.deepEqual(res.stats.cleanup, {
      unitFix: null,
      degenerate: 0,
      floaters: null,
      compression: "meshopt",
    });
  });
});
