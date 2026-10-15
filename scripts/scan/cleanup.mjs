// @ts-check
/**
 * NDU-AI safe ingest #3: scan auto-cleanup steps used by pipeline.mjs (server CPU, gltf-transform).
 * The pipeline already welds, decimates to the preset budget, re-centres on the floor and meshopt-compresses
 * (#355/#380). This adds:
 *   - unit normalisation: a scan exported in centimetres / millimetres / inches is rescaled to metres instead
 *     of being rejected (SCAN_AUTO_UNITS, default on);
 *   - degenerate-triangle removal (always; zero-area and repeated-index triangles only);
 *   - floater removal: tiny detached islands far smaller than the scan (SCAN_DENOISE, default OFF, because
 *     authored models can have small separate parts on purpose);
 *   - Draco as an alternative to meshopt (SCAN_COMPRESS=draco|meshopt, default meshopt; the map loader reads both).
 */

/** @typedef {{ autoUnits: boolean, denoise: boolean, compress: "meshopt" | "draco" }} CleanupOptions */

const on = (v, dflt) => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (["1", "on", "true", "yes"].includes(s)) return true;
  if (["0", "off", "false", "no"].includes(s)) return false;
  return dflt;
};

/** @returns {CleanupOptions} */
export function cleanupOptions(env = process.env) {
  return {
    autoUnits: on(env.SCAN_AUTO_UNITS, true),
    denoise: on(env.SCAN_DENOISE, false),
    compress:
      String(env.SCAN_COMPRESS ?? "")
        .trim()
        .toLowerCase() === "draco"
        ? "draco"
        : "meshopt",
  };
}

const UNITS = /** @type {const} */ ([
  ["cm", 0.01],
  ["mm", 0.001],
  ["in", 0.0254],
]);

/**
 * Largest side `side` (in file units, assumed metres) is outside [minSideM, maxSideM]: is it plausibly a
 * metric/imperial export? Returns the factor that lands it inside the limits, preferring the smallest change.
 * @param {number} side
 * @param {{ minSideM: number, maxSideM: number }} limits
 * @returns {{ unit: string, factor: number } | null}
 */
export function guessUnits(side, limits) {
  if (!(side > 0) || side <= limits.maxSideM) return null;
  for (const [unit, factor] of UNITS) {
    const m = side * factor;
    if (m >= limits.minSideM && m <= limits.maxSideM) return { unit, factor };
  }
  return null;
}

/**
 * Wrap the default scene in one scale node (meshes untouched, like the USD fix).
 * @param {import("@gltf-transform/core").Document} doc
 * @param {number} factor
 */
export function applyScale(doc, factor) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return;
  const holder = doc.createNode("ndu-unit-fix").setScale([factor, factor, factor]);
  for (const child of scene.listChildren()) holder.addChild(child);
  scene.addChild(holder);
}

/** @param {import("@gltf-transform/core").Primitive} prim */
function triangleIndices(prim) {
  if (prim.getMode() !== 4) return null;
  const idx = prim.getIndices();
  const count = idx ? idx.getCount() : (prim.getAttribute("POSITION")?.getCount() ?? 0);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = idx ? idx.getScalar(i) : i;
  return out;
}

/**
 * Rebuild a primitive's index buffer from `keep` triangles.
 * @param {import("@gltf-transform/core").Document} doc
 * @param {import("@gltf-transform/core").Primitive} prim
 * @param {Uint32Array} tris
 * @param {(t: number) => boolean} keep
 */
function rewriteIndices(doc, prim, tris, keep) {
  const kept = [];
  for (let t = 0; t < tris.length / 3; t += 1)
    if (keep(t)) kept.push(tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]);
  if (kept.length === tris.length) return 0;
  const vertexCount = prim.getAttribute("POSITION")?.getCount() ?? 0;
  const arr = vertexCount > 65535 ? new Uint32Array(kept) : new Uint16Array(kept);
  const old = prim.getIndices();
  const acc = doc.createAccessor().setType("SCALAR").setArray(arr);
  const buf = old?.getBuffer() ?? doc.getRoot().listBuffers()[0];
  if (buf) acc.setBuffer(buf);
  prim.setIndices(acc);
  if (old && old.listParents().length <= 1) old.dispose();
  return (tris.length - kept.length) / 3;
}

/**
 * Drop zero-area and repeated-index triangles (they render nothing and confuse the simplifier).
 * @param {import("@gltf-transform/core").Document} doc
 * @returns {number} triangles removed
 */
export function dropDegenerate(doc) {
  let removed = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const tris = triangleIndices(prim);
      const pos = prim.getAttribute("POSITION");
      if (!tris || !pos) continue;
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const c = [0, 0, 0];
      removed += rewriteIndices(doc, prim, tris, (t) => {
        const i = tris[t * 3];
        const j = tris[t * 3 + 1];
        const k = tris[t * 3 + 2];
        if (i === j || j === k || i === k) return false;
        pos.getElement(i, a);
        pos.getElement(j, b);
        pos.getElement(k, c);
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          uz = b[2] - a[2];
        const vx = c[0] - a[0],
          vy = c[1] - a[1],
          vz = c[2] - a[2];
        const cx = uy * vz - uz * vy,
          cy = uz * vx - ux * vz,
          cz = ux * vy - uy * vx;
        return cx * cx + cy * cy + cz * cz > 1e-20;
      });
    }
  }
  return removed;
}

/**
 * Remove "floaters": connected islands (by shared vertices, after weld) that are both a tiny share of the
 * triangles and tiny next to the whole model. Works per primitive in local space.
 * @param {import("@gltf-transform/core").Document} doc
 * @param {{ maxTriShare?: number, maxSizeShare?: number }} [opts]
 * @returns {{ islands: number, tris: number }}
 */
export function removeFloaters(doc, opts = {}) {
  const maxTriShare = opts.maxTriShare ?? 0.005;
  const maxSizeShare = opts.maxSizeShare ?? 0.03;
  let islands = 0;
  let removedTris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const tris = triangleIndices(prim);
      const pos = prim.getAttribute("POSITION");
      if (!tris || !pos || tris.length < 9) continue;
      const n = pos.getCount();
      const parent = new Uint32Array(n);
      for (let i = 0; i < n; i += 1) parent[i] = i;
      const find = (x) => {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };
      for (let t = 0; t < tris.length; t += 3) {
        const r = find(tris[t]);
        parent[find(tris[t + 1])] = r;
        parent[find(tris[t + 2])] = r;
      }
      /** @type {Map<number, { tris: number, min: number[], max: number[] }>} */
      const comps = new Map();
      const p = [0, 0, 0];
      const gmin = [Infinity, Infinity, Infinity];
      const gmax = [-Infinity, -Infinity, -Infinity];
      for (let t = 0; t < tris.length; t += 3) {
        const r = find(tris[t]);
        let c = comps.get(r);
        if (!c)
          comps.set(
            r,
            (c = {
              tris: 0,
              min: [Infinity, Infinity, Infinity],
              max: [-Infinity, -Infinity, -Infinity],
            }),
          );
        c.tris += 1;
        for (let k = 0; k < 3; k += 1) {
          pos.getElement(tris[t + k], p);
          for (let d = 0; d < 3; d += 1) {
            c.min[d] = Math.min(c.min[d], p[d]);
            c.max[d] = Math.max(c.max[d], p[d]);
            gmin[d] = Math.min(gmin[d], p[d]);
            gmax[d] = Math.max(gmax[d], p[d]);
          }
        }
      }
      if (comps.size < 2) continue;
      const total = tris.length / 3;
      const diag = Math.hypot(gmax[0] - gmin[0], gmax[1] - gmin[1], gmax[2] - gmin[2]);
      let biggest = 0;
      for (const c of comps.values()) biggest = Math.max(biggest, c.tris);
      const drop = new Set();
      for (const [r, c] of comps) {
        const size = Math.hypot(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]);
        if (
          c.tris < biggest &&
          c.tris <= Math.max(1, total * maxTriShare) &&
          size <= diag * maxSizeShare
        )
          drop.add(r);
      }
      if (!drop.size) continue;
      islands += drop.size;
      removedTris += rewriteIndices(doc, prim, tris, (t) => !drop.has(find(tris[t * 3])));
    }
  }
  return { islands, tris: removedTris };
}

/**
 * Final compression step.
 * @param {import("@gltf-transform/core").Document} doc
 * @param {"meshopt" | "draco"} kind
 */
export async function compress(doc, kind) {
  const fns = await import("@gltf-transform/functions");
  if (kind === "draco") {
    await doc.transform(fns.draco({ method: "edgebreaker", quantizePosition: 14 }));
    return "draco";
  }
  const { MeshoptEncoder } = await import("meshoptimizer");
  await MeshoptEncoder.ready;
  await doc.transform(fns.meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  return "meshopt";
}
